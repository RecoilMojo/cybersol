/** Anti-farm rules for P2E tickets. Wins still count if these fail — tickets do not. */
export const P2E_MIN_DURATION_MS = 40_000;
export const P2E_MIN_TURNS = 3;
/** play / attack / activate / hero_power that actually applied in replay — padding after a win does not count. */
export const P2E_MIN_PLAYER_INPUTS = 3;
export const P2E_MIN_PLAYS = 1;
export const P2E_MAX_ACTIVE_MATCHES = 1;
/** Hard cap on finished P2E matches per wallet per UTC day — tickets already cap at 3. */
export const P2E_MAX_FINISHES_PER_DAY = 12;
export const P2E_MATCH_TTL_MS = 2 * 60 * 60 * 1000;
/** Parked matches don't get tickets — same window as stale-match abandon. */
export const P2E_MAX_DURATION_MS = P2E_MATCH_TTL_MS;

export class P2eActiveExistsError extends Error {
  readonly code = "P2E_ACTIVE_EXISTS" as const;
  constructor() {
    super("Finish your current P2E match before starting another.");
    this.name = "P2eActiveExistsError";
  }
}

const TICKET_ACTIONS = new Set(["play", "attack", "activate", "hero_power"]);

export function countTicketActions(inputs: { type: string }[]) {
  let actions = 0;
  let plays = 0;
  for (const input of inputs) {
    if (!TICKET_ACTIONS.has(input.type)) continue;
    actions += 1;
    if (input.type === "play") plays += 1;
  }
  return { actions, plays };
}
