export type P2eAction = "start-match" | "submit-match";

export function buildP2eMessage(opts: {
  action: P2eAction;
  wallet: string;
  nonce: string;
  issuedAt: string;
  matchId?: string;
}) {
  const lines = [
    "Cybersol P2E",
    `Action: ${opts.action}`,
    `Wallet: ${opts.wallet}`,
    `Nonce: ${opts.nonce}`,
    `Issued: ${opts.issuedAt}`,
  ];
  if (opts.matchId) lines.push(`Match: ${opts.matchId}`);
  return lines.join("\n");
}
