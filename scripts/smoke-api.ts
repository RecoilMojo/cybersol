/**
 * Smoke-test match APIs against a running `npm run dev` / `npm start` server.
 * Uses a fake wallet string valid length for zod.
 */
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const wallet = "guest_smokeapitest000000000000000001";

async function main() {
  const jsonHeaders = {
    "Content-Type": "application/json",
    Origin: BASE,
  };
  const start = await fetch(`${BASE}/api/start-match`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ wallet, mode: "free" }),
  });
  const startBody = await start.json();
  if (!start.ok) throw new Error(`start-match failed: ${JSON.stringify(startBody)}`);
  console.log("start-match", startBody);

  // Minimal resign: submit empty-ish will lose quickly via replay timeout rules
  const { createMatch, applyInput, replayMatch } = await import("../src/lib/game/engine");
  const { aiPolicy } = await import("../src/lib/game/ai");
  const state = createMatch(startBody.seed);
  const inputs = [];
  // End turns until someone wins or cap
  let guard = 0;
  while (!state.winner && guard < 40) {
    guard += 1;
    if (state.active === "player") {
      applyInput(state, "player", { type: "end_turn" });
      inputs.push({ type: "end_turn" as const });
      const moves = aiPolicy(state);
      for (const m of moves) {
        if (state.winner || state.active !== "ai") break;
        applyInput(state, "ai", m);
      }
      if (!state.winner && state.active === "ai") {
        applyInput(state, "ai", { type: "end_turn" });
      }
    }
  }

  const submit = await fetch(`${BASE}/api/submit-match`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ matchId: startBody.matchId, wallet, inputs }),
  });
  const submitBody = await submit.json();
  if (!submit.ok) throw new Error(`submit-match failed: ${JSON.stringify(submitBody)}`);
  console.log("submit-match", submitBody);

  const verified = replayMatch(startBody.seed, inputs, aiPolicy);
  console.log("local winner", verified.winner, "api winner", submitBody.winner);

  const lb = await fetch(`${BASE}/api/leaderboard`, { headers: { Origin: BASE } });
  console.log("leaderboard", await lb.json());
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
