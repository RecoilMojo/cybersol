import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import { formatHold, formatSol } from "@/lib/format";
import { LINKS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Roadmap & FAQ — Cybersol",
  description:
    "Cybersol roadmap, raffle scaling, and straight answers from Recoil Mojo. Play is free. $CYBERSOL is optional. Not financial advice.",
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is this a rug?",
    a: "The game is playable in your browser right now. Cybersoul is live on Steam under my name — Recoil Mojo — with my face, trailers, and a real store page. A rug that ships a TCG first would be a weird way to torch that. Still: this is a Pump.fun token. Treat it like one. Don’t buy what you can’t lose.",
  },
  {
    q: "Why should CT trust a Steam indie?",
    a: "You shouldn’t, blindly. Trust the playable game, the public Steam pages, the YouTube/TikTok face, and on-chain raffle txs when they exist. If that isn’t enough, don’t buy. I’m one person, not a lab.",
  },
  {
    q: "Is the game AI slop / a PDF with a play button?",
    a: "No. Solo Battle is a real rules engine with server-side replay. Same world as Cybersoul on Steam (1,200+ cards in the full game). Click Play. It takes ten seconds. I built it.",
  },
  {
    q: "Cybersol vs Cybersoul — is this a copycat?",
    a: "Same builder — me. Cybersoul = Steam TCG. Cybersol = this browser companion + $CYBERSOL. If a tweet, TG, or CA doesn’t match this site, it’s a clone. Paste the official CA from here only.",
  },
  {
    q: "Where is the CA?",
    a: "TBA until I launch the token. It will appear on the homepage, About, and this page the minute the mint is set. Anyone DMing you a CA before that is lying.",
  },
  {
    q: "Do I have to buy the token to play?",
    a: "No. Free Solo Battle needs no wallet. $CYBERSOL only unlocks P2E raffle tickets. Play is the product. The token is optional.",
  },
  {
    q: "Is this guaranteed SOL / a salary?",
    a: "No. Tickets are raffle entries. You can win matches and still not get drawn. The pool can be small. Fees can dry up. If someone promises you SOL per win, they aren’t me.",
  },
  {
    q: "Is this gambling?",
    a: "It’s a raffle funded by creator fees, gated by holding and winning. Play itself is free. If raffles are restricted where you live, don’t enter P2E. This is not legal advice.",
  },
  {
    q: "0.5 SOL / 3 winners is dust. Why bother?",
    a: "I’m seeding day one so the first tweets are real, not vapor. If volume shows up, I want the pool to grow with creator fees — 2 SOL, 5 SOL, 10+ SOL days, extra winners, occasional jackpots. If volume dies, the pool stays small. That’s the honest loop. I’m not going to fake a million-dollar prize.",
  },
  {
    q: "Do creator fees actually go to the raffle, or your pocket?",
    a: "Both, on purpose. 50% of Pump.fun creator fees go to the public raffle wallet. 50% come to me so I can pay hosting, RPC, domain, and rent. That’s 50% of creator fees — a small cut of each trade — not 50% of your buy. I’ll publish both wallets. I will not raid the raffle wallet to pay myself.",
  },
  {
    q: "Why not 100% of fees to the raffle?",
    a: "Because I need to eat and keep the site up. 100% sounds nicer in a tweet, then the game dies when the bill hits. 50/50 is me being straight. If volume gets huge I can give the raffle more. I’m not promising that in advance.",
  },
  {
    q: "Can you just pick the winners?",
    a: "The draw mixes the UTC day with a recent Solana blockhash, then I publish the winner list and Solscan links. That’s better than a Discord screenshot and worse than a VRF. If this gets big, I want the draw on-chain. Until then, verify the txs or don’t play P2E.",
  },
  {
    q: "Bots will farm all the tickets.",
    a: "Cap is 3 tickets per wallet per day, 12 finished P2E matches per wallet per day, and only one P2E match in flight. P2E start and submit need a wallet signature. Tickets only count real plays/attacks — not End Turn spam or leftover junk after the match already ended. Hold is checked at start, again when the ticket is granted, and again when I pay. Matches have a minimum length and expire after two hours. The raffle skips anyone who dumped. Bots can still exist — that’s why it’s a raffle, not a top-3 leaderboard of scripts.",
  },
  {
    q: "Why 10,000 $CYBERSOL to play P2E?",
    a: "Enough to be a real bag at launch, not 0.1% of supply. If price moons and 10k becomes insane, I can lower it. If it’s too cheap and sybil farms the raffle, I can raise it. The number is a dial, not a religion.",
  },
  {
    q: "Token-2022 tax? Staking APY? Reflections?",
    a: "No. Pump.fun creator fees in SOL fund the pool. I don’t claim a transfer tax. I don’t offer staking yield. If a screenshot says otherwise, it’s fake.",
  },
  {
    q: "Mint / freeze / LP — can you rug the token?",
    a: "It’s a Pump.fun coin. Bonding curve, then PumpSwap if it graduates. I’m not running a custom mint-and-freeze scam contract. Read Pump.fun’s model. If that isn’t acceptable, don’t buy.",
  },
  {
    q: "Why Pump.fun instead of a “real” token?",
    a: "Because that’s where Solana attention is, fees are native SOL, and anyone can verify the mint. A custom token with a 47-page whitepaper would still get called a rug. The game is the whitepaper.",
  },
  {
    q: "No Telegram = scam.",
    a: "TG is where copycats, fake admins, and drain links live. Official channels are this site, the CA on this site, and me — Recoil Mojo — on X / YouTube / TikTok. Silence in TG is intentional.",
  },
  {
    q: "Will this site drain my wallet?",
    a: "Connect is Phantom/Solflare via the standard wallet adapter. I never ask for your seed. P2E only reads your $CYBERSOL balance. If a popup wants unlimited token approval to a random program, reject it — that isn’t this site.",
  },
  {
    q: "Why is the raffle a hot wallet? You could steal the pool.",
    a: "True. Early raffles are a rewards keypair, not a multisig vault. That’s a trust assumption on me. Mitigation: public wallet, public txs, small seeded pool until fees exist. If this gets large, I want a fee-funded on-chain pool so I’m not a custodian.",
  },
  {
    q: "Why aren’t matches fully on-chain?",
    a: "A TCG turn is too much state for a fun browser game at Pump.fun speed. You play in the client; my server re-simulates seed + inputs before a ticket is granted. That’s anti-cheat, not a black box “trust me bro I won.”",
  },
  {
    q: "Is $CYBERSOL a security / investment contract?",
    a: "No. It’s a meme/utility token for a free game. You’re not owed profit. This is not financial advice. If you need it to be an investment, this isn’t for you.",
  },
  {
    q: "Team anon? Audit?",
    a: "There is no team. It’s me — Recoil Mojo — solo, with Steam games in public. There is no Big Four audit on a Pump.fun companion site. Don’t pretend there is. Verify the game and the txs.",
  },
  {
    q: "What if you disappear?",
    a: "Steam Cybersoul stays up. This website can go down. Tokens on Pump.fun trade without me. That’s the risk. I’m not disappearing from a Steam career to rug a coin with my face on it, but you should size as if I might get hit by a bus.",
  },
  {
    q: "This is Axie inflation all over again.",
    a: "I don’t mint reward tokens into existence. Tickets are entries. Prizes are SOL from fees/treasury. If fees stop, prizes stop. No infinite $CYBERSOL faucet.",
  },
  {
    q: "How do I know a raffle actually paid?",
    a: "Leaderboard → last paid raffle → Solscan links. No tx, it didn’t happen. A Discord screenshot doesn’t count.",
  },
  {
    q: "Can I sell after I start a P2E match?",
    a: "Hold is checked when the match starts, again when a ticket is granted, and again before I pay. Sell after kickoff and you can still finish the game — you just don’t get a ticket or a payout.",
  },
  {
    q: "Why not 20 or 50 winners?",
    a: "Dust 20-ways doesn’t screenshot. Three real payouts beat fifty 0.002 SOL “wins.” If the pool gets huge, I can raise winner count without going back to dust.",
  },
  {
    q: "Are you paying DexScreener / KOLs to shill?",
    a: "I may pay DexScreener enhanced listing if there’s an actual candle — not before. No secret KOL army. If a shiller has a different CA, they’re the scam.",
  },
  {
    q: "Did you steal the art from the Steam game?",
    a: "I made the Steam game. Same solo indie. Same Grid.",
  },
  {
    q: "When card NFTs? Is this Gods Unchained?",
    a: "That’s the dream, not the launch. Gods Unchained is the north star: cards you mint, own, and trade, then actually play. I’m one person. I will not drop a 10k JPEG collection to dump. If the game and raffle are alive, that’s the expansion I want to build on Solana.",
  },
  {
    q: "What if market cap moons and P2E dies?",
    a: "Then I’ll retune the hold amount, or add a USD-denominated check, so normal holders can still enter. I want a living raffle, not a museum of whales.",
  },
  {
    q: "What are you not promising?",
    a: "No guaranteed SOL. No floor price. No transfer tax. No staking APY. No “can’t go to zero.” No that I’ll out-trade the chart. No NFT mint date. The promise is: a real game I already shipped, an honest raffle while fees exist, and a CA that lives on this site.",
  },
];

export default function RoadmapPage() {
  const hold = formatHold(config.holdThreshold);
  const pool = formatSol(config.rafflePoolSol);
  const winners = config.raffleWinners;
  const tickets = config.maxTicketsPerDay;

  return (
    <div className="page-wrap about-page roadmap-page">
      <header className="about-hero panel panel-glow">
        <p className="home-kicker">
          <span className="home-kicker-dot" aria-hidden />
          Recoil Mojo · Solo · No vapor
        </p>
        <h1 className="page-title">If it takes off, I’ll grow the pool.</h1>
        <p className="about-lead">
          Right now the raffle is <strong>{pool} SOL</strong> split by <strong>{winners} winners</strong>.
          I’m seeding that so day one is real. If creator fees show up, I’ll scale prizes. If they
          don’t, I won’t fake a million-dollar P2E. Play stays free either way. I’m just one indie
          with a dream, trying to build a community.
        </p>
        <div className="hero-meta lb-stats">
          <span className="chip">Hold ≥ {hold}</span>
          <span className="chip">{tickets} tickets / day</span>
          <span className="chip">{winners} winners</span>
          <span className="chip">{pool} SOL now</span>
        </div>
        <div className="hero-actions about-hero-actions">
          <Link href={LINKS.play} className="btn-primary">
            Play Free Now
          </Link>
          <Link href={LINKS.about} className="btn-secondary">
            How it works
          </Link>
        </div>
      </header>

      <ol className="roadmap-phases">
        <li className="panel about-card">
          <p className="about-card-kicker">01 · Live now</p>
          <h2>The game is the whitepaper</h2>
          <p>
            Browser Solo Battle. No download. No wallet required. Server replay. Leaderboard ready
            for winners and Solscan links. I already shipped Cybersoul on Steam — this isn’t a pitch
            deck.
          </p>
        </li>
        <li className="panel about-card">
          <p className="about-card-kicker">02 · Token launch</p>
          <h2>CA on this site, not in DMs</h2>
          <p>
            $CYBERSOL on Pump.fun. Homepage chips flip from TBA to Buy / Pump / Dex. I’ll pay the
            first raffle from the public rewards wallet. Copycats will appear in minutes — official
            CA lives here.
          </p>
        </li>
        <li className="panel about-card">
          <p className="about-card-kicker">03 · If fees flow</p>
          <h2>Pool tracks reality</h2>
          <p>
            Daily prize starts from my seeded floor, then grows with{" "}
            <strong>50% of creator fees</strong> (minus gas). I’ll aim for 1 SOL days, then 2, 5,
            10+ if volume is real. Winner count can rise once payouts are still worth posting.
          </p>
        </li>
        <li className="panel about-card">
          <p className="about-card-kicker">04 · If people stay</p>
          <h2>More game, harder farm</h2>
          <p>
            Extra factions and a deck builder. Steam card art in the browser. On-chain raffle draw
            so I’m not a hot-wallet IOU. Weekly jackpot nights when the wallet can eat it. No fake
            dates — I’ll ship when I can.
          </p>
        </li>
      </ol>

      <section className="panel about-card about-card--wide dream-panel">
        <p className="about-card-kicker">The dream · Gods Unchained on Solana</p>
        <h2>Mint the cards. Own them. Trade them. Play them.</h2>
        <p>
          If this actually finds people, that’s where I want Cybersol to go: a real on-chain TCG
          economy, in the spirit of Gods Unchained. Not a JPEG dump. Cards from the Grid that you
          mint, hold in your wallet, trade with other players, and then put on the board.
        </p>
        <p>
          I’m one person. I can’t pretend that ships next week. Launch is a free browser battle and
          an honest raffle. NFTs only if the game is alive and I can do ownership without turning
          this into a marketplace scam. That’s the north star I’m playing toward.
        </p>
        <div className="hero-meta lb-stats dream-chips">
          <span className="chip">Mint cards</span>
          <span className="chip">Trade on-chain</span>
          <span className="chip">Play what you own</span>
          <span className="chip">Not a launch promise</span>
        </div>
      </section>

      <section className="panel about-card about-card--wide fee-panel">
        <p className="about-card-kicker">Creator fees · straight up</p>
        <h2>50% raffle. 50% me. That’s how I keep this alive.</h2>
        <p>
          Pump.fun takes a cut of each trade and pays a creator fee in SOL. We split that fee. Half
          goes to the public raffle wallet. Half comes to me for servers, RPC, domain, DexScreener,
          and so I can actually keep building instead of getting a real job mid-launch.
        </p>
        <div className="fee-split">
          <div className="fee-half fee-half--raffle">
            <p className="fee-pct">50%</p>
            <h3>Raffle pool</h3>
            <p>Public rewards wallet. Daily SOL prizes. Solscan links on the leaderboard. I don’t spend this on lunch.</p>
          </div>
          <div className="fee-half fee-half--ops">
            <p className="fee-pct">50%</p>
            <h3>Me · Recoil Mojo</h3>
            <p>Hosting, Helius, the domain, time, rent. Solo indie tax. If this dies, it’s because I couldn’t pay the bills — I’m trying not to let that happen.</p>
          </div>
        </div>
        <p>
          If fees are zero, I still seed the {pool} SOL floor from my side so the first draws aren’t
          fake. If fees explode, the raffle half should be obviously bigger on-chain. I’ll point
          Pump.fun fee-sharing at both wallets so the split isn’t “trust me, I transferred it.”
        </p>
      </section>

      <section className="panel about-card about-card--wide scale-panel">
        <p className="about-card-kicker">Raffle scale</p>
        <h2>Prizes follow volume — not hopium</h2>
        <ol className="scale-ladder">
          <li>
            <span className="scale-label">Now</span>
            <span className="scale-value">
              {pool} SOL · {winners} winners
            </span>
            <span className="scale-note">I’m seeding this so the first draw is real.</span>
          </li>
          <li>
            <span className="scale-label">Fees live</span>
            <span className="scale-value">Pool ≈ 50% of creator fees</span>
            <span className="scale-note">On top of the seeded floor. The other 50% keeps me and the site alive.</span>
          </li>
          <li>
            <span className="scale-label">It rips</span>
            <span className="scale-value">5–10 SOL days · more winners</span>
            <span className="scale-note">Still a raffle. Still capped tickets. Still on-chain txs.</span>
          </li>
          <li>
            <span className="scale-label">Monster</span>
            <span className="scale-value">Jackpot nights</span>
            <span className="scale-note">Only if the rewards wallet can pay without going empty.</span>
          </li>
        </ol>
      </section>

      <section className="panel about-card about-card--wide">
        <p className="about-card-kicker">If there’s interest</p>
        <h2>What I’d add — no vapor dates</h2>
        <ul className="feature-list">
          <li>More factions beyond Cyber Vamps, plus a real deck builder</li>
          <li>Full Steam card art in the browser slice</li>
          <li>On-chain raffle draw / public rewards vault so I’m not a hot-wallet IOU</li>
          <li>Seasonal events and a weekly jackpot when fees support it</li>
          <li>Mobile play polish — Pump traffic is phones</li>
          <li>The dream: mintable, tradable card NFTs you actually play with</li>
        </ul>
        <p>
          I will not add staking APY, transfer tax, or “guaranteed daily SOL.” Those are how P2E
          coins die, and I’m not interested in being that guy.
        </p>
      </section>

      <section className="faq-block">
        <header className="section-head">
          <h2 className="page-title">FUD desk</h2>
          <p className="page-sub">
            Crypto Twitter is fast. These are the questions before the quote-tweet. I’ll answer as
            me. No hopium.
          </p>
        </header>
        <div className="faq-list">
          {FAQ.map((item) => (
            <details key={item.q} className="faq-item panel">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
