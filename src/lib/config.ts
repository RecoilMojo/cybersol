function resolveRpcUrl(): string {
  return process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";
}

/** Client-safe config. Never put service-role keys or HELIUS_API_KEY here. */
export const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  network: process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "mainnet-beta",
  rpcUrl: resolveRpcUrl(),
  tokenMint: process.env.NEXT_PUBLIC_TOKEN_MINT ?? "",
  holdThreshold: Number(process.env.NEXT_PUBLIC_HOLD_THRESHOLD ?? "10000"),
  maxTicketsPerDay: Number(process.env.MAX_TICKETS_PER_DAY ?? "3"),
  rafflePoolSol: Number(process.env.RAFFLE_POOL_SOL ?? "0.5"),
  raffleWinners: Number(process.env.RAFFLE_WINNERS ?? "3"),
  rewardsWallet: process.env.NEXT_PUBLIC_REWARDS_WALLET ?? "",
};
