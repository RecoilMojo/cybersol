/**
 * Daily raffle payout script.
 *
 * Usage:
 *   npx tsx scripts/daily-raffle.ts              # yesterday UTC (default)
 *   npx tsx scripts/daily-raffle.ts --day 2026-08-10
 *   npx tsx scripts/daily-raffle.ts --dry-run
 *
 * Pays from the raffle wallet only (REWARDS_KEYPAIR_BASE58).
 * Never point this at the living/dev bag. Keep ~1–2 SOL on the raffle wallet.
 */
import "dotenv/config";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";
import { checkTokenHold } from "../src/lib/solana/hold";
import { isGuestWallet, isValidSolanaAddress } from "../src/lib/solana/address";
import { serverRpcUrl } from "../src/lib/solana/server-rpc";

const poolSol = Number(process.env.RAFFLE_POOL_SOL ?? "0.5");
const winnersCount = Number(process.env.RAFFLE_WINNERS ?? "3");
const expectedPayer = process.env.NEXT_PUBLIC_REWARDS_WALLET ?? "";

type Ticket = { id: string; wallet: string };
type Winner = { wallet: string; ticketId: string; amountSol: number };

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromBytes(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, false);
}

async function raffleRng(connection: Connection, day: string) {
  const latest = await connection.getLatestBlockhash("finalized");
  const material = new TextEncoder().encode(`${day}:${latest.blockhash}:${latest.lastValidBlockHeight}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  console.log(`Entropy blockhash ${latest.blockhash.slice(0, 8)}…`);
  return mulberry32(seedFromBytes(digest));
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

async function pickWinners(tickets: Ticket[], rng: () => number, payer: string): Promise<Winner[]> {
  const shuffled = shuffle(tickets, rng);
  const drawn: Winner[] = [];
  const seen = new Set<string>();

  for (const t of shuffled) {
    if (drawn.length >= winnersCount) break;
    if (isGuestWallet(t.wallet) || !isValidSolanaAddress(t.wallet)) continue;
    if (t.wallet === payer) continue;
    if (seen.has(t.wallet)) continue;
    const hold = await checkTokenHold(t.wallet);
    if (!hold.eligible) {
      console.log(`Skip ${t.wallet} — not holding at payout (${hold.reason ?? "ineligible"})`);
      continue;
    }
    seen.add(t.wallet);
    drawn.push({ wallet: t.wallet, ticketId: t.id, amountSol: 0 });
  }

  if (drawn.length === 0) return [];
  const amountEach = poolSol / drawn.length;
  return drawn.map((w) => ({ ...w, amountSol: amountEach }));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const day = arg("--day") ?? yesterdayUtc();

  console.log(`Cybersol daily raffle — day ${day}${dryRun ? " (dry-run)" : ""}`);

  const useMemory = process.env.USE_MEMORY_STORE === "true" || !process.env.SUPABASE_URL;
  if (useMemory) {
    console.error(
      "Memory store cannot run raffles across processes. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(1);
  }

  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: existing } = await sb
    .from("raffle_rounds")
    .select("*")
    .eq("day_utc", day)
    .maybeSingle();
  if (existing?.paid) {
    console.log("Already paid for this day. Aborting.");
    process.exit(0);
  }

  const { data: ticketRows, error } = await sb
    .from("tickets")
    .select("id, wallet")
    .eq("day_utc", day);
  if (error) throw error;
  const tickets = (ticketRows as Ticket[]) ?? [];

  if (tickets.length === 0) {
    console.log("No tickets for this day.");
    process.exit(0);
  }

  const connection = new Connection(serverRpcUrl(), "confirmed");
  const existingSigs: string[] = Array.isArray(existing?.tx_sigs) ? existing.tx_sigs : [];
  const resume = existingSigs.length > 0 && Array.isArray(existing?.winners) && existing.winners.length > 0;

  let winners: Winner[];
  if (resume) {
    console.log(`Resuming unpaid round (${existingSigs.length} tx(s) already sent).`);
    winners = existing.winners as Winner[];
  } else {
    const rng = await raffleRng(connection, day);
    winners = await pickWinners(tickets, rng, expectedPayer);
  }

  if (winners.length === 0) {
    console.log("No eligible holders to pay.");
    process.exit(0);
  }

  console.log(`Tickets: ${tickets.length}. Winners: ${winners.length}. Each: ${winners[0]?.amountSol} SOL`);
  for (const w of winners) {
    console.log(`  ${w.wallet} (ticket ${w.ticketId})`);
  }

  const round = {
    id: existing?.id ?? crypto.randomUUID(),
    day_utc: day,
    pool_sol: poolSol,
    winners_count: winners.length,
    winners,
    paid: false,
    tx_sigs: existingSigs,
    created_at: existing?.created_at ?? new Date().toISOString(),
    paid_at: null as string | null,
  };

  if (dryRun) {
    console.log("Dry run complete — no payouts sent, database unchanged.");
    return;
  }

  const secret = process.env.REWARDS_KEYPAIR_BASE58;
  if (!secret) {
    console.error("REWARDS_KEYPAIR_BASE58 missing");
    process.exit(1);
  }

  const payer = Keypair.fromSecretKey(bs58.decode(secret));
  const payerPk = payer.publicKey.toBase58();
  if (expectedPayer && expectedPayer !== payerPk) {
    console.error(
      `Keypair ${payerPk} does not match NEXT_PUBLIC_REWARDS_WALLET ${expectedPayer}. Aborting.`,
    );
    process.exit(1);
  }

  const bal = await connection.getBalance(payer.publicKey);
  const remaining = winners.length - existingSigs.filter((s) => s && !s.startsWith("SKIPPED")).length;
  const need = Math.ceil(poolSol * LAMPORTS_PER_SOL) + 5000 * Math.max(remaining, 1);
  console.log(`Raffle wallet ${payerPk} balance: ${bal / LAMPORTS_PER_SOL} SOL`);
  if (bal < need) {
    console.error(`Insufficient SOL. Need ~${need / LAMPORTS_PER_SOL}`);
    process.exit(1);
  }

  const sigs = [...existingSigs];
  for (let i = sigs.length; i < winners.length; i++) {
    const w = winners[i];
    if (!isValidSolanaAddress(w.wallet) || w.wallet === payerPk) {
      sigs.push("SKIPPED_INVALID");
      console.log(`Skip invalid destination ${w.wallet}`);
      await sb.from("raffle_rounds").upsert({ ...round, tx_sigs: sigs, paid: false });
      continue;
    }
    const hold = await checkTokenHold(w.wallet);
    if (!hold.eligible) {
      sigs.push("SKIPPED_NOT_HOLDING");
      console.log(`Skip ${w.wallet} — dumped before payout`);
      await sb.from("raffle_rounds").upsert({ ...round, tx_sigs: sigs, paid: false });
      continue;
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: new PublicKey(w.wallet),
        lamports: Math.floor(w.amountSol * LAMPORTS_PER_SOL),
      }),
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    sigs.push(sig);
    console.log(`Paid ${w.amountSol} SOL -> ${w.wallet} :: ${sig}`);
    await sb.from("raffle_rounds").upsert({ ...round, tx_sigs: sigs, paid: false });
  }

  round.paid = true;
  round.tx_sigs = sigs;
  round.paid_at = new Date().toISOString();
  await sb.from("raffle_rounds").upsert(round);

  const paidN = sigs.filter((s) => s && !s.startsWith("SKIPPED")).length;
  console.log("\n--- Tweet draft ---");
  console.log(
    `Cybersol daily raffle (${day}) paid ${paidN} winners · ${poolSol} SOL pool.\nPlay: https://cybersol.org/play\nCA: ${process.env.NEXT_PUBLIC_TOKEN_MINT ?? "TBA"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
