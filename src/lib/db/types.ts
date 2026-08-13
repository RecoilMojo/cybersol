import type { GameInput } from "@/lib/game/types";

export type MatchMode = "free" | "p2e";
export type MatchStatus = "active" | "won" | "lost" | "invalid" | "abandoned";

export type FinishMatchResult = {
  match: MatchRow | null;
  /** True only when this call transitioned the row from active. */
  claimed: boolean;
};

export type MatchRow = {
  id: string;
  wallet: string;
  seed: string;
  mode: MatchMode;
  status: MatchStatus;
  inputs: GameInput[] | null;
  winner: string | null;
  turns: number | null;
  created_at: string;
  finished_at: string | null;
};

export type TicketRow = {
  id: string;
  wallet: string;
  match_id: string;
  day_utc: string;
  created_at: string;
};

export type PlayerRow = {
  wallet: string;
  created_at: string;
  wins: number;
  losses: number;
  tickets_total: number;
};

export type RaffleRound = {
  id: string;
  day_utc: string;
  pool_sol: number;
  winners_count: number;
  winners: { wallet: string; ticketId: string; amountSol: number }[];
  paid: boolean;
  tx_sigs: string[];
  created_at: string;
  paid_at: string | null;
};

export type LeaderboardEntry = {
  wallet: string;
  wins: number;
  tickets_total: number;
  tickets_today: number;
};
