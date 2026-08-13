import { memoryDb } from "./memory";
import { supabaseDb } from "./supabase";

function memoryStoreEnabled() {
  return (
    process.env.USE_MEMORY_STORE === "true" ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export const db = memoryStoreEnabled() ? memoryDb : supabaseDb;

export type { MatchMode, MatchRow, TicketRow, LeaderboardEntry } from "./types";
