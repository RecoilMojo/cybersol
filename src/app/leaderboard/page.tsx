"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatHold, formatSol } from "@/lib/format";
import { LINKS } from "@/lib/links";

type Entry = {
  wallet: string;
  wins: number;
  tickets_total: number;
  tickets_today: number;
};

type RaffleRound = {
  day_utc: string;
  pool_sol: number;
  winners_count: number;
  winners: { wallet: string; ticketId: string; amountSol: number }[];
  tx_sigs: string[];
  paid: boolean;
};

type RaffleInfo = {
  poolSol: number;
  winnersCount: number;
  maxTicketsPerDay: number;
  holdThreshold: number;
  rewardsWallet: string;
  lastRound: RaffleRound | null;
};

function shortWallet(w: string) {
  if (w.startsWith("guest_")) return "guest";
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [day, setDay] = useState("");
  const [raffle, setRaffle] = useState<RaffleInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/leaderboard")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed");
        setEntries((data.entries ?? []).filter((e: Entry) => !e.wallet.startsWith("guest_")));
        setDay(data.dayUtc ?? "");
        setRaffle(data.raffle ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  const pool = raffle ? formatSol(raffle.poolSol) : "…";
  const winners = raffle?.winnersCount ?? "…";
  const tickets = raffle?.maxTicketsPerDay ?? "…";
  const hold = raffle ? formatHold(raffle.holdThreshold) : "…";
  const round = raffle?.lastRound;
  const rewards = raffle?.rewardsWallet ?? "";

  return (
    <div className="page-wrap lb-page">
      <header className="about-hero panel panel-glow">
        <p className="home-kicker">
          <span className="home-kicker-dot" aria-hidden />
          UTC {day || "…"} · Daily raffle
        </p>
        <h1 className="page-title">Daily Tickets</h1>
        <p className="about-lead">
          Hold $CYBERSOL, beat the AI, earn raffle tickets. {winners} winners split {pool} SOL
          from Pump.fun creator fees — verified on the server, not a whale scoreboard.
        </p>
        <div className="hero-meta lb-stats">
          <span className="chip">Hold ≥ {hold}</span>
          <span className="chip">{tickets} tickets / day</span>
          <span className="chip">{winners} winners</span>
          <span className="chip">{pool} SOL pool</span>
        </div>
        <div className="hero-actions about-hero-actions">
          <Link href={LINKS.play} className="btn-primary">
            Play for tickets
          </Link>
          <Link href={LINKS.about} className="btn-secondary">
            How it works
          </Link>
        </div>
        {error && <p className="lb-error">{error}</p>}
      </header>

      <section className="panel raffle-panel">
        <p className="about-card-kicker">Last paid raffle</p>
        <h2 className="raffle-panel-title">
          {round ? `Winners · ${round.day_utc}` : "Winners · TBA"}
        </h2>
        <p className="raffle-panel-copy">
          Rewards wallet{" "}
          <span className="raffle-wallet">
            {rewards ? shortWallet(rewards) : "TBA at token launch"}
          </span>
        </p>
        {round && round.winners.length > 0 ? (
          <ul className="raffle-winners">
            {round.winners.map((w, i) => {
              const sig = round.tx_sigs[i];
              return (
                <li key={`${w.ticketId}-${i}`}>
                  <span>{shortWallet(w.wallet)}</span>
                  <span className="raffle-amount">{formatSol(w.amountSol)} SOL</span>
                  {sig && !sig.startsWith("SKIPPED") ? (
                    <a
                      href={`https://solscan.io/tx/${sig}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Solscan
                    </a>
                  ) : sig?.startsWith("SKIPPED") ? (
                    <span className="chip is-tba">skipped</span>
                  ) : (
                    <span className="chip is-tba">tx · TBA</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="raffle-empty">
            <p>No paid round yet. After launch, yesterday’s {winners} winners and Solscan links land here.</p>
          </div>
        )}
      </section>

      <section className="panel lb-table-panel">
        <p className="about-card-kicker">Today’s tickets</p>
        <h2 className="raffle-panel-title">P2E board</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Wallet</th>
                <th>Today</th>
                <th>Wins</th>
                <th>All tickets</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="lb-empty">
                      <p>No tickets yet. Win a P2E match to show up here.</p>
                      <Link href={LINKS.play} className="btn-neon">
                        Play now
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
              {entries.map((e, i) => (
                <tr key={e.wallet}>
                  <td className="lb-rank">{i + 1}</td>
                  <td className="lb-wallet">{shortWallet(e.wallet)}</td>
                  <td className="lb-today">{e.tickets_today}</td>
                  <td>{e.wins}</td>
                  <td>{e.tickets_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
