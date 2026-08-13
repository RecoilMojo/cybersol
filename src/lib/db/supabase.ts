import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";
import { P2E_MATCH_TTL_MS, P2eActiveExistsError } from "@/lib/p2e-rules";
import type { GameInput } from "@/lib/game/types";
import type {
  FinishMatchResult,
  LeaderboardEntry,
  MatchMode,
  MatchRow,
  MatchStatus,
  PlayerRow,
  RaffleRound,
  TicketRow,
} from "./types";

let client: SupabaseClient | null = null;

/** Project root only — strips quotes, trailing slash, and a pasted /rest/v1 path. */
export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  }
}

export function publicDbError(err: unknown): string {
  const rec = err as { code?: string; message?: string; details?: string; cause?: unknown };
  const blob = [rec.code, rec.message, rec.details, rec.cause, err instanceof Error ? err.message : err]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (blob.includes("enotfound") || blob.includes("fetch failed") || blob.includes("getaddrinfo")) {
    return "Can't reach the database. Copy the Project URL from Supabase → Settings → API into Vercel SUPABASE_URL (no /rest/v1), then Redeploy.";
  }
  if (blob.includes("invalid api key") || blob.includes("invalid jwt")) {
    return "Database key rejected. Use the service_role or sb_secret_ key, not anon/publishable.";
  }
  if (
    rec.code === "42P01" ||
    rec.code === "PGRST205" ||
    blob.includes("schema cache") ||
    blob.includes("does not exist")
  ) {
    return "Database tables are missing. Run supabase/schema.sql in the Supabase SQL editor.";
  }
  if (blob.includes("row-level security") || rec.code === "42501") {
    return "Database blocked the write. SUPABASE_SERVICE_ROLE_KEY must be service_role or sb_secret_.";
  }
  return "Server error";
}

function sb(): SupabaseClient {
  if (!client) {
    const url = normalizeSupabaseUrl(
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    );
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
    client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return client;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const supabaseDb = {
  async ensurePlayer(wallet: string): Promise<PlayerRow> {
    const { data: existing } = await sb()
      .from("players")
      .select("*")
      .eq("wallet", wallet)
      .maybeSingle();
    if (existing) return existing as PlayerRow;
    const { data, error } = await sb()
      .from("players")
      .insert({ wallet })
      .select("*")
      .single();
    if (error) throw error;
    return data as PlayerRow;
  },

  async createMatch(wallet: string, seed: string, mode: MatchMode): Promise<MatchRow> {
    await this.ensurePlayer(wallet);
    const { data, error } = await sb()
      .from("matches")
      .insert({ wallet, seed, mode, status: "active" })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505" && mode === "p2e") throw new P2eActiveExistsError();
      throw error;
    }
    return data as MatchRow;
  },

  async getMatch(id: string): Promise<MatchRow | null> {
    const { data } = await sb().from("matches").select("*").eq("id", id).maybeSingle();
    return (data as MatchRow) ?? null;
  },

  async abandonStaleP2eMatches(wallet: string): Promise<number> {
    const cutoff = new Date(Date.now() - P2E_MATCH_TTL_MS).toISOString();
    const { data, error } = await sb()
      .from("matches")
      .update({ status: "abandoned", finished_at: new Date().toISOString() })
      .eq("wallet", wallet)
      .eq("mode", "p2e")
      .eq("status", "active")
      .lt("created_at", cutoff)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  },

  async countActiveP2eMatches(wallet: string): Promise<number> {
    const { count } = await sb()
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("wallet", wallet)
      .eq("mode", "p2e")
      .eq("status", "active");
    return count ?? 0;
  },

  async countP2eFinishedToday(wallet: string): Promise<number> {
    const start = `${todayUtc()}T00:00:00.000Z`;
    const end = new Date(Date.parse(start) + 86_400_000).toISOString();
    const { count } = await sb()
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("wallet", wallet)
      .eq("mode", "p2e")
      .in("status", ["won", "lost"])
      .gte("finished_at", start)
      .lt("finished_at", end);
    return count ?? 0;
  },

  async finishMatch(
    id: string,
    status: MatchStatus,
    inputs: GameInput[],
    winner: string | null,
    turns: number,
  ): Promise<FinishMatchResult> {
    const match = await this.getMatch(id);
    if (!match) return { match: null, claimed: false };
    if (match.status !== "active") return { match, claimed: false };

    const { data, error } = await sb()
      .from("matches")
      .update({
        status,
        inputs,
        winner,
        turns,
        finished_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "active")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const current = await this.getMatch(id);
      return { match: current, claimed: false };
    }

    if (status === "won" || status === "lost") {
      const player = await this.ensurePlayer(match.wallet);
      await sb()
        .from("players")
        .update({
          wins: player.wins + (status === "won" ? 1 : 0),
          losses: player.losses + (status === "lost" ? 1 : 0),
        })
        .eq("wallet", match.wallet);
    }
    return { match: data as MatchRow, claimed: true };
  },

  async countTicketsToday(wallet: string): Promise<number> {
    const day = todayUtc();
    const { count } = await sb()
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("wallet", wallet)
      .eq("day_utc", day);
    return count ?? 0;
  },

  async grantTicket(wallet: string, matchId: string): Promise<TicketRow | null> {
    const day = todayUtc();
    const rpc = await sb().rpc("grant_raffle_ticket", {
      p_wallet: wallet,
      p_match_id: matchId,
      p_max: config.maxTicketsPerDay,
    });
    if (!rpc.error) return (rpc.data as TicketRow | null) ?? null;
    const missingFn =
      rpc.error.code === "PGRST202" ||
      rpc.error.code === "42883" ||
      /grant_raffle_ticket/i.test(rpc.error.message ?? "");
    if (!missingFn) throw rpc.error;

    const count = await this.countTicketsToday(wallet);
    if (count >= config.maxTicketsPerDay) return null;

    const { data: existing } = await sb()
      .from("tickets")
      .select("*")
      .eq("match_id", matchId)
      .maybeSingle();
    if (existing) return existing as TicketRow;

    const { data, error } = await sb()
      .from("tickets")
      .insert({ wallet, match_id: matchId, day_utc: day })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        const { data: raced } = await sb()
          .from("tickets")
          .select("*")
          .eq("match_id", matchId)
          .maybeSingle();
        return (raced as TicketRow) ?? null;
      }
      throw error;
    }

    await sb()
      .from("players")
      .update({ tickets_total: (await this.ensurePlayer(wallet)).tickets_total + 1 })
      .eq("wallet", wallet);

    return data as TicketRow;
  },

  async leaderboard(): Promise<LeaderboardEntry[]> {
    const day = todayUtc();
    const { data: players } = await sb()
      .from("players")
      .select("*")
      .not("wallet", "like", "guest_%")
      .order("tickets_total", { ascending: false })
      .limit(50);
    const { data: todayTickets } = await sb()
      .from("tickets")
      .select("wallet")
      .eq("day_utc", day);

    const todayCount = new Map<string, number>();
    for (const t of todayTickets ?? []) {
      if (String(t.wallet).startsWith("guest_")) continue;
      todayCount.set(t.wallet, (todayCount.get(t.wallet) ?? 0) + 1);
    }

    return ((players as PlayerRow[]) ?? [])
      .map((p) => ({
        wallet: p.wallet,
        wins: p.wins,
        tickets_total: p.tickets_total,
        tickets_today: todayCount.get(p.wallet) ?? 0,
      }))
      .sort((a, b) => b.tickets_today - a.tickets_today || b.wins - a.wins);
  },

  async ticketsForDay(day: string): Promise<TicketRow[]> {
    const { data } = await sb().from("tickets").select("*").eq("day_utc", day);
    return (data as TicketRow[]) ?? [];
  },

  async saveRaffle(round: RaffleRound): Promise<void> {
    const { error } = await sb().from("raffle_rounds").upsert(round);
    if (error) throw error;
  },

  async getRaffle(day: string): Promise<RaffleRound | null> {
    const { data } = await sb()
      .from("raffle_rounds")
      .select("*")
      .eq("day_utc", day)
      .maybeSingle();
    return (data as RaffleRound) ?? null;
  },

  async getLatestPaidRaffle(): Promise<RaffleRound | null> {
    const { data } = await sb()
      .from("raffle_rounds")
      .select("*")
      .eq("paid", true)
      .order("day_utc", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as RaffleRound) ?? null;
  },
};
