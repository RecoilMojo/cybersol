# Cybersol

Browser Solana TCG companion — connect wallet, beat the AI, earn daily SOL raffle tickets funded by `$CYBERSOL` creator fees.

## Quick start

```bash
npm install
cp .env.example .env.local   # memory store works out of the box
npm run dev
```

- Play: http://localhost:3000/play  
- Leaderboard: http://localhost:3000/leaderboard  

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Next.js |
| `npm run build` | Production build |
| `npm run test:game` | Deterministic replay smoke test |
| `npm run raffle` | Pay yesterday’s UTC raffle (needs Supabase + rewards key) |

## Docs

- [docs/SETUP.md](docs/SETUP.md) — domain, Cloudflare, Vercel, Supabase, Helius
- [docs/LAUNCH.md](docs/LAUNCH.md) — Pump.fun ops, tweets, DexScreener timing
- [supabase/schema.sql](supabase/schema.sql) — database schema

## Architecture

```
Browser (Next.js game)
  → POST /api/start-match  (seed + match id)
  → play locally, log inputs
  → POST /api/submit-match (server re-simulates → tickets)
Supabase / memory store
Helius RPC (token hold checks)
Rewards wallet → scripts/daily-raffle.ts
```

Steam Cybersoul stays in a separate repo/folder. This project is web-only.
