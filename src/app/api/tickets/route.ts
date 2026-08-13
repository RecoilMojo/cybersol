import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { isGuestWallet, isValidSolanaAddress } from "@/lib/solana/address";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, rejectBadOrigin } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const badOrigin = rejectBadOrigin(req);
    if (badOrigin) return badOrigin;

    const ipLimit = rateLimit(`tickets:${clientIp(req)}`, 20, 60_000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
      );
    }

    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");
    if (!wallet) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }
    if (!isGuestWallet(wallet) && !isValidSolanaAddress(wallet)) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }
    const ticketsToday = await db.countTicketsToday(wallet);
    return NextResponse.json({
      wallet,
      ticketsToday,
      maxTicketsPerDay: config.maxTicketsPerDay,
      remaining: Math.max(0, config.maxTicketsPerDay - ticketsToday),
    });
  } catch (err) {
    return apiError(500, "Server error", err);
  }
}
