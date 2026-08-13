import { PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { isValidSolanaAddress } from "./address";
import { buildP2eMessage, type P2eAction } from "./p2e-message";

const MAX_AGE_MS = 5 * 60 * 1000;
const seenNonces = new Map<string, number>();

function pruneNonces(now: number) {
  for (const [nonce, exp] of seenNonces) {
    if (exp < now) seenNonces.delete(nonce);
  }
}

export type P2eAuth = {
  action: P2eAction;
  wallet: string;
  nonce: string;
  issuedAt: string;
  signature: string;
  matchId?: string;
};

export function verifyP2eAuth(auth: P2eAuth): { ok: true } | { ok: false; error: string } {
  if (!isValidSolanaAddress(auth.wallet)) {
    return { ok: false, error: "Invalid wallet address." };
  }
  if (
    !auth.nonce ||
    auth.nonce.length < 16 ||
    auth.nonce.length > 80 ||
    !/^[a-zA-Z0-9_-]+$/.test(auth.nonce)
  ) {
    return { ok: false, error: "Invalid nonce." };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(auth.issuedAt)) {
    return { ok: false, error: "Invalid signature timestamp." };
  }
  const issued = Date.parse(auth.issuedAt);
  if (!Number.isFinite(issued)) {
    return { ok: false, error: "Invalid signature timestamp." };
  }
  const now = Date.now();
  if (Math.abs(now - issued) > MAX_AGE_MS) {
    return { ok: false, error: "Signature expired. Sign again." };
  }
  pruneNonces(now);
  if (seenNonces.size > 8000) {
    const oldest = seenNonces.keys().next().value;
    if (oldest) seenNonces.delete(oldest);
  }
  if (seenNonces.has(`${auth.wallet}:${auth.nonce}`)) {
    return { ok: false, error: "Signature already used." };
  }

  const message = buildP2eMessage({
    action: auth.action,
    wallet: auth.wallet,
    nonce: auth.nonce,
    issuedAt: auth.issuedAt,
    matchId: auth.matchId,
  });
  let sig: Uint8Array;
  try {
    sig = bs58.decode(auth.signature);
  } catch {
    return { ok: false, error: "Invalid signature encoding." };
  }
  if (sig.length !== 64) {
    return { ok: false, error: "Invalid signature." };
  }

  try {
    const pubkey = new PublicKey(auth.wallet).toBytes();
    const msg = new TextEncoder().encode(message);
    const good = ed25519.verify(sig, msg, pubkey, { zip215: false });
    if (!good) return { ok: false, error: "Wallet signature check failed." };
  } catch {
    return { ok: false, error: "Wallet signature check failed." };
  }

  seenNonces.set(`${auth.wallet}:${auth.nonce}`, now + MAX_AGE_MS);
  return { ok: true };
}
