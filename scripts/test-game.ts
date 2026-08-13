import { aiPolicy } from "../src/lib/game/ai";
import {
  applyInput,
  createMatch,
  isValidAbilityTarget,
  replayMatch,
} from "../src/lib/game/engine";
import { getCardDef } from "../src/lib/game/cards";
import type { GameInput, GameState } from "../src/lib/game/types";

/** Resolve player pending target / GY so end_turn is never soft-locked. */
function resolvePlayerPending(state: GameState, inputs: GameInput[]) {
  let guard = 0;
  while (
    (state.pendingTarget || state.pendingGraveyard) &&
    state.active === "player" &&
    !state.winner &&
    guard < 24
  ) {
    guard += 1;
    if (state.pendingGraveyard) {
      const gy = state.player.graveyard;
      let pick = -1;
      for (let i = 0; i < gy.length; i++) {
        const kind = getCardDef(gy[i]!).kind;
        if (state.pendingGraveyard.filter === "spell" && kind !== "spell") continue;
        if (
          state.pendingGraveyard.filter === "character" &&
          (kind === "spell" || kind === "structure" || kind === "equipment")
        ) {
          continue;
        }
        pick = i;
        break;
      }
      const input: GameInput =
        pick < 0
          ? { type: "cancel_target" }
          : { type: "choose_graveyard", index: pick };
      if (!applyInput(state, "player", input)) break;
      inputs.push(input);
      continue;
    }
    const pending = state.pendingTarget!;
    const ability = pending.ability;
    const boardSide = pending.anyBoard
      ? ability === "boost_2_2"
        ? "ally"
        : "enemy"
      : pending.allyTarget
        ? "ally"
        : "enemy";
    const board =
      boardSide === "ally" ? state.player.board : state.ai.board;
    let chosen: "hero" | number | null = null;
    for (let t = 0; t < board.length; t++) {
      if (isValidAbilityTarget(state, ability, "player", t, boardSide)) {
        chosen = t;
        break;
      }
    }
    if (
      chosen === null &&
      pending.allowHero &&
      isValidAbilityTarget(state, ability, "player", "hero")
    ) {
      chosen = "hero";
    }
    const input: GameInput =
      chosen === null
        ? { type: "cancel_target" }
        : { type: "choose_target", target: chosen, board: boardSide };
    if (!applyInput(state, "player", input)) break;
    inputs.push(input);
  }
}

function playAuto(seed: string): GameInput[] {
  const state = createMatch(seed);
  const inputs: GameInput[] = [];
  let guard = 0;
  while (!state.winner && guard < 200) {
    guard += 1;
    if (state.active !== "player") break;

    resolvePlayerPending(state, inputs);

    let played = false;
    for (let i = 0; i < state.player.hand.length; i++) {
      const before = state.player.hand.length;
      const input: GameInput = { type: "play", handIndex: i };
      if (applyInput(state, "player", input)) {
        inputs.push(input);
        resolvePlayerPending(state, inputs);
        played = true;
        if (state.player.hand.length < before) i -= 1;
        break;
      }
    }
    if (played) continue;

    for (let i = 0; i < state.player.board.length; i++) {
      if (!state.player.board[i]?.canAttack) continue;
      const input: GameInput = {
        type: "attack",
        attackerIndex: i,
        target: "hero",
      };
      if (applyInput(state, "player", input)) {
        inputs.push(input);
        i = -1;
      }
    }

    const end: GameInput = { type: "end_turn" };
    if (!applyInput(state, "player", end)) {
      // Still blocked — cancel pending then retry once.
      if (state.pendingTarget || state.pendingGraveyard) {
        const cancel: GameInput = { type: "cancel_target" };
        applyInput(state, "player", cancel);
        inputs.push(cancel);
        if (!applyInput(state, "player", end)) break;
      } else {
        break;
      }
    }
    inputs.push(end);

    const moves = aiPolicy(state);
    for (const m of moves) {
      if (state.winner || state.active !== "ai") break;
      applyInput(state, "ai", m);
    }
    if (!state.winner && state.active === "ai") {
      applyInput(state, "ai", { type: "end_turn" });
    }
  }
  return inputs;
}

const seeds = [
  "test-seed-cybersol-1",
  "ship-ready-a",
  "ship-ready-b",
  "ship-ready-c",
  "neon-arena-7",
  "ship-ready-d",
  "ship-ready-e",
  "vamps-solo-42",
];

let failed = 0;
for (const seed of seeds) {
  const inputs = playAuto(seed);
  const replayed = replayMatch(seed, inputs, aiPolicy);
  const summary = {
    seed,
    inputs: inputs.length,
    winner: replayed.winner,
    turns: replayed.turn,
    playerHp: replayed.player.heroHealth,
    aiHp: replayed.ai.heroHealth,
  };
  console.log(JSON.stringify(summary));
  if (!replayed.winner) {
    console.error("FAIL: no winner", seed);
    failed += 1;
    continue;
  }
  if (replayed.turn < 2 && replayed.player.heroHealth === 30) {
    console.error("FAIL: suspicious early softlock win", seed);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} seed failure(s)`);
  process.exit(1);
}
console.log(`OK: ${seeds.length} deterministic replays completed`);
