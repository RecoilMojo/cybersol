import { buildP2eMessage, type P2eAction } from "./p2e-message";
import bs58 from "bs58";

export async function signP2eRequest(
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | undefined,
  opts: { action: P2eAction; wallet: string; matchId?: string },
) {
  if (!signMessage) {
    throw new Error("This wallet cannot sign messages. Use Phantom or Solflare.");
  }
  const nonce =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const issuedAt = new Date().toISOString();
  const message = buildP2eMessage({ ...opts, nonce, issuedAt });
  const sig = await signMessage(new TextEncoder().encode(message));
  return {
    nonce,
    issuedAt,
    signature: bs58.encode(sig),
  };
}
