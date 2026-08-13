import Image from "next/image";
import Link from "next/link";
import { LaunchPlaceholders } from "@/components/home/LaunchPlaceholders";
import { TrailerEmbed } from "@/components/home/TrailerEmbed";
import { LINKS } from "@/lib/links";

export default function HomePage() {
  const ca = process.env.NEXT_PUBLIC_TOKEN_MINT ?? "";
  const buyUrl = process.env.NEXT_PUBLIC_BUY_URL ?? "";
  const pumpUrl = process.env.NEXT_PUBLIC_PUMP_URL ?? "";
  const dexUrl = process.env.NEXT_PUBLIC_DEX_URL ?? "";

  return (
    <>
      <section className="hero hero-stack">
        <div className="hero-panel">
          <div className="home-kicker">
            <span className="home-kicker-dot" aria-hidden />
            Solo indie · Cybersoul live on Steam · Solana
          </div>

          <Image
            src="/graphics/cybersoul2-text.png"
            alt="Cybersoul 2"
            width={720}
            height={160}
            priority
            className="hero-logo"
          />

          <p className="hero-copy">
            Free Solo Battle in the browser — no download, no wallet. Hold $CYBERSOL for daily SOL
            raffles funded by Pump.fun creator fees. Built solo. Cybersoul is live on Steam.
          </p>

          <div className="hero-actions">
            <Link href={LINKS.play} className="btn-primary">
              Play Free Now
            </Link>
            <a
              href={LINKS.steamCybersoul2}
              className="btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cybersoul 2 on Steam
            </a>
          </div>

          <LaunchPlaceholders ca={ca} buyUrl={buyUrl} pumpUrl={pumpUrl} dexUrl={dexUrl} />
        </div>

        <div className="hero-media">
          <TrailerEmbed />
          <p className="trailer-caption">
            Cybersoul 2 trailer ·{" "}
            <a href={LINKS.trailerWatch} target="_blank" rel="noopener noreferrer">
              Watch on YouTube
            </a>
          </p>
        </div>
      </section>

      <section className="home-section">
        <div className="section-head">
          <h2 className="page-title">The full Grid</h2>
          <p className="page-sub">
            <strong className="name-cybersoul">Cybersoul</strong> lives on Steam — multiplayer, idle
            systems, Glitch Arcade, and 1,200+ cards.{" "}
            <strong className="name-cybersol">Cybersol</strong> is the Solana companion.
          </p>
        </div>

        <div className="steam-grid">
          <a
            className="steam-card"
            href={LINKS.steamCybersoul2}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div
              className="steam-card-art steam-card-art--main"
              style={{ backgroundImage: "url('/graphics/cybersoul2-main.png')" }}
            />
            <div className="steam-card-body">
              <div className="steam-card-kicker">Steam · $9.99</div>
              <h3>Cybersoul 2</h3>
              <p>
                Multiplayer cyberpunk card battler & incremental hub. 33+ factions, 1,200+ cards.
                Raid Boss, Chaos Brawl, Auto Battle, Draft Arena, Gauntlet, Dark Web idle, Glitch
                Arcade.
              </p>
              <span className="steam-card-cta">View on Steam →</span>
            </div>
          </a>

          <a
            className="steam-card"
            href={LINKS.steamCybersoul1}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div
              className="steam-card-art steam-card-art--library"
              style={{ backgroundImage: "url('/graphics/cybersoul2-library-hero.png')" }}
            />
            <div className="steam-card-body">
              <div className="steam-card-kicker">Steam · Free to Play</div>
              <h3>Cybersoul</h3>
              <p>
                The original acid-soaked deckbuilder. 1,100+ cards, Glitch Arcade, Souls & Star
                Power idle — jack in for free and break the code.
              </p>
              <span className="steam-card-cta">Play Free on Steam →</span>
            </div>
          </a>
        </div>
      </section>

      <section className="home-section home-section-tight">
        <div className="social-bar panel">
          <div>
            <h2 className="page-title" style={{ fontSize: "clamp(1.35rem, 3vw, 1.7rem)" }}>
              Follow the builder
            </h2>
            <p className="page-sub">
              Devlogs, trailers, and Grid noise — I’m Recoil Mojo, the solo indie behind Cybersoul.
            </p>
          </div>
          <div className="social-actions">
            <a className="btn-primary" href={LINKS.youtube} target="_blank" rel="noopener noreferrer">
              YouTube
            </a>
            <a className="btn-secondary" href={LINKS.tiktok} target="_blank" rel="noopener noreferrer">
              TikTok
            </a>
            <a className="btn-secondary" href={LINKS.twitter} target="_blank" rel="noopener noreferrer">
              X / Twitter
            </a>
            <Link href={LINKS.play} className="btn-neon">
              Play Browser
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
