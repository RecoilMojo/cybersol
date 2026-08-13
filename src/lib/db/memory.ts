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
import type { GameInput } from "@/lib/game/types";
import { config } from "@/lib/config";
import { P2E_MATCH_TTL_MS, P2eActiveExistsError } from "@/lib/p2e-rules";

const g = globalThis as unknown as {
  __cybersolStore?: {
    players: Map<string, PlayerRow>;
    matches: Map<string, MatchRow>;
    tickets: TicketRow[];
    raffles: Map<string, RaffleRound>;
  };
};

function store() {
  if (!g.__cybersolStore) {
    g.__cybersolStore = {
      players: new Map(),
      matches: new Map(),
      tickets: [],
      raffles: new Map(),
    };
  }
  return g.__cybersolStore;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const memoryDb = {
  async ensurePlayer(wallet: string): Promise<PlayerRow> {
    const s = store();
    let p = s.players.get(wallet);
    if (!p) {
      p = {
        wallet,
        created_at: new Date().toISOString(),
        wins: 0,
        losses: 0,
        tickets_total: 0,
      };
      s.players.set(wallet, p);
    }
    return p;
  },

  async createMatch(wallet: string, seed: string, mode: MatchMode): Promise<MatchRow> {
    await this.ensurePlayer(wallet);
    if (mode === "p2e") {
      const active = await this.countActiveP2eMatches(wallet);
      if (active >= 1) throw new P2eActiveExistsError();
    }
    const row: MatchRow = {
      id: crypto.randomUUID(),
      wallet,
      seed,
      mode,
      status: "active",
      inputs: null,
      winner: null,
      turns: null,
      created_at: new Date().toISOString(),
      finished_at: null,
    };
    store().matches.set(row.id, row);
    return row;
  },

  async getMatch(id: string): Promise<MatchRow | null> {
    return store().matches.get(id) ?? null;
  },

  async abandonStaleP2eMatches(wallet: string): Promise<number> {
    const cutoff = Date.now() - P2E_MATCH_TTL_MS;
    let n = 0;
    for (const m of store().matches.values()) {
      if (
        m.wallet === wallet &&
        m.mode === "p2e" &&
        m.status === "active" &&
        Date.parse(m.created_at) < cutoff
      ) {
        m.status = "abandoned";
        m.finished_at = new Date().toISOString();
        n += 1;
      }
    }
    return n;
  },

  async countActiveP2eMatches(wallet: string): Promise<number> {
    let n = 0;
    for (const m of store().matches.values()) {
      if (m.wallet === wallet && m.mode === "p2e" && m.status === "active") n += 1;
    }
    return n;
  },

  async countP2eFinishedToday(wallet: string): Promise<number> {
    const day = todayUtc();
    let n = 0;
    for (const m of store().matches.values()) {
      if (
        m.wallet === wallet &&
        m.mode === "p2e" &&
        (m.status === "won" || m.status === "lost") &&
        m.finished_at?.slice(0, 10) === day
      ) {
        n += 1;
      }
    }
    return n;
  },

  async finishMatch(
    id: string,
    status: MatchStatus,
    inputs: GameInput[],
    winner: string | null,
    turns: number,
  ): Promise<FinishMatchResult> {
    const m = store().matches.get(id);
    if (!m) return { match: null, claimed: false };
    if (m.status !== "active") return { match: m, claimed: false };
    m.status = status;
    m.inputs = inputs;
    m.winner = winner;
    m.turns = turns;
    m.finished_at = new Date().toISOString();
    const p = await this.ensurePlayer(m.wallet);
    if (status === "won") p.wins += 1;
    if (status === "lost") p.losses += 1;
    return { match: m, claimed: true };
  },

  async countTicketsToday(wallet: string): Promise<number> {
    const day = todayUtc();
    return store().tickets.filter((t) => t.wallet === wallet && t.day_utc === day).length;
  },

  async grantTicket(wallet: string, matchId: string): Promise<TicketRow | null> {
    const day = todayUtc();
    const count = await this.countTicketsToday(wallet);
    if (count >= config.maxTicketsPerDay) return null;
    const exists = store().tickets.find((t) => t.match_id === matchId);
    if (exists) return exists;
    const ticket: TicketRow = {
      id: crypto.randomUUID(),
      wallet,
      match_id: matchId,
      day_utc: day,
      created_at: new Date().toISOString(),
    };
    store().tickets.push(ticket);
    const p = await this.ensurePlayer(wallet);
    p.tickets_total += 1;
    return ticket;
  },

  async leaderboard(): Promise<LeaderboardEntry[]> {
    const day = todayUtc();
    const s = store();
    return [...s.players.values()]
      .filter((p) => !p.wallet.startsWith("guest_"))
      .map((p) => ({
        wallet: p.wallet,
        wins: p.wins,
        tickets_total: p.tickets_total,
        tickets_today: s.tickets.filter(
          (t) => t.wallet === p.wallet && t.day_utc === day,
        ).length,
      }))
      .sort((a, b) => b.tickets_today - a.tickets_today || b.wins - a.wins)
      .slice(0, 50);
  },

  async ticketsForDay(day: string): Promise<TicketRow[]> {
    return store().tickets.filter((t) => t.day_utc === day);
  },

  async saveRaffle(round: RaffleRound): Promise<void> {
    store().raffles.set(round.day_utc, round);
  },

  async getRaffle(day: string): Promise<RaffleRound | null> {
    return store().raffles.get(day) ?? null;
  },

  async getLatestPaidRaffle(): Promise<RaffleRound | null> {
    const paid = [...store().raffles.values()].filter((r) => r.paid);
    paid.sort((a, b) => b.day_utc.localeCompare(a.day_utc));
    return paid[0] ?? null;
  },
};
