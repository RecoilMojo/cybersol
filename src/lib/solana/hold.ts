import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config";
import { isGuestWallet, isValidSolanaAddress } from "./address";
import { serverRpcUrl } from "./server-rpc";

const RPC_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

let rpcConn: Connection | null = null;
let rpcConnUrl = "";

function rpcConnection(): Connection {
  const url = serverRpcUrl();
  if (!rpcConn || rpcConnUrl !== url) {
    rpcConn = new Connection(url, {
      commitment: "confirmed",
      fetch: fetchWithTimeout,
    });
    rpcConnUrl = url;
  }
  return rpcConn;
}

export type HoldCheckResult = {
  eligible: boolean;
  balance: number;
  threshold: number;
  mintConfigured: boolean;
  reason?: string;
};

const HOLD_TTL_MS = 15_000;
const holdCache = new Map<string, { at: number; value: HoldCheckResult }>();

function cachedHold(wallet: string): HoldCheckResult | null {
  const hit = holdCache.get(wallet);
  if (!hit) return null;
  if (Date.now() - hit.at > HOLD_TTL_MS) {
    holdCache.delete(wallet);
    return null;
  }
  return hit.value;
}

function rememberHold(wallet: string, value: HoldCheckResult) {
  if (value.reason === "RPC hold check failed. Try again.") return;
  if (holdCache.size > 800) {
    const first = holdCache.keys().next().value;
    if (first) holdCache.delete(first);
  }
  holdCache.set(wallet, { at: Date.now(), value });
}

/**
 * Check if wallet holds enough $CYBERSOL for P2E.
 * If mint is not configured yet (pre-token), P2E is disabled.
 */
export async function checkTokenHold(wallet: string): Promise<HoldCheckResult> {
  const threshold = config.holdThreshold;
  if (isGuestWallet(wallet) || !isValidSolanaAddress(wallet)) {
    return {
      eligible: false,
      balance: 0,
      threshold,
      mintConfigured: Boolean(config.tokenMint),
      reason: "Connect a Solana wallet for P2E.",
    };
  }
  if (!config.tokenMint) {
    return {
      eligible: false,
      balance: 0,
      threshold,
      mintConfigured: false,
      reason: "Token mint not configured yet. Free play is open; P2E unlocks at token launch.",
    };
  }

  const cached = cachedHold(wallet);
  if (cached) return cached;

  try {
    const connection = rpcConnection();
    const owner = new PublicKey(wallet);
    const mint = new PublicKey(config.tokenMint);
    const resp = await connection.getParsedTokenAccountsByOwner(owner, { mint });
    let balance = 0;
    for (const acc of resp.value) {
      const amount = acc.account.data.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof amount === "number") balance += amount;
    }
    const result: HoldCheckResult = {
      eligible: balance >= threshold,
      balance,
      threshold,
      mintConfigured: true,
      reason:
        balance >= threshold
          ? undefined
          : `Need ≥ ${threshold.toLocaleString("en-US")} $CYBERSOL (you have ${balance}).`,
    };
    rememberHold(wallet, result);
    return result;
  } catch (err) {
    console.error("hold check failed", err);
    return {
      eligible: false,
      balance: 0,
      threshold,
      mintConfigured: true,
      reason: "RPC hold check failed. Try again.",
    };
  }
}
