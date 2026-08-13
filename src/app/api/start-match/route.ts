import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkTokenHold } from "@/lib/solana/hold";
import { isGuestWallet, isValidSolanaAddress } from "@/lib/solana/address";
import { verifyP2eAuth } from "@/lib/solana/verify-p2e";
import { p2eAuthFields } from "@/lib/solana/p2e-auth-schema";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { P2E_MAX_ACTIVE_MATCHES, P2E_MAX_FINISHES_PER_DAY, P2eActiveExistsError } from "@/lib/p2e-rules";
import { apiError, readJsonBody, rejectBadOrigin } from "@/lib/http";
import type { MatchMode } from "@/lib/db/types";

const bodySchema = z.object({
  wallet: z.string().min(20).max(80),
  mode: z.enum(["free", "p2e"]).default("free"),
  nonce: p2eAuthFields.nonce.optional(),
  issuedAt: p2eAuthFields.issuedAt.optional(),
  signature: p2eAuthFields.signature.optional(),
});

export async function POST(req: Request) {
  try {
    const badOrigin = rejectBadOrigin(req);
    if (badOrigin) return badOrigin;

    const ip = clientIp(req);
    const ipLimit = rateLimit(`start:${ip}`, 8, 60_000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many match starts. Wait a bit." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
      );
    }
    const dayLimit = rateLimit(`start-day:${ip}`, 80, 24 * 60 * 60 * 1000);
    if (!dayLimit.ok) {
      return NextResponse.json(
        { error: "Daily match cap for this connection. Try again tomorrow." },
        { status: 429, headers: { "Retry-After": String(dayLimit.retryAfterSec) } },
      );
    }

    const body = await readJsonBody(req);
    if (!body.ok) return body.response;
    const parsed = bodySchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { wallet, mode } = parsed.data;
    let resolvedMode: MatchMode = mode;

    if (mode === "p2e") {
      if (isGuestWallet(wallet) || !isValidSolanaAddress(wallet)) {
        return NextResponse.json(
          { error: "Connect a Solana wallet for P2E mode." },
          { status: 403 },
        );
      }
      const walletLimit = rateLimit(`start-p2e:${wallet}`, 4, 60_000);
      if (!walletLimit.ok) {
        return NextResponse.json(
          { error: "Too many P2E starts for this wallet." },
          { status: 429, headers: { "Retry-After": String(walletLimit.retryAfterSec) } },
        );
      }
      const p2eDay = rateLimit(`p2e-day:${ip}`, 24, 24 * 60 * 60 * 1000);
      if (!p2eDay.ok) {
        return NextResponse.json(
          { error: "Daily P2E cap for this connection." },
          { status: 429, headers: { "Retry-After": String(p2eDay.retryAfterSec) } },
        );
      }
      if (!parsed.data.nonce || !parsed.data.issuedAt || !parsed.data.signature) {
        return NextResponse.json(
          { error: "P2E requires a wallet signature." },
          { status: 401 },
        );
      }
      const auth = verifyP2eAuth({
        action: "start-match",
        wallet,
        nonce: parsed.data.nonce,
        issuedAt: parsed.data.issuedAt,
        signature: parsed.data.signature,
      });
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
      }

      const hold = await checkTokenHold(wallet);
      if (!hold.eligible) {
        return NextResponse.json(
          { error: hold.reason ?? "Not eligible for P2E" },
          { status: 403 },
        );
      }

      await db.abandonStaleP2eMatches(wallet);
      const active = await db.countActiveP2eMatches(wallet);
      if (active >= P2E_MAX_ACTIVE_MATCHES) {
        return NextResponse.json(
          { error: "Finish your current P2E match before starting another." },
          { status: 409 },
        );
      }
      const finishedToday = await db.countP2eFinishedToday(wallet);
      if (finishedToday >= P2E_MAX_FINISHES_PER_DAY) {
        return NextResponse.json(
          { error: "Daily P2E match cap for this wallet. Free play is still open." },
          { status: 429 },
        );
      }
    } else {
      resolvedMode = "free";
      if (!isGuestWallet(wallet)) {
        return NextResponse.json(
          { error: "Free play uses a guest id. Connect a wallet for P2E." },
          { status: 400 },
        );
      }
    }

    const seed = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
    let match;
    try {
      match = await db.createMatch(wallet, seed, resolvedMode);
    } catch (err) {
      if (err instanceof P2eActiveExistsError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({
      matchId: match.id,
      seed: match.seed,
      mode: match.mode,
    });
  } catch (err) {
    return apiError(500, "Server error", err);
  }
}
