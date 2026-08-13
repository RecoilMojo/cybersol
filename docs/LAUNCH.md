# Cybersol Launch Ops Checklist

## Pre-launch (game live first)

- [ ] Domain `cybersol.org` purchased
- [ ] DNS on Cloudflare → Vercel (see [SETUP.md](./SETUP.md))
- [ ] Supabase project created; run `supabase/schema.sql`
- [ ] Helius API key in Vercel env
- [ ] Site playable at https://cybersol.org/play (free mode)
- [ ] Rewards wallet created (fresh hot wallet); fund ~1 SOL for early raffles
- [ ] `REWARDS_KEYPAIR_BASE58` stored only in local `.env` / CI secret — never in git
- [ ] X Premium on builder account
- [ ] Assets ready: 512×512 icon, 1280×300 banner, 15s browser gameplay clip

## Pump.fun create settings

| Field | Value |
|-------|--------|
| Name | Cybersol |
| Ticker | $CYBERSOL |
| Website | https://cybersol.org |
| Twitter | your X profile |
| Description | Official utility token for Cybersol browser TCG. Hold $CYBERSOL to enter daily P2E AI battles. Creator fees fund the daily SOL raffle pool. Play live at cybersol.org |
| Dev buy | ~1.3–1.5 SOL (~4%) |

**Honest fee split:** 50% of Pump.fun/PumpSwap **creator fees** (not 50% of volume) → public raffle wallet. 50% → you (ops + survival). Prefer Pump.fun fee-sharing to both wallets so the split is automatic. Do **not** claim Token-2022 transfer-tax routing unless you later ship that. Do **not** say “all fees go to holders.”

## Launch second sequence

1. Create coin + bundled 4% buy.
2. Copy CA → set `NEXT_PUBLIC_TOKEN_MINT` on Vercel → redeploy.
3. Update pinned tweet with CA.
4. Paste CA in every reply (copycats will appear).
5. Seed raffle wallet from treasury if needed.
6. Post first verified win / ticket screenshot.

## Pinned tweet template

```
Cybersol is LIVE on Solana.

I’m a Steam TCG developer. I shipped a browser card battler you can play RIGHT NOW.

Play: https://cybersol.org/play
Hold $CYBERSOL → beat AI → daily SOL raffle (3 winners, max 3 tickets/day)
Dev: 4% reserved for rewards + build

CA: [INSERT]
```

## DexScreener

- Do **not** pay before launch.
- Pay ~$299 Enhanced Token Info at ~70–80% bonding curve or right after migration.
- Folder: icon 512, banner 1280×300, 3-sentence blurb, X + website links.

## Daily raffle

```bash
npm run raffle -- --dry-run          # preview yesterday UTC
npm run raffle                       # pay yesterday UTC
npm run raffle -- --day 2026-08-11   # specific day
```

Tweet winners after each paid round.

`--dry-run` does not write the database. A crash mid-payout can be re-run: already-sent tx signatures are stored, remaining winners are paid, dumpers are skipped. `NEXT_PUBLIC_REWARDS_WALLET` must match the keypair. Never use the living or dev bag as `REWARDS_KEYPAIR_BASE58`.

## Anti-farm (already in the game)

- P2E start + submit require a Phantom/Solflare message signature for that wallet.
- Hold is checked at match start, ticket grant, and raffle payout.
- One active P2E match per wallet; stale matches auto-abandon after 2 hours.
- Tickets need ~40s, 3 turns, and a few real inputs — instant solved replays don’t pay.
- 3 tickets / wallet / day. Rate limits on match APIs.
- Raffle RNG mixes UTC day + a recent Solana blockhash. Guests and invalid addresses never get paid.

After you run `supabase/schema.sql` on an existing project, also run the new unique index on `tickets(match_id)` from that file.

## FUD replies

Reply with a short face-cam clip at your Unity/Steam Cybersoul project or this repo’s game running in Chrome. Include official CA every time.
