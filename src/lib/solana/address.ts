import { PublicKey } from "@solana/web3.js";

const GUEST_RE = /^guest_[a-zA-Z0-9]{16,64}$/;

export function isGuestWallet(wallet: string) {
  return GUEST_RE.test(wallet);
}

export function isValidSolanaAddress(wallet: string): boolean {
  if (!wallet || wallet.length < 32 || wallet.length > 44) return false;
  if (isGuestWallet(wallet)) return false;
  try {
    const key = new PublicKey(wallet);
    return PublicKey.isOnCurve(key.toBytes());
  } catch {
    return false;
  }
}
