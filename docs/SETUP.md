# Cybersol hosting & DNS setup

## Stack

| Piece | Provider |
|-------|----------|
| App host | **Vercel** (Next.js) |
| DNS / CDN | **Cloudflare** |
| Domain | **cybersol.org** (prefer over `.online`) |
| Database | **Supabase** free tier |
| Solana RPC | **Helius** free tier |

## 1. Domain + Cloudflare

1. Buy `cybersol.org` (Cloudflare Registrar or Namecheap).
2. Add site to Cloudflare; set nameservers if registrar ≠ Cloudflare.
3. SSL/TLS mode: **Full** (or Full Strict once Vercel cert is live).

## 2. Vercel

1. Push this repo to GitHub (private OK).
2. Import project in Vercel → Framework Preset Next.js.
3. Add env vars from `.env.example` (see below).
4. Deploy. Copy the `*.vercel.app` URL.

## 3. Cloudflare DNS → Vercel

In Cloudflare DNS for `cybersol.org`:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `76.76.21.21` | Proxied (orange) or DNS-only |
| CNAME | `www` | `cname.vercel-dns.com` | Proxied |

Then in Vercel → Project → Settings → Domains → add `cybersol.org` and `www.cybersol.org`.

> If Cloudflare proxy causes SSL issues during first setup, set records to **DNS only** (grey cloud) until Vercel shows a valid cert, then re-enable proxy.

## 4. Supabase

1. Create project.
2. SQL editor → paste and run `supabase/schema.sql`.
3. Project Settings → API: copy URL + `service_role` key into Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Set `USE_MEMORY_STORE=false` (or unset).

## 5. Helius

1. Create free account at helius.dev.
2. Create API key.
3. Set `HELIUS_API_KEY` in Vercel / `.env.local` (server only — hold checks and raffle).
4. Keep `NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com` for the browser wallet adapter.
   **Do not** put the Helius key in `NEXT_PUBLIC_RPC_URL` — that ships the key to every visitor.

## 6. Local dev

```bash
cp .env.example .env.local
# USE_MEMORY_STORE=true works with zero cloud setup
npm install
npm run dev
```

Open http://localhost:3000

## Env checklist (Vercel)

```
NEXT_PUBLIC_SITE_URL=https://cybersol.org
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_TOKEN_MINT=          # set at launch
NEXT_PUBLIC_BUY_URL=
NEXT_PUBLIC_PUMP_URL=
NEXT_PUBLIC_DEX_URL=
NEXT_PUBLIC_HOLD_THRESHOLD=10000
NEXT_PUBLIC_REWARDS_WALLET=
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
HELIUS_API_KEY=...
USE_MEMORY_STORE=false
MAX_TICKETS_PER_DAY=3
RAFFLE_POOL_SOL=0.5
RAFFLE_WINNERS=3
```

Keep `REWARDS_KEYPAIR_BASE58` **off** Vercel public env if the app bundle could expose it. Prefer local/`npm run raffle` or a locked GitHub Action secret.
