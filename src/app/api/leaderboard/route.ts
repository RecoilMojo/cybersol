import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, rejectBadOrigin } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const badOrigin = rejectBadOrigin(req);
    if (badOrigin) return badOrigin;

    const ipLimit = rateLimit(`lb:${clientIp(req)}`, 40, 60_000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
      );
    }

    const [entries, lastRound] = await Promise.all([
      db.leaderboard(),
      db.getLatestPaidRaffle(),
    ]);
    return NextResponse.json({
      entries,
      dayUtc: new Date().toISOString().slice(0, 10),
      raffle: {
        poolSol: config.rafflePoolSol,
        winnersCount: config.raffleWinners,
        maxTicketsPerDay: config.maxTicketsPerDay,
        holdThreshold: config.holdThreshold,
        rewardsWallet: config.rewardsWallet,
        lastRound,
      },
    });
  } catch (err) {
    return apiError(500, "Server error", err);
  }
}
