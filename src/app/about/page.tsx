import type { Metadata } from "next";
import Link from "next/link";
import { LaunchPlaceholders } from "@/components/home/LaunchPlaceholders";
import { config } from "@/lib/config";
import { formatHold, formatSol } from "@/lib/format";
import { LINKS } from "@/lib/links";

export const metadata: Metadata = {
  title: "What is Cybersol? — Browser Trading Card Game on Solana",
  description:
    "Solo indie behind Cybersoul on Steam. Play Solo Battle free. Hold $CYBERSOL for a daily SOL raffle funded by Pump.fun creator fees.",
};

export default function AboutPage() {
  const hold = formatHold(config.holdThreshold);
  const pool = formatSol(config.rafflePoolSol);
  const winners = config.raffleWinners;
  const tickets = config.maxTicketsPerDay;
  const ca = process.env.NEXT_PUBLIC_TOKEN_MINT ?? "";
  const buyUrl = process.env.NEXT_PUBLIC_BUY_URL ?? "";
  const pumpUrl = process.env.NEXT_PUBLIC_PUMP_URL ?? "";
  const dexUrl = process.env.NEXT_PUBLIC_DEX_URL ?? "";

  return (
    <div className="page-wrap about-page">
      <header className="about-hero panel panel-glow">
        <p className="home-kicker">
          <span className="home-kicker-dot" aria-hidden />
          Solo indie · Live on Steam · On Solana
        </p>
        <h1 className="page-title">What is Cybersol?</h1>
        <p className="about-lead">
          A real browser Trading Card Game from the solo indie behind <strong>Cybersoul</strong> on
          Steam. Play Solo Battle free — no download, no wallet. Hold <strong>$CYBERSOL</strong> when
          it launches and winning vs the AI enters a daily SOL raffle funded by Pump.fun creator
          fees. Inspired by Gods Unchained.
          </p>
        <div className="hero-actions about-hero-actions">
          <Link href={LINKS.play} className="btn-primary">
            Play Free Now
          </Link>
          <a href={LINKS.steamCybersoul2} className="btn-secondary" target="_blank" rel="noopener noreferrer">
            Cybersoul 2 on Steam
          </a>
        </div>
        <LaunchPlaceholders ca={ca} buyUrl={buyUrl} pumpUrl={pumpUrl} dexUrl={dexUrl} />
      </header>

      <section className="about-grid">
        <article className="panel about-card">
          <p className="about-card-kicker">The games behind it</p>
          <h2>Built first, chain second</h2>
          <p>
            <strong>Cybersoul</strong> (free) and <strong>Cybersoul 2</strong> are live on Steam —
            multiplayer card battler, 33+ factions, 1,200+ cards, Glitch Arcade, idle systems, and a
            trailer you can watch on this site.
          </p>
          <p>
            Same art. Same world. Built solo. Cybersol is the Solana companion: a slice of the Grid
            you can play in the browser without a 6GB download.
          </p>
        </article>

        <article className="panel about-card">
          <p className="about-card-kicker">How it works</p>
          <h2>Play. Hold. Win tickets.</h2>
          <ol className="about-steps">
            <li>
              <strong>Play free</strong> — Solo Battle in your browser. Wallet optional.
            </li>
            <li>
              <strong>Hold ≥ {hold} $CYBERSOL</strong> — unlocks P2E. Balance checked on-chain.
            </li>
            <li>
              <strong>Beat the AI</strong> — the server re-simulates your match from seed + inputs.
              Max {tickets} tickets per wallet per day.
            </li>
            <li>
              <strong>Daily SOL raffle</strong> — {winners} winners split a {pool} SOL pool funded
              by Pump.fun creator fees. Not a whale leaderboard.
            </li>
          </ol>
        </article>

        <article className="panel about-card">
          <p className="about-card-kicker">Steam</p>
          <h2>The full Grid</h2>
          <p>
            <a href={LINKS.steamCybersoul2} target="_blank" rel="noopener noreferrer">
              Cybersoul 2
            </a>{" "}
            is the premium multiplayer hub — Raid Boss, Chaos Brawl, Auto Battle, Draft Arena,
            Gauntlet, Dark Web idle, and the Glitch Arcade.
          </p>
          <p>
            <a href={LINKS.steamCybersoul1} target="_blank" rel="noopener noreferrer">
              Cybersoul
            </a>{" "}
            stays free on Steam for the full Trading Card Game without touching crypto.
          </p>
        </article>

        <article className="panel about-card">
          <p className="about-card-kicker">Indie</p>
          <h2>Follow the builder</h2>
          <p>
            Recoil Mojo — that’s me. Solo indie behind Cybersoul. Face, code, and trailers in
            public. Watch the Grid get built.
          </p>
          <div className="social-actions about-social">
            <a className="btn-secondary" href={LINKS.youtube} target="_blank" rel="noopener noreferrer">
              YouTube
            </a>
            <a className="btn-secondary" href={LINKS.tiktok} target="_blank" rel="noopener noreferrer">
              TikTok
            </a>
            <a className="btn-secondary" href={LINKS.twitter} target="_blank" rel="noopener noreferrer">
              X / Twitter
            </a>
          </div>
        </article>

        <article className="panel about-card about-card--wide">
          <p className="about-card-kicker">$CYBERSOL</p>
          <h2>What the token is — and isn’t</h2>
          <p>
            $CYBERSOL is the optional utility token for this browser companion. Hold at least {hold}{" "}
            to earn raffle tickets. I split Pump.fun creator fees <strong>50/50</strong>: half to the
            public raffle ({pool} SOL floor, {winners} winners), half to me so I can keep the lights
            on. Play never requires a purchase.
          </p>
          <p>
            Tickets are a raffle, not a salary. No guaranteed SOL. No Token-2022 transfer tax. No
            staking APY. If someone DMs you a different CA, it’s a copycat.
          </p>
        </article>
      </section>
    </div>
  );
}
