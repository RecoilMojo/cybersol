import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { aiPolicy } from "@/lib/game/ai";
import { replayMatch } from "@/lib/game/engine";
import { checkTokenHold } from "@/lib/solana/hold";
import { isGuestWallet, isValidSolanaAddress } from "@/lib/solana/address";
import { verifyP2eAuth } from "@/lib/solana/verify-p2e";
import { p2eAuthFields } from "@/lib/solana/p2e-auth-schema";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, readJsonBody, rejectBadOrigin } from "@/lib/http";
import {
  P2E_MIN_DURATION_MS,
  P2E_MAX_DURATION_MS,
  P2E_MIN_PLAYS,
  P2E_MIN_PLAYER_INPUTS,
  P2E_MIN_TURNS,
  countTicketActions,
} from "@/lib/p2e-rules";

const inputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("play"),
    handIndex: z.number().int().min(0).max(20),
    boardIndex: z.number().int().min(0).max(8).optional(),
  }),
  z.object({
    type: z.literal("attack"),
    attackerIndex: z.number().int().min(0).max(8),
    target: z.union([z.literal("hero"), z.number().int().min(0).max(8)]),
  }),
  z.object({
    type: z.literal("activate"),
    boardIndex: z.number().int().min(0).max(8),
  }),
  z.object({ type: z.literal("hero_power") }),
  z.object({
    type: z.literal("choose_target"),
    target: z.union([z.literal("hero"), z.number().int().min(0).max(8)]),
    board: z.enum(["ally", "enemy"]).optional(),
  }),
  z.object({
    type: z.literal("choose_graveyard"),
    index: z.number().int().min(0).max(80),
  }),
  z.object({ type: z.literal("cancel_target") }),
  z.object({ type: z.literal("end_turn") }),
]);

const bodySchema = z.object({
  matchId: z.string().uuid(),
  wallet: z.string().min(20).max(80),
  inputs: z.array(inputSchema).max(200),
  nonce: p2eAuthFields.nonce.optional(),
  issuedAt: p2eAuthFields.issuedAt.optional(),
  signature: p2eAuthFields.signature.optional(),
});

export async function POST(req: Request) {
  try {
    const badOrigin = rejectBadOrigin(req);
    if (badOrigin) return badOrigin;

    const ip = clientIp(req);
    const ipLimit = rateLimit(`submit:${ip}`, 12, 60_000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many submissions. Wait a bit." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
      );
    }

    const body = await readJsonBody(req);
    if (!body.ok) return body.response;
    const parsed = bodySchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { matchId, wallet, inputs } = parsed.data;
    const match = await db.getMatch(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    if (match.wallet !== wallet) {
      return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
    }
    if (match.status !== "active") {
      return NextResponse.json(
        { error: "Match already finished", status: match.status },
        { status: 409 },
      );
    }

    if (match.mode === "free") {
      if (!isGuestWallet(wallet)) {
        return NextResponse.json(
          { error: "Free play uses a guest id. Connect a wallet for P2E." },
          { status: 400 },
        );
      }
    } else if (match.mode === "p2e") {
      if (isGuestWallet(wallet) || !isValidSolanaAddress(wallet)) {
        return NextResponse.json({ error: "Invalid P2E wallet." }, { status: 403 });
      }
      const elapsed = Date.now() - Date.parse(match.created_at);
      if (!Number.isFinite(elapsed) || elapsed > P2E_MAX_DURATION_MS) {
        await db.abandonStaleP2eMatches(wallet);
        return NextResponse.json(
          { error: "Match expired. Start a fresh P2E game." },
          { status: 410 },
        );
      }
      const submitWallet = rateLimit(`submit-p2e:${wallet}`, 8, 60_000);
      if (!submitWallet.ok) {
        return NextResponse.json(
          { error: "Too many P2E submissions for this wallet." },
          { status: 429, headers: { "Retry-After": String(submitWallet.retryAfterSec) } },
        );
      }
      if (!parsed.data.nonce || !parsed.data.issuedAt || !parsed.data.signature) {
        return NextResponse.json(
          { error: "P2E submit requires a wallet signature." },
          { status: 401 },
        );
      }
      const auth = verifyP2eAuth({
        action: "submit-match",
        wallet,
        nonce: parsed.data.nonce,
        issuedAt: parsed.data.issuedAt,
        signature: parsed.data.signature,
        matchId,
      });
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
      }
    }

    const result = replayMatch(match.seed, inputs, aiPolicy);
    const won = result.winner === "player";
    const status = won ? "won" : "lost";

    const { match: finished, claimed } = await db.finishMatch(
      matchId,
      status,
      inputs,
      result.winner,
      result.turn,
    );
    if (!finished) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    if (!claimed) {
      return NextResponse.json(
        { error: "Match already finished", status: finished.status },
        { status: 409 },
      );
    }

    let ticket = null;
    let ticketReason: string | null = null;
    let ticketsToday = await db.countTicketsToday(wallet);

    if (won && match.mode === "p2e") {
      const elapsed = Date.now() - Date.parse(match.created_at);
      const { actions, plays } = countTicketActions(result.appliedPlayerInputs);
      if (!Number.isFinite(elapsed) || elapsed < P2E_MIN_DURATION_MS) {
        ticketReason = "Match was too short for a raffle ticket. Play it out.";
      } else if (elapsed > P2E_MAX_DURATION_MS) {
        ticketReason = "Match ran too long for a raffle ticket. Start a fresh one.";
      } else if (result.turn < P2E_MIN_TURNS) {
        ticketReason = "Need a few turns before a ticket counts.";
      } else if (actions < P2E_MIN_PLAYER_INPUTS || plays < P2E_MIN_PLAYS) {
        ticketReason = "Not enough plays for a raffle ticket.";
      } else {
        const hold = await checkTokenHold(wallet);
        if (!hold.eligible) {
          ticketReason = hold.reason ?? "Hold check failed at ticket grant.";
        } else {
          ticket = await db.grantTicket(wallet, matchId);
          ticketsToday = await db.countTicketsToday(wallet);
          if (!ticket && ticketsToday >= config.maxTicketsPerDay) {
            ticketReason = "Daily ticket cap reached.";
          }
        }
      }
    }

    return NextResponse.json({
      status,
      winner: result.winner,
      turns: result.turn,
      mode: match.mode,
      ticketGranted: Boolean(ticket),
      ticketId: ticket?.id ?? null,
      ticketReason,
      ticketsToday,
      maxTicketsPerDay: config.maxTicketsPerDay,
    });
  } catch (err) {
    return apiError(500, "Server error", err);
  }
}
