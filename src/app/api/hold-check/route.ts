import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { checkTokenHold } from "@/lib/solana/hold";
import { isValidSolanaAddress } from "@/lib/solana/address";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { rejectBadOrigin } from "@/lib/http";

export async function GET(req: Request) {
  const badOrigin = rejectBadOrigin(req);
  if (badOrigin) return badOrigin;

  const ipLimit = rateLimit(`hold:${clientIp(req)}`, 20, 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Too many hold checks." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }
  if (!isValidSolanaAddress(wallet)) {
    return NextResponse.json({
      eligible: false,
      balance: 0,
      threshold: config.holdThreshold,
      mintConfigured: Boolean(config.tokenMint),
      reason: "Connect a Solana wallet for P2E.",
    });
  }
  const hold = await checkTokenHold(wallet);
  return NextResponse.json(hold, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
  });
}
