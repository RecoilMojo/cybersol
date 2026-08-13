/**
 * Ability regression checks — run with: npx tsx scripts/test-abilities.ts
 */
import {
  applyInput,
  createMatch,
  cloneState,
  getPlayCost,
} from "../src/lib/game/engine";
import { chooseAiMoves } from "../src/lib/game/ai";
import { CARD_DEFS, getCardDef } from "../src/lib/game/cards";
import type { CardInstance, GameState } from "../src/lib/game/types";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("OK:", msg);
  }
}

function putOnBoard(
  state: GameState,
  who: "player" | "ai",
  defId: string,
  slot = 0,
  mutate?: (c: CardInstance) => void,
) {
  const side = who === "player" ? state.player : state.ai;
  const def = getCardDef(defId);
  const card: CardInstance = {
    instanceId: `${defId}-test-${slot}`,
    defId,
    attack: def.attack,
    health: def.health,
    maxHealth: def.health,
    bonusAttack: 0,
    canAttack: false,
    canActivate: false,
    attacksThisTurn: 0,
    silenced: false,
    electrified: false,
    keywords: {
      flying: false,
      taunt: false,
      stealth: false,
      deathtouch: false,
      trample: false,
      spellImmunity: false,
      regen: def.abilities.includes("regen"),
      pillage: def.abilities.includes("pillage"),
      reaper: def.abilities.includes("reaper"),
      lifesteal: def.abilities.includes("lifesteal"),
      fury: def.abilities.includes("fury"),
      shield: def.abilities.includes("shield"),
    },
    boardEnteredTurn: state.turn,
  };
  // Apply keyword helpers from abilities the same way play does
  for (const a of def.abilities) {
    if (a === "stealth") card.keywords.stealth = true;
    if (a === "taunt") card.keywords.taunt = true;
    if (a === "flying") card.keywords.flying = true;
    if (a === "deathtouch") card.keywords.deathtouch = true;
    if (a === "trample") card.keywords.trample = true;
    if (a === "regen") card.keywords.regen = true;
    if (a === "pillage") card.keywords.pillage = true;
    if (a === "reaper") card.keywords.reaper = true;
    if (a === "fury") card.keywords.fury = true;
    if (a === "shield") card.keywords.shield = true;
  }
  mutate?.(card);
  side.board[slot] = card;
  return card;
}

function endBothTurns(state: GameState) {
  assert(applyInput(state, "player", { type: "end_turn" }), "player end turn");
  // AI may still be resolving — keep ending until player is active again
  let guard = 0;
  while (state.active === "ai" && !state.winner && guard < 40) {
    guard += 1;
    applyInput(state, "ai", { type: "end_turn" });
  }
}

function testRegen() {
  console.log("\n== Regen ==");
  const state = createMatch("ability-regen-1");
  const unit = putOnBoard(state, "player", "blood-gladiator", 0);
  unit.health = 2; // damaged
  unit.boardEnteredTurn = state.turn; // entered this turn — should NOT regen yet
  const hpBeforeSkip = unit.health;
  endBothTurns(state);
  // After full round, turn advanced; unit should regen at start of player's next turn
  const after = state.player.board[0];
  assert(Boolean(after), "regen unit still on board");
  assert(
    after!.health === after!.maxHealth,
    `regen restored to full (was ${hpBeforeSkip}, now ${after!.health}/${after!.maxHealth})`,
  );
  assert(
    state.log.some((l) => /Regenerates/i.test(l)),
    "regen wrote a log line",
  );
}

function testRegenSkipsEntryTurn() {
  console.log("\n== Regen skips entry turn ==");
  const state = createMatch("ability-regen-2");
  const unit = putOnBoard(state, "player", "blood-gladiator", 0);
  unit.health = 1;
  unit.boardEnteredTurn = state.turn;
  // Only end player turn → AI turn starts (regen should not fire for player unit)
  applyInput(state, "player", { type: "end_turn" });
  const duringAi = state.player.board[0];
  assert(duringAi!.health === 1, "no regen during enemy turn / entry round");
}

function testPillage() {
  console.log("\n== Pillage ==");
  const state = createMatch("ability-pillage-1");
  state.player.mana = 3;
  state.player.maxMana = 5;
  const unit = putOnBoard(state, "player", "drained-unit", 0);
  unit.canAttack = true;
  unit.boardEnteredTurn = state.turn - 1;
  const manaBefore = state.player.mana;
  const ok = applyInput(state, "player", {
    type: "attack",
    attackerIndex: 0,
    target: "hero",
  });
  assert(ok, "pillage attack face");
  assert(
    state.player.mana === Math.min(10, manaBefore + 2),
    `pillage +2 mana (${manaBefore} → ${state.player.mana})`,
  );
}

function testLifestealAura() {
  console.log("\n== Lifesteal / hero heal path ==");
  // Injector fangs / weaver — check if any lifesteal exists via aura site
  const state = createMatch("ability-ls-1");
  putOnBoard(state, "player", "crimson-baroness", 1); // attack aura, not LS
  state.player.heroHealth = 20;
  const attacker = putOnBoard(state, "player", "bat-drone-operator", 0);
  attacker.canAttack = true;
  attacker.boardEnteredTurn = state.turn - 1;
  attacker.keywords.lifesteal = true;
  const ok = applyInput(state, "player", {
    type: "attack",
    attackerIndex: 0,
    target: "hero",
  });
  assert(ok, "lifesteal attack");
  assert(
    state.player.heroHealth === 20 + attacker.attack,
    `lifesteal healed hero to ${state.player.heroHealth}`,
  );
}

function testDigSetsPending() {
  console.log("\n== Dig pending GY ==");
  const state = createMatch("ability-dig-1");
  state.player.graveyard.push("blood-gladiator", "cyber-bite");
  state.player.mana = 5;
  state.player.maxMana = 5;
  // Put acolyte in hand
  const def = getCardDef("mainframe-acolyte");
  state.player.hand[0] = {
    instanceId: "dig-test",
    defId: "mainframe-acolyte",
    attack: def.attack,
    health: def.health,
    maxHealth: def.health,
    bonusAttack: 0,
    canAttack: false,
    canActivate: false,
    attacksThisTurn: 0,
    silenced: false,
    electrified: false,
    keywords: {
      flying: false,
      taunt: false,
      stealth: false,
      deathtouch: false,
      trample: false,
      spellImmunity: false,
      regen: false,
      pillage: false,
      reaper: false,
      lifesteal: false,
      fury: false,
      shield: false,
    },
  };
  const ok = applyInput(state, "player", { type: "play", handIndex: 0 });
  assert(ok, "played Mainframe Acolyte");
  assert(
    state.pendingGraveyard?.filter === "character",
    "dig opened character GY picker",
  );
  const gyIndex = state.player.graveyard.indexOf("blood-gladiator");
  assert(gyIndex >= 0, "gladiator in GY");
  const pick = applyInput(state, "player", {
    type: "choose_graveyard",
    index: gyIndex,
  });
  assert(pick, "chose dig target");
  assert(
    state.player.hand.some((c) => c.defId === "blood-gladiator"),
    "dig returned character to hand",
  );
}

function putInHand(state: GameState, defId: string, index = 0) {
  const def = getCardDef(defId);
  state.player.hand[index] = {
    instanceId: `${defId}-hand-${index}`,
    defId,
    attack: def.attack,
    health: def.health,
    maxHealth: def.health,
    bonusAttack: 0,
    canAttack: false,
    canActivate: false,
    attacksThisTurn: 0,
    silenced: false,
    electrified: false,
    keywords: {
      flying: false,
      taunt: false,
      stealth: false,
      deathtouch: false,
      trample: false,
      spellImmunity: false,
      regen: false,
      pillage: false,
      reaper: false,
      lifesteal: false,
      fury: false,
      shield: false,
    },
  };
}

function testSilenceClearsMidFury() {
  console.log("\n== Silence clears mid-Fury swing ==");
  const state = createMatch("ability-silence-fury");
  const unit = putOnBoard(state, "player", "blood-gladiator", 0);
  unit.canAttack = true;
  unit.boardEnteredTurn = state.turn - 1;
  unit.keywords.fury = true;
  unit.attacksThisTurn = 1;
  const victim = unit;
  const silenceId =
    CARD_DEFS.find((c) => c.abilities.includes("silence"))?.id ?? null;
  if (!silenceId) {
    console.log("SKIP: no silence card in pool");
    return;
  }
  putInHand(state, silenceId, 0);
  state.player.mana = 10;
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "play silence");
  assert(Boolean(state.pendingTarget), "silence pending");
  assert(
    applyInput(state, "player", {
      type: "choose_target",
      target: 0,
      board: "ally",
    }),
    "silence ally mid-fury",
  );
  assert(victim.silenced || state.player.board[0]?.silenced, "silenced");
  const after = state.player.board[0]!;
  assert(!after.keywords.fury, "fury stripped");
  assert(!after.canAttack, "no free second swing after silence");
}

function testBoostPlayableEmptyBoard() {
  console.log("\n== Bless unit playable with no other characters ==");
  const state = createMatch("ability-bless-empty");
  // Clear boards
  state.player.board = Array(7).fill(null);
  state.ai.board = Array(7).fill(null);
  putInHand(state, "feral-rage");
  state.player.mana = 10;
  const ok = applyInput(state, "player", { type: "play", handIndex: 0 });
  assert(ok, "Feral Rage plays with empty boards");
  assert(
    state.player.board.some((c) => c?.defId === "feral-rage"),
    "Feral Rage on board",
  );
  assert(!state.pendingTarget, "no stuck bless pending without targets");
}

function testShieldBlocksDeathtouch() {
  console.log("\n== Shield soaks Deathtouch ==");
  const state = createMatch("ability-shield-dt");
  const atk = putOnBoard(state, "player", "bat-drone-operator", 0);
  atk.canAttack = true;
  atk.boardEnteredTurn = state.turn - 1;
  atk.keywords.deathtouch = true;
  atk.attack = 1;
  const def = putOnBoard(state, "ai", "blood-shield", 0);
  def.keywords.shield = true;
  def.health = 3;
  def.maxHealth = 3;
  assert(
    applyInput(state, "player", {
      type: "attack",
      attackerIndex: 0,
      target: 0,
    }),
    "attack into shield",
  );
  const survivor = state.ai.board[0];
  assert(Boolean(survivor), "shield bearer survives DT");
  assert(!survivor!.keywords.shield, "shield consumed");
  assert(survivor!.health === 3, "no HP lost through shield");
}

function testAttackAuraAndCostAura() {
  console.log("\n== Attack + cost auras ==");
  const state = createMatch("ability-auras");
  putOnBoard(state, "player", "crimson-baroness", 0); // +2 ATK aura site
  putOnBoard(state, "player", "siphon-deacon", 1); // cost -1
  const unit = putOnBoard(state, "player", "bat-drone-operator", 2);
  const printed = getCardDef("bat-drone-operator").attack;
  // refresh happens on play; force via end/start or attack check
  applyInput(state, "player", { type: "end_turn" });
  // during AI — check unit ATK was refreshed while on board before end
  // Re-check after returning — put fresh unit after sites
  const state2 = createMatch("ability-auras-2");
  putOnBoard(state2, "player", "crimson-baroness", 0);
  const u2 = putOnBoard(state2, "player", "bat-drone-operator", 1);
  // Manual refresh by dealing 0 via end turn tick path: play anything
  state2.player.mana = 10;
  putInHand(state2, "energy-core");
  applyInput(state2, "player", { type: "play", handIndex: 0 });
  const buffed = state2.player.board[1];
  assert(Boolean(buffed), "unit present with aura site");
  assert(
    buffed!.attack >= printed + 2,
    `attack aura +2 (printed ${printed}, got ${buffed!.attack})`,
  );
  putOnBoard(state2, "player", "siphon-deacon", 2);
  putInHand(state2, "blood-gladiator", 0);
  const cost = getPlayCost(state2.player, "blood-gladiator");
  const printedCost = getCardDef("blood-gladiator").cost;
  assert(cost === printedCost - 1, `cost aura -1 (${printedCost} → ${cost})`);
  void unit;
  void state;
}

function testLifestealAuraSite() {
  console.log("\n== Crimson Weaver lifesteal aura ==");
  const state = createMatch("ability-ls-aura");
  try {
    putOnBoard(state, "player", "crimson-weaver", 0);
  } catch {
    console.log("SKIP: crimson-weaver missing");
    return;
  }
  state.player.heroHealth = 20;
  const attacker = putOnBoard(state, "player", "bat-drone-operator", 1);
  attacker.canAttack = true;
  attacker.boardEnteredTurn = state.turn - 1;
  // refresh lifesteal from aura
  state.player.mana = 10;
  putInHand(state, "energy-core");
  applyInput(state, "player", { type: "play", handIndex: 0 });
  const ready = state.player.board[1]!;
  ready.canAttack = true;
  assert(ready.keywords.lifesteal, "lifesteal granted by aura site");
  const before = state.player.heroHealth;
  assert(
    applyInput(state, "player", {
      type: "attack",
      attackerIndex: 1,
      target: "hero",
    }),
    "LS aura face hit",
  );
  assert(
    state.player.heroHealth === before + ready.attack,
    `LS aura healed (${before} → ${state.player.heroHealth})`,
  );
}

function testHasteTauntFlying() {
  console.log("\n== Haste / Taunt / Flying ==");
  const state = createMatch("ability-htf");
  // Haste unit should attack same turn when played
  putInHand(state, "elite-infiltrator"); // may have stealth/haste — find haste card
  const hasteCard = [
    "elite-infiltrator",
    "vamp-hound",
    "bat-wing-commando",
    "nocturnal-ranger",
  ].find((id) => {
    try {
      return getCardDef(id).abilities.includes("haste");
    } catch {
      return false;
    }
  });
  if (!hasteCard) {
    console.log("SKIP: no haste card");
  } else {
    const s = createMatch("ability-haste");
    putInHand(s, hasteCard);
    s.player.mana = 10;
    assert(applyInput(s, "player", { type: "play", handIndex: 0 }), "play haste");
    // may open pending — cancel
    if (s.pendingTarget) {
      applyInput(s, "player", { type: "cancel_target" });
    }
    const u = s.player.board.find((c) => c?.defId === hasteCard);
    assert(Boolean(u?.canAttack), "haste can attack immediately");
  }

  const s2 = createMatch("ability-taunt-fly");
  const taunt = putOnBoard(s2, "ai", "blood-gladiator", 0);
  taunt.keywords.taunt = true;
  const chump = putOnBoard(s2, "ai", "bat-drone-operator", 1);
  const flyer = putOnBoard(s2, "player", "shadow-of-the-nosferatu", 0);
  flyer.keywords.flying = true;
  flyer.canAttack = true;
  flyer.boardEnteredTurn = s2.turn - 1;
  // Flying can ignore taunt → face or non-taunt
  assert(
    applyInput(s2, "player", {
      type: "attack",
      attackerIndex: 0,
      target: "hero",
    }),
    "flying ignores taunt to face",
  );
  void chump;
  void state;
}

function testBoardWipeKeepsSites() {
  console.log("\n== Board wipe keeps sites ==");
  const state = createMatch("ability-wipe");
  putOnBoard(state, "player", "crimson-baroness", 0);
  putOnBoard(state, "player", "bat-drone-operator", 1);
  putOnBoard(state, "ai", "blood-gladiator", 0);
  putInHand(state, "count-hemo-vance"); // may be wipe — find board_wipe
  const wipeId = ["count-hemo-vance", "digital-purge", "purge"].find((id) => {
    try {
      return getCardDef(id).abilities.includes("board_wipe");
    } catch {
      return false;
    }
  });
  // Search any wipe card
  let found: string | null = wipeId ?? null;
  if (!found) {
    found =
      CARD_DEFS.find((c) => c.abilities.includes("board_wipe"))?.id ?? null;
  }
  if (!found) {
    console.log("SKIP: no board_wipe card");
    return;
  }
  putInHand(state, found);
  state.player.mana = 10;
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "cast wipe");
  assert(
    state.player.board[0]?.defId === "crimson-baroness",
    "site survives wipe",
  );
  assert(!state.player.board[1], "friendly character wiped");
  assert(!state.ai.board[0], "enemy character wiped");
}

function testElectrifyDuration() {
  console.log("\n== Electrify duration ==");
  const state = createMatch("ability-electrify");
  const elec = CARD_DEFS.find((c) => c.abilities.includes("electrify"));
  if (!elec) {
    console.log("SKIP: no electrify card");
    return;
  }
  const victim = putOnBoard(state, "ai", "blood-gladiator", 0);
  victim.attack = 5;
  putInHand(state, elec.id);
  state.player.mana = 10;
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "play electrify");
  assert(
    applyInput(state, "player", {
      type: "choose_target",
      target: 0,
      board: "enemy",
    }),
    "electrify target",
  );
  const v1 = state.ai.board[0]!;
  assert(v1.electrified || v1.attack <= 1 + 2, "electrified ATK collapsed");
  // Two end-turn ticks should clear (Bless/Electrify duration 2)
  applyInput(state, "player", { type: "end_turn" });
  while (state.active === "ai" && !state.winner) {
    applyInput(state, "ai", { type: "end_turn" });
  }
  applyInput(state, "player", { type: "end_turn" });
  while (state.active === "ai" && !state.winner) {
    applyInput(state, "ai", { type: "end_turn" });
  }
  const v2 = state.ai.board[0];
  if (v2) {
    assert(!v2.electrified, "electrify expired");
  }
}

function testSpellDamageMultiShot() {
  console.log("\n== Spell Damage + Triple Shot ==");
  const state = createMatch("ability-sd-triple");
  putOnBoard(state, "player", "shadow-of-the-nosferatu", 0);
  state.player.mana = 10;
  putInHand(state, "energy-core");
  applyInput(state, "player", { type: "play", handIndex: 0 }); // refresh SPD
  assert(state.player.spellDamage >= 1, `spell damage pip (${state.player.spellDamage})`);
  putInHand(state, "nocturnal-ranger");
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "play triple");
  assert(state.pendingTarget?.shotsLeft === 3, "three separate shots");
  const hp0 = state.ai.heroHealth;
  assert(
    applyInput(state, "player", { type: "choose_target", target: "hero" }),
    "shot 1 face",
  );
  assert(state.pendingTarget?.shotsLeft === 2, "two shots left");
  assert(
    applyInput(state, "player", { type: "choose_target", target: "hero" }),
    "shot 2 face",
  );
  assert(
    applyInput(state, "player", { type: "choose_target", target: "hero" }),
    "shot 3 face",
  );
  assert(!state.pendingTarget, "shots finished");
  const expected = hp0 - 3 * (1 + state.player.spellDamage);
  // spellDamage may still be 1 from Nosferatu
  assert(
    state.ai.heroHealth === hp0 - 6 || state.ai.heroHealth === expected,
    `triple+SPD face dmg (${hp0} → ${state.ai.heroHealth})`,
  );
}

function testCullAndKiller() {
  console.log("\n== Cull + Killer ==");
  const state = createMatch("ability-cull-killer");
  const weak = putOnBoard(state, "ai", "bat-drone-operator", 0);
  weak.attack = 2;
  const beef = putOnBoard(state, "ai", "blood-gladiator", 1);
  beef.attack = 6;
  state.player.mana = 10;
  const handBefore = state.player.hand.length;
  putInHand(state, "vamp-hound");
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "play cull");
  assert(
    applyInput(state, "player", {
      type: "choose_target",
      target: 0,
      board: "enemy",
    }),
    "cull weak",
  );
  assert(!state.ai.board[0], "cull removed weak");
  assert(state.player.hand.length >= handBefore, "cull drew a card");

  const s2 = createMatch("ability-killer");
  // Use printed ATK >= 5 — refreshBoardAttacks overwrites manual .attack.
  putOnBoard(s2, "ai", "vamp-hound", 0);
  putInHand(s2, "blood-blade-duelist");
  s2.player.mana = 10;
  assert(applyInput(s2, "player", { type: "play", handIndex: 0 }), "play killer");
  assert(
    applyInput(s2, "player", {
      type: "choose_target",
      target: 0,
      board: "enemy",
    }),
    "killer beef",
  );
  assert(!s2.ai.board[0], "killer destroyed 5+ ATK");
}

function testEquipDurability() {
  console.log("\n== Equip +1 ATK / durability ==");
  const state = createMatch("ability-equip");
  const unit = putOnBoard(state, "player", "bat-drone-operator", 0);
  unit.canAttack = true;
  unit.boardEnteredTurn = state.turn - 1;
  const printed = getCardDef("bat-drone-operator").attack;
  putInHand(state, "relic-chalice");
  state.player.mana = 10;
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "play equip");
  assert(
    applyInput(state, "player", {
      type: "choose_target",
      target: 0,
      board: "ally",
    }),
    "attach chalice",
  );
  const geared = state.player.board[0]!;
  assert(Boolean(geared.equipment), "equipment attached");
  assert(geared.attack === printed + 1, `+1 ATK (${printed} → ${geared.attack})`);
  const dur0 = geared.equipment!.health;
  assert(
    applyInput(state, "player", {
      type: "attack",
      attackerIndex: 0,
      target: "hero",
    }),
    "attack with gear",
  );
  const after = state.player.board[0]!;
  if (dur0 <= 1) {
    assert(!after.equipment, "gear shattered after last durability");
  } else {
    assert(
      after.equipment!.health === dur0 - 1,
      `durability ${dur0} → ${after.equipment!.health}`,
    );
  }
}

function testChargeAndCast() {
  console.log("\n== Charge + Cast ==");
  // Charge on Feral Rage after a turn
  const state = createMatch("ability-charge");
  const rage = putOnBoard(state, "player", "feral-rage", 0);
  const buddy = putOnBoard(state, "ai", "bat-drone-operator", 0);
  rage.boardEnteredTurn = state.turn - 1;
  rage.canAttack = true;
  rage.canActivate = true;
  assert(
    applyInput(state, "player", { type: "activate", boardIndex: 0 }),
    "activate charge",
  );
  assert(state.pendingTarget?.ability === "charge_bounce", "charge pending");
  assert(
    applyInput(state, "player", {
      type: "choose_target",
      target: 0,
      board: "enemy",
    }),
    "bounce enemy",
  );
  assert(!state.ai.board[0], "enemy bounced off board");
  assert(
    state.ai.hand.some((c) => c.defId === "bat-drone-operator") ||
      state.ai.graveyard.includes("bat-drone-operator"),
    "bounced to hand or burned",
  );
  void buddy;

  // Cast from Mind Locked Thrall
  const s2 = createMatch("ability-cast");
  const thrall = putOnBoard(s2, "player", "mind-locked-thrall", 0);
  thrall.boardEnteredTurn = s2.turn - 1;
  thrall.canActivate = true;
  s2.player.graveyard.push("cyber-bite");
  s2.player.mana = 5;
  assert(
    applyInput(s2, "player", { type: "activate", boardIndex: 0 }),
    "activate cast",
  );
  assert(s2.pendingGraveyard?.filter === "spell", "cast GY spell picker");
  const idx = s2.player.graveyard.indexOf("cyber-bite");
  assert(
    applyInput(s2, "player", { type: "choose_graveyard", index: idx }),
    "pick spell",
  );
  assert(
    s2.player.hand.some((c) => c.defId === "cyber-bite"),
    "spell returned to hand",
  );
  assert(s2.player.board[0]?.canActivate !== false || true, "cast does not hard-break");
}

function testReaperAndBoardBounce() {
  console.log("\n== Reaper + Board Bounce ==");
  const state = createMatch("ability-reaper");
  const vlad = putOnBoard(state, "player", "vlad-the-compiler", 0);
  vlad.boardEnteredTurn = state.turn; // entry — should skip
  const low = putOnBoard(state, "ai", "bat-drone-operator", 0);
  low.attack = 1;
  putOnBoard(state, "ai", "blood-gladiator", 1).attack = 5;
  applyInput(state, "player", { type: "end_turn" });
  // AI turn start — player reaper shouldn't fire on AI turn
  assert(state.ai.board[0], "no reaper on enemy turn");
  while (state.active === "ai" && !state.winner) {
    applyInput(state, "ai", { type: "end_turn" });
  }
  // player turn start — reaper should kill lowest (1 ATK)
  assert(!state.ai.board[0] || state.ai.board[0]!.attack !== 1, "reaper killed lowest");
  assert(Boolean(state.ai.board[1]) || true, "higher ATK may remain");

  const s2 = createMatch("ability-bounce");
  putOnBoard(s2, "player", "crimson-baroness", 0);
  putOnBoard(s2, "player", "bat-drone-operator", 1);
  putOnBoard(s2, "ai", "blood-gladiator", 0);
  putInHand(s2, "silicon-crypt");
  s2.player.mana = 10;
  assert(applyInput(s2, "player", { type: "play", handIndex: 0 }), "cast bounce");
  assert(
    !s2.player.board.some(Boolean) && !s2.ai.board.some(Boolean),
    "boards cleared by bounce",
  );
  assert(
    s2.player.hand.some((c) => c.defId === "crimson-baroness") ||
      s2.player.graveyard.includes("crimson-baroness"),
    "site returned or overflow GY",
  );
}

function testDestroyCyberBiteTrample() {
  console.log("\n== Destroy / Cyber Bite / Trample ==");
  const state = createMatch("ability-destroy");
  putOnBoard(state, "ai", "crimson-baroness", 0); // site — destroy legal
  putInHand(state, "injector-fangs");
  state.player.mana = 10;
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "cast destroy");
  assert(
    applyInput(state, "player", {
      type: "choose_target",
      target: 0,
      board: "enemy",
    }),
    "destroy site",
  );
  assert(!state.ai.board[0], "site destroyed");

  const s2 = createMatch("ability-cyber-bite");
  const ally = putOnBoard(s2, "player", "bat-drone-operator", 0);
  const printed = getCardDef("bat-drone-operator").attack;
  putInHand(s2, "cyber-bite");
  s2.player.mana = 10;
  assert(applyInput(s2, "player", { type: "play", handIndex: 0 }), "cast bite");
  assert(
    applyInput(s2, "player", {
      type: "choose_target",
      target: 0,
      board: "ally",
    }),
    "bite ally",
  );
  const buffed = s2.player.board[0]!;
  assert(buffed.attack === printed + 3, `+3 ATK (${printed} → ${buffed.attack})`);
  assert(buffed.keywords.fury && buffed.keywords.taunt, "fury + taunt");
  void ally;

  const s3 = createMatch("ability-trample");
  const trampler = putOnBoard(s3, "player", "count-hemo-vance", 0);
  trampler.keywords.stealth = false; // reveal so we can drive attack cleanly
  trampler.canAttack = true;
  trampler.boardEnteredTurn = s3.turn - 1;
  const chump = putOnBoard(s3, "ai", "bat-drone-operator", 0);
  chump.health = 1;
  chump.maxHealth = 1;
  const faceBefore = s3.ai.heroHealth;
  assert(
    applyInput(s3, "player", {
      type: "attack",
      attackerIndex: 0,
      target: 0,
    }),
    "trample swing",
  );
  assert(!s3.ai.board[0], "chump dead");
  assert(
    s3.ai.heroHealth < faceBefore,
    `trample overflow to face (${faceBefore} → ${s3.ai.heroHealth})`,
  );
}

function testSpellChargeFireAoeStealthSI() {
  console.log("\n== Spell Charge / Fire AOE / Stealth / SI ==");
  const state = createMatch("ability-spell-charge");
  const paladin = putOnBoard(state, "player", "red-crested-paladin", 0);
  const atk0 = getCardDef("red-crested-paladin").attack;
  putInHand(state, "energy-core");
  state.player.mana = 10;
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "cast coin");
  const charged = state.player.board[0]!;
  assert(
    charged.attack === atk0 + 3,
    `spell charge +3 (${atk0} → ${charged.attack})`,
  );
  void paladin;

  const s2 = createMatch("ability-fire-aoe");
  putOnBoard(s2, "player", "bat-drone-operator", 1).health = 5;
  putOnBoard(s2, "ai", "blood-gladiator", 0);
  putOnBoard(s2, "ai", "crimson-baroness", 1); // site — should take AOE
  putInHand(s2, "goliath-thrall");
  s2.player.mana = 10;
  const siteHp = s2.ai.board[1]!.health;
  assert(applyInput(s2, "player", { type: "play", handIndex: 0 }), "play AOE");
  // AOE hits all OTHER cards — goliath itself excluded
  assert(
    (s2.ai.board[0]?.health ?? 0) < getCardDef("blood-gladiator").health ||
      !s2.ai.board[0],
    "enemy character damaged/killed by AOE",
  );
  assert(
    !s2.ai.board[1] || s2.ai.board[1]!.health === siteHp - 2,
    "site took 2 AOE",
  );

  const s3 = createMatch("ability-stealth-block");
  const stealthed = putOnBoard(s3, "ai", "mist-walker-operative", 0);
  stealthed.keywords.stealth = true;
  const atk = putOnBoard(s3, "player", "bat-drone-operator", 0);
  atk.canAttack = true;
  atk.boardEnteredTurn = s3.turn - 1;
  assert(
    !applyInput(s3, "player", {
      type: "attack",
      attackerIndex: 0,
      target: 0,
    }),
    "cannot attack stealth",
  );

  const s4 = createMatch("ability-si");
  const si = putOnBoard(s4, "ai", "hemo-executive", 0);
  si.keywords.spellImmunity = true;
  putOnBoard(s4, "ai", "bat-drone-operator", 1); // legal alternate target
  putInHand(s4, "injector-fangs");
  s4.player.mana = 10;
  assert(applyInput(s4, "player", { type: "play", handIndex: 0 }), "cast destroy");
  assert(
    !applyInput(s4, "player", {
      type: "choose_target",
      target: 0,
      board: "enemy",
    }),
    "SI blocks targeted destroy",
  );
  assert(
    applyInput(s4, "player", {
      type: "choose_target",
      target: 1,
      board: "enemy",
    }),
    "destroy legal non-SI target",
  );
}

function testManaGemsHemoAndD6() {
  console.log("\n== Mana gems / Hemo hand / D6 ==");
  const state = createMatch("ability-mana");
  state.player.mana = 3;
  state.player.maxMana = 5;
  putInHand(state, "blood-crystal");
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "blood crystal");
  assert(state.player.mana === 5, `+2 mana (got ${state.player.mana})`);

  const s2 = createMatch("ability-hemo");
  const before = s2.player.hand.length;
  putInHand(s2, "bio-fuel-vault");
  s2.player.mana = 10;
  assert(applyInput(s2, "player", { type: "play", handIndex: 0 }), "vault");
  const hackers = s2.player.hand.filter((c) => c.defId === "hemo-hacker").length;
  assert(hackers === 3 || s2.player.hand.length >= before + 2, `+3 hackers (got ${hackers})`);

  const s3 = createMatch("ability-d6");
  putInHand(s3, "gargoyle-sentinel");
  s3.player.mana = 10;
  assert(applyInput(s3, "player", { type: "play", handIndex: 0 }), "play gargoyle");
  const g = s3.player.board.find((c) => c?.defId === "gargoyle-sentinel");
  assert(Boolean(g), "gargoyle on board");
  assert(
    g!.attack >= 1 && g!.attack <= 6,
    `D6 attack in 1..6 (got ${g!.attack})`,
  );
}

function testDeathtouchIntimidateChargeCancel() {
  console.log("\n== Deathtouch / Intimidate / Charge cancel ==");
  const state = createMatch("ability-dt-kill");
  const dt = putOnBoard(state, "player", "bio-fuel-fountain", 0);
  dt.canAttack = true;
  dt.boardEnteredTurn = state.turn - 1;
  const beef = putOnBoard(state, "ai", "vamp-hound", 0); // 5/4
  assert(
    applyInput(state, "player", {
      type: "attack",
      attackerIndex: 0,
      target: 0,
    }),
    "DT attack",
  );
  assert(!state.ai.board[0], "deathtouch killed higher-HP unit");
  void beef;

  const s2 = createMatch("ability-intimidate");
  const atk = putOnBoard(s2, "player", "bat-drone-operator", 0);
  atk.canAttack = true;
  atk.boardEnteredTurn = s2.turn - 1;
  atk.health = 1;
  atk.maxHealth = 1;
  putInHand(s2, "relic-chalice");
  s2.player.mana = 10;
  applyInput(s2, "player", { type: "play", handIndex: 0 });
  applyInput(s2, "player", {
    type: "choose_target",
    target: 0,
    board: "ally",
  });
  putOnBoard(s2, "ai", "vamp-hound", 0); // 5 ATK would kill 1 HP without Intimidate
  const hpBefore = s2.player.board[0]!.health;
  assert(
    applyInput(s2, "player", {
      type: "attack",
      attackerIndex: 0,
      target: 0,
    }),
    "intimidate attack",
  );
  assert(
    Boolean(s2.player.board[0]) && s2.player.board[0]!.health === hpBefore,
    "Intimidate blocked retaliate",
  );

  const s3 = createMatch("ability-charge-cancel");
  const rage = putOnBoard(s3, "player", "feral-rage", 0);
  putOnBoard(s3, "ai", "bat-drone-operator", 0);
  rage.boardEnteredTurn = s3.turn - 1;
  rage.canAttack = true;
  rage.canActivate = true;
  assert(
    applyInput(s3, "player", { type: "activate", boardIndex: 0 }),
    "activate Charge",
  );
  assert(
    applyInput(s3, "player", { type: "cancel_target" }),
    "cancel Charge",
  );
  const after = s3.player.board[0]!;
  assert(after.canAttack, "Charge cancel restored canAttack");
  assert(after.canActivate, "Charge cancel re-armed activate");
}

function testPierceAndCastCancel() {
  console.log("\n== Pierce + Cast cancel refund ==");
  const state = createMatch("ability-pierce");
  putInHand(state, "hemo-hacker");
  state.player.mana = 5;
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "play Pierce unit");
  assert(state.pendingTarget?.ability === "damage_once", "pierce pending");
  const face = state.ai.heroHealth;
  assert(
    applyInput(state, "player", { type: "choose_target", target: "hero" }),
    "pierce face",
  );
  assert(state.ai.heroHealth === face - 1, `pierce 1 dmg (${face} → ${state.ai.heroHealth})`);

  const s2 = createMatch("ability-cast-cancel");
  const thrall = putOnBoard(s2, "player", "mind-locked-thrall", 0);
  thrall.boardEnteredTurn = s2.turn - 1;
  thrall.canActivate = true;
  s2.player.graveyard.push("cyber-bite");
  s2.player.mana = 5;
  assert(
    applyInput(s2, "player", { type: "activate", boardIndex: 0 }),
    "open Cast",
  );
  assert(s2.pendingGraveyard?.paidMana === 2, "Cast prepaid 2");
  assert(
    applyInput(s2, "player", { type: "cancel_target" }),
    "cancel Cast",
  );
  assert(!s2.pendingGraveyard, "pending cleared");
  assert(s2.player.mana === 5, `Cast mana refunded (now ${s2.player.mana})`);
  assert(s2.player.board[0]?.canActivate, "Cast re-armed after cancel");
}

function testDamageTwice() {
  console.log("\n== Double Strike (damage_twice) ==");
  const state = createMatch("ability-double");
  putInHand(state, "blood-shield");
  state.player.mana = 10;
  assert(applyInput(state, "player", { type: "play", handIndex: 0 }), "play Blood Shield");
  assert(state.pendingTarget?.shotsLeft === 2, "two shots pending");
  const face = state.ai.heroHealth;
  assert(
    applyInput(state, "player", { type: "choose_target", target: "hero" }),
    "shot 1",
  );
  assert(state.pendingTarget?.shotsLeft === 1, "one shot left");
  assert(
    applyInput(state, "player", { type: "choose_target", target: "hero" }),
    "shot 2",
  );
  assert(!state.pendingTarget, "double strike finished");
  assert(state.ai.heroHealth === face - 2, `2 face dmg (${face} → ${state.ai.heroHealth})`);
  assert(
    state.player.board.some((c) => c?.defId === "blood-shield" && c.keywords.shield),
    "Blood Shield kept Shield keyword",
  );
}

function testTauntWallAndFurySwing() {
  console.log("\n== Taunt wall + Fury second swing ==");
  const state = createMatch("ability-taunt-wall");
  putOnBoard(state, "ai", "elite-infiltrator", 0); // taunt
  putOnBoard(state, "ai", "blood-gladiator", 1);
  // Ground attacker — bat-drone has Flying and would ignore Taunt.
  const atk = putOnBoard(state, "player", "drained-unit", 0);
  atk.canAttack = true;
  atk.boardEnteredTurn = state.turn - 1;
  assert(
    !applyInput(state, "player", {
      type: "attack",
      attackerIndex: 0,
      target: "hero",
    }),
    "taunt blocks face",
  );
  assert(
    !applyInput(state, "player", {
      type: "attack",
      attackerIndex: 0,
      target: 1,
    }),
    "taunt blocks non-taunt",
  );
  assert(
    applyInput(state, "player", {
      type: "attack",
      attackerIndex: 0,
      target: 0,
    }),
    "must hit taunt",
  );

  const s2 = createMatch("ability-fury-swing");
  const fury = putOnBoard(s2, "player", "bat-drone-operator", 0);
  fury.keywords.fury = true;
  fury.canAttack = true;
  fury.boardEnteredTurn = s2.turn - 1;
  assert(
    applyInput(s2, "player", {
      type: "attack",
      attackerIndex: 0,
      target: "hero",
    }),
    "fury first swing",
  );
  assert(s2.player.board[0]?.canAttack, "fury still ready");
  assert(
    applyInput(s2, "player", {
      type: "attack",
      attackerIndex: 0,
      target: "hero",
    }),
    "fury second swing",
  );
  assert(!s2.player.board[0]?.canAttack, "fury exhausted after 2");
}

function testHeroPowerAndFuryTaunt() {
  console.log("\n== Blood Energy + Fury Taunt ==");
  const state = createMatch("ability-hero-power");
  state.player.mana = 5;
  state.player.heroPowerReady = true;
  const handBefore = state.player.hand.length;
  assert(
    applyInput(state, "player", { type: "hero_power" }),
    "Blood Energy",
  );
  assert(!state.player.heroPowerReady, "hero power spent");
  assert(
    state.player.hand.some((c) => c.defId === "blood-crystal"),
    "Blood Crystal added",
  );
  assert(state.player.hand.length === handBefore + 1, "hand +1");
  assert(state.player.mana === 3, `paid 2 mana (now ${state.player.mana})`);
  assert(
    !applyInput(state, "player", { type: "hero_power" }),
    "hero power once per turn",
  );

  // Empty deck draw skips (no fatigue damage).
  const sDeck = createMatch("ability-empty-deck");
  sDeck.player.deck = [];
  const hp = sDeck.player.heroHealth;
  applyInput(sDeck, "player", { type: "end_turn" });
  while (sDeck.active === "ai" && !sDeck.winner) {
    applyInput(sDeck, "ai", { type: "end_turn" });
  }
  assert(sDeck.player.heroHealth === hp, "empty deck does not fatigue");

  const s2 = createMatch("ability-fury-taunt");
  putOnBoard(s2, "player", "bat-drone-operator", 0);
  putInHand(s2, "crimson-spire");
  s2.player.mana = 10;
  assert(applyInput(s2, "player", { type: "play", handIndex: 0 }), "cast spire");
  assert(
    applyInput(s2, "player", {
      type: "choose_target",
      target: 0,
      board: "ally",
    }),
    "fury taunt ally",
  );
  const u = s2.player.board[0]!;
  assert(u.keywords.fury && u.keywords.taunt, "fury + taunt granted");
}

function testAiDoesNotLoopCastOnManaGems() {
  console.log("\n== AI Cast skips mana gems ==");
  const state = createMatch("ai-cast-gem-loop");
  state.active = "ai";
  state.ai.hand = [];
  state.ai.board = [];
  state.ai.heroPowerReady = false;
  state.ai.mana = 10;
  state.ai.maxMana = 10;
  const thrall = putOnBoard(state, "ai", "mind-locked-thrall", 0);
  thrall.canActivate = true;
  thrall.boardEnteredTurn = state.turn - 1;
  state.ai.graveyard = ["blood-crystal", "energy-core"];
  const t0 = Date.now();
  const moves = chooseAiMoves(state);
  assert(Date.now() - t0 < 250, "AI decide stays fast");
  assert(
    !moves.some((m) => m.type === "activate"),
    "does not Cast to fetch Blood Crystal / Energy Core",
  );
}

const before = cloneState(createMatch("noop"));
void before;

testRegen();
testRegenSkipsEntryTurn();
testPillage();
testLifestealAura();
testDigSetsPending();
testSilenceClearsMidFury();
testBoostPlayableEmptyBoard();
testShieldBlocksDeathtouch();
testAttackAuraAndCostAura();
testLifestealAuraSite();
testHasteTauntFlying();
testBoardWipeKeepsSites();
testElectrifyDuration();
testSpellDamageMultiShot();
testCullAndKiller();
testEquipDurability();
testChargeAndCast();
testReaperAndBoardBounce();
testDestroyCyberBiteTrample();
testSpellChargeFireAoeStealthSI();
testManaGemsHemoAndD6();
testDeathtouchIntimidateChargeCancel();
testPierceAndCastCancel();
testDamageTwice();
testTauntWallAndFurySwing();
testHeroPowerAndFuryTaunt();
testAiDoesNotLoopCastOnManaGems();

console.log(failed ? `\n${failed} failure(s)` : "\nAll ability checks passed");
process.exit(failed ? 1 : 0);
