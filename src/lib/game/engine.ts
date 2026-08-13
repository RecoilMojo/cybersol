import { abilityLines, hasAbility, keywordsFromAbilities } from "./abilities";
import { buildStarterDeck, getCardDef } from "./cards";
import { createRng } from "./rng";
import {
  HERO_HEALTH,
  HERO_POWER_COST,
  MAX_BOARD,
  MAX_HAND,
  MAX_MANA,
  MAX_TURNS,
  OPENING_HAND,
  START_MANA,
  type AbilityId,
  type ActionHistory,
  type CardInstance,
  type GameInput,
  type GameState,
  type PlayerState,
  type TargetBoard,
} from "./types";

function hasBlockingPending(state: GameState) {
  return Boolean(state.pendingTarget || state.pendingGraveyard);
}

/**
 * Unity Player.CanPayAbility: `!exhausted || !ability.exhaust`.
 * Cast (exhaust:0) stays available while sick/spent; Charge (exhaust:1) needs an action.
 */
function syncActivatedAbility(card: CardInstance) {
  if (card.silenced) {
    card.canActivate = false;
    return;
  }
  const abs = getCardDef(card.defId).abilities;
  if (hasAbility(abs, "cast_return_spell")) {
    card.canActivate = true;
    return;
  }
  if (hasAbility(abs, "charge_bounce")) {
    card.canActivate = card.canAttack;
    return;
  }
  card.canActivate = false;
}

function emptyBoard(): (CardInstance | null)[] {
  return Array.from({ length: MAX_BOARD }, () => null);
}

export function boardCount(player: PlayerState) {
  let n = 0;
  for (const c of player.board) if (c) n += 1;
  return n;
}

function firstEmptySlot(player: PlayerState) {
  return player.board.findIndex((c) => c == null);
}

function refreshSpellDamage(player: PlayerState) {
  let n = 0;
  for (const c of player.board) {
    if (!c || c.silenced) continue;
    if (hasAbility(getCardDef(c.defId).abilities, "spell_damage")) n += 1;
  }
  player.spellDamage = n;
}

let instanceCounter = 0;

function nextInstanceId(rng: ReturnType<typeof createRng>): string {
  instanceCounter += 1;
  return `c${instanceCounter}_${rng.int(1e9)}`;
}

function makeInstance(defId: string, rng: ReturnType<typeof createRng>): CardInstance {
  const def = getCardDef(defId);
  return {
    instanceId: nextInstanceId(rng),
    defId,
    attack: def.attack,
    health: def.health,
    maxHealth: def.health,
    bonusAttack: 0,
    attacksThisTurn: 0,
    canAttack: false,
    canActivate: false,
    silenced: false,
    keywords: keywordsFromAbilities(def.abilities),
  };
}

function isSpellCard(defId: string) {
  return getCardDef(defId).kind === "spell";
}

function isOffBoardPlay(defId: string) {
  const kind = getCardDef(defId).kind;
  return kind === "spell" || kind === "equipment";
}

function isStructure(defId: string) {
  return getCardDef(defId).kind === "structure";
}

/** Unity Dig is_character — units only (not spells, sites, or gear). */
function isCharacterCard(defId: string) {
  const kind = getCardDef(defId).kind;
  return kind !== "spell" && kind !== "structure" && kind !== "equipment";
}

function countAbilityAura(player: PlayerState, ability: AbilityId) {
  let n = 0;
  for (const c of player.board) {
    if (!c || c.silenced) continue;
    if (hasAbility(getCardDef(c.defId).abilities, ability)) n += 1;
  }
  return n;
}

/** Unity town_aura_dream3 / is_dream — Cyber Vamps only; Neutral gems stay full cost. */
export function isManaGem(defId: string) {
  return defId === "energy-core" || defId === "blood-crystal";
}

function receivesCostAura(defId: string) {
  return !isManaGem(defId);
}

export function getPlayCost(player: PlayerState, defId: string) {
  const base = getCardDef(defId).cost;
  const discount = receivesCostAura(defId)
    ? countAbilityAura(player, "cost_aura_1")
    : 0;
  return Math.max(0, base - discount);
}

function attackAuraBonus(player: PlayerState) {
  return (
    countAbilityAura(player, "attack_aura_2") * 2 + countAbilityAura(player, "atk_aura_1")
  );
}

function hasLifestealAura(player: PlayerState) {
  return countAbilityAura(player, "lifesteal_aura") > 0;
}

function equipmentAttackBonus(card: CardInstance) {
  if (!card.equipment) return 0;
  const eq = getCardDef(card.equipment.defId);
  return hasAbility(eq.abilities, "equip_atk_1") ? 1 : 0;
}

function hasSafeStrike(card: CardInstance) {
  if (!card.equipment) return false;
  return hasAbility(getCardDef(card.equipment.defId).abilities, "equip_atk_1");
}

function refreshBoardAttacks(player: PlayerState) {
  const aura = attackAuraBonus(player);
  const lifeAura = hasLifestealAura(player);
  for (const c of player.board) {
    if (!c) continue;
    const def = getCardDef(c.defId);
    // Unity town_aura_dream* filters is_character — sites/Artifacts stay at printed ATK
    // for retaliate and never pick up Lifesteal from Weaver.
    const character = isCharacterCard(c.defId);
    // Unity EffectSetStat Attack=1: absolute override while status lasts; auras/gear
    // still apply; printed + bonus + Bless ATK resume when Electrify fades.
    if (c.electrified) {
      c.attack = Math.max(
        0,
        1 + (character ? aura : 0) + equipmentAttackBonus(c),
      );
    } else {
      c.attack = Math.max(
        0,
        def.attack +
          c.bonusAttack +
          (c.tempAttack ?? 0) +
          (character ? aura : 0) +
          equipmentAttackBonus(c),
      );
    }
    if (isStructure(c.defId)) c.canAttack = false;
    if (lifeAura && character && !c.silenced) c.keywords.lifesteal = true;
    else if ((!lifeAura || !character) && !c.silenced && c.keywords.lifesteal) {
      // Aura-granted LS only (no innate LS cards in this set yet).
      c.keywords.lifesteal = false;
    }
  }
}

function refreshBothBoards(state: GameState) {
  refreshBoardAttacks(state.player);
  refreshBoardAttacks(state.ai);
  refreshSpellDamage(state.player);
  refreshSpellDamage(state.ai);
}

function applyLifesteal(
  player: PlayerState,
  amount: number,
  state?: GameState,
  sourceName?: string,
) {
  if (amount <= 0) return;
  const before = player.heroHealth;
  player.heroHealth = Math.min(HERO_HEALTH, player.heroHealth + amount);
  const healed = player.heroHealth - before;
  if (healed > 0 && state) {
    pushLog(
      state,
      `${sourceName ?? (player.id === "player" ? "You" : "Enemy")} Lifesteal +${healed}.`,
    );
  }
}

function pushLog(state: GameState, msg: string) {
  state.log = [...state.log.slice(-11), msg];
}

/** Unity Player.AddHistory — chips for the active actor this turn. */
function pendingSourceDefId(
  state: GameState,
  pending: NonNullable<GameState["pendingTarget"]>,
): string {
  if (pending.spellDefId) return pending.spellDefId;
  for (const side of [state.player, state.ai]) {
    const card = side.board.find((c) => c?.instanceId === pending.sourceInstanceId);
    if (card) return card.defId;
  }
  return pending.spellDefId ?? "blood-crystal";
}

function pushHistory(
  state: GameState,
  entry: Omit<ActionHistory, "text"> & { text?: string },
) {
  const cardName = getCardDef(entry.cardDefId).name;
  let text = entry.text;
  if (!text) {
    if (entry.type === "play") text = `${cardName} was played`;
    else if (entry.type === "attack_hero") {
      text = `${cardName} attacked ${entry.who === "player" ? "the enemy" : "you"}`;
    } else if (entry.type === "attack") {
      const t = entry.targetDefId ? getCardDef(entry.targetDefId).name : "a card";
      text = `${cardName} attacked ${t}`;
    } else if (entry.type === "ability") {
      const ability = entry.abilityTitle ?? "ability";
      const t = entry.targetDefId ? getCardDef(entry.targetDefId).name : undefined;
      text = t
        ? `${cardName} casted ${ability} on ${t}`
        : `${cardName} casted ${ability}`;
    } else if (entry.type === "hero_power") {
      text = `${cardName} casted ${entry.abilityTitle ?? "Blood Energy"}`;
    } else {
      text = cardName;
    }
  }
  state.history = [...state.history.slice(-7), { ...entry, text }];
}

function draw(player: PlayerState, rng: ReturnType<typeof createRng>, n = 1, state?: GameState) {
  // Unity GameLogic.DrawCard — empty deck or full hand simply skips (no fatigue, no mill).
  for (let i = 0; i < n; i++) {
    if (player.deck.length === 0) {
      if (state) {
        pushLog(
          state,
          `${player.id === "player" ? "You" : "Enemy"} — deck empty, no draw.`,
        );
      }
      continue;
    }
    if (player.hand.length >= MAX_HAND) {
      if (state) {
        pushLog(
          state,
          `${player.id === "player" ? "You" : "Enemy"} — hand full, draw skipped.`,
        );
      }
      continue;
    }
    const id = player.deck.shift()!;
    player.hand.push(makeInstance(id, rng));
  }
}

function emptyPlayer(id: "player" | "ai", deck: string[]): PlayerState {
  return {
    id,
    heroHealth: HERO_HEALTH,
    mana: 0,
    maxMana: 0,
    spellDamage: 0,
    heroPowerReady: true,
    deck: [...deck],
    hand: [],
    board: emptyBoard(),
    graveyard: [],
  };
}

function sideOf(state: GameState, who: "player" | "ai") {
  return who === "player" ? state.player : state.ai;
}

function oppOf(state: GameState, who: "player" | "ai") {
  return who === "player" ? state.ai : state.player;
}

function findBoardCard(state: GameState, instanceId: string): CardInstance | null {
  for (const side of [state.player, state.ai]) {
    for (const c of side.board) {
      if (c?.instanceId === instanceId) return c;
    }
  }
  return null;
}

/** Unity AbilityData.CanTarget — Deathtouch pierces Spell Immunity. */
function sourcePiercesSpellImmunity(state: GameState, sourceInstanceId?: string) {
  if (!sourceInstanceId) return false;
  return Boolean(findBoardCard(state, sourceInstanceId)?.keywords.deathtouch);
}

function clearTempBless(card: CardInstance) {
  const hp = card.tempHealth ?? 0;
  if (!(card.tempAttack ?? 0) && !hp && !card.tempDuration) return;
  // Unity HPBonus fade: GetHP loses ongoing HP — over-damaged units die
  // (web stores current HP, so subtract tempHealth; don't only clamp max).
  card.maxHealth = Math.max(1, card.maxHealth - hp);
  card.health = Math.max(0, card.health - hp);
  card.health = Math.min(card.health, card.maxHealth);
  card.tempAttack = 0;
  card.tempHealth = 0;
  card.tempDuration = 0;
}

function silenceCard(card: CardInstance) {
  const def = getCardDef(card.defId);
  // Unity clear_status_all + reset_stats (SetCard) + Silenced — equipment stays
  // attached (ResetStat does not unequip); gear ATK/Intimidate still apply.
  const damageTaken = Math.max(0, card.maxHealth - card.health);
  card.silenced = true;
  card.canActivate = false;
  card.electrified = false;
  card.electrifyDuration = 0;
  card.bonusAttack = 0;
  card.tempAttack = 0;
  card.tempHealth = 0;
  card.tempDuration = 0;
  card.maxHealth = Math.max(1, def.health);
  card.health = Math.max(0, card.maxHealth - damageTaken);
  card.keywords = {
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
  };
  // Dropping Fury must also drop a mid-swing second attack.
  if (card.attacksThisTurn > 0 || isStructure(card.defId)) {
    card.canAttack = false;
  }
}

/** Unity EndTurn ReduceStatusDurations — Bless / Electrify last 2 end-turn ticks. */
function tickTempBuffs(state: GameState) {
  for (const side of [state.player, state.ai]) {
    for (const c of side.board) {
      if (!c) continue;
      if (c.tempDuration) {
        c.tempDuration -= 1;
        if (c.tempDuration <= 0) {
          const name = getCardDef(c.defId).name;
          clearTempBless(c);
          pushLog(state, `Bless fades from ${name}.`);
        }
      }
      if (c.electrifyDuration) {
        c.electrifyDuration -= 1;
        if (c.electrifyDuration <= 0) {
          c.electrified = false;
          c.electrifyDuration = 0;
          pushLog(state, `Electrify fades from ${getCardDef(c.defId).name}.`);
        }
      }
    }
  }
  buryDead(state.player);
  buryDead(state.ai);
  refreshBothBoards(state);
}

function buryDead(player: PlayerState) {
  for (let i = 0; i < player.board.length; i++) {
    const unit = player.board[i];
    if (!unit || unit.health > 0) continue;
    if (unit.equipment) player.graveyard.push(unit.equipment.defId);
    player.graveyard.push(unit.defId);
    player.board[i] = null;
  }
}

function attachEquipment(unit: CardInstance, equipDefId: string, player: PlayerState) {
  if (unit.equipment) {
    player.graveyard.push(unit.equipment.defId);
  }
  const eq = getCardDef(equipDefId);
  unit.equipment = {
    defId: equipDefId,
    health: Math.max(1, eq.health),
    maxHealth: Math.max(1, eq.health),
  };
}

/** Unity equip_attack_use — lose 1 durability after each attack; 0 → GY. */
function consumeEquipmentDurability(
  attacker: CardInstance,
  owner: PlayerState,
  state: GameState,
) {
  if (!attacker.equipment) return;
  const gear = attacker.equipment;
  const gearName = getCardDef(gear.defId).name;
  gear.health -= 1;
  if (gear.health > 0) return;
  owner.graveyard.push(gear.defId);
  attacker.equipment = undefined;
  pushLog(state, `${gearName} shatters.`);
  refreshBoardAttacks(owner);
}

type DamageSource = "combat" | "character" | "spell" | "generic";

/**
 * Unity DamageCard — Shield absorbs with no Trample/Lifesteal leak.
 * Spell Immunity blocks non-character / generic ability damage unless Deathtouch.
 * Combat and character-sourced hits pierce Spell Immunity (Unity CardType.Character).
 */
function damageUnit(
  card: CardInstance,
  amount: number,
  fromDeathtouch = false,
  source: DamageSource = "combat",
): { landed: number; excess: number } {
  if (amount <= 0) return { landed: 0, excess: 0 };
  if (
    card.keywords.spellImmunity &&
    !fromDeathtouch &&
    (source === "spell" || source === "generic")
  ) {
    return { landed: 0, excess: 0 };
  }
  // Unity Shell/Shield — first hit is fully negated (no trample, no lifesteal).
  if (card.keywords.shield) {
    card.keywords.shield = false;
    return { landed: 0, excess: 0 };
  }
  const landed = Math.min(amount, Math.max(0, card.health));
  const excess = Math.max(0, amount - Math.max(0, card.health));
  card.health -= amount;
  // Unity Deathtouch — "Kill any character card it damages" (sites survive).
  if (fromDeathtouch && isCharacterCard(card.defId)) card.health = 0;
  return { landed, excess };
}

/** Enemy units that must be attacked first (Taunt), ignoring Stealth taunts as unattackable. */
export function getTauntBlockers(defender: PlayerState): number[] {
  const idxs: number[] = [];
  for (let i = 0; i < defender.board.length; i++) {
    const c = defender.board[i];
    if (c && c.keywords.taunt && !c.keywords.stealth) idxs.push(i);
  }
  return idxs;
}

export function canAttackTarget(
  attacker: CardInstance,
  defender: PlayerState,
  target: "hero" | number,
): boolean {
  if (!attacker.canAttack) return false;
  const taunts = getTauntBlockers(defender);
  const ignoresTaunt = attacker.keywords.flying;

  if (target === "hero") {
    if (taunts.length > 0 && !ignoresTaunt) return false;
    return true;
  }
  if (typeof target !== "number" || target < 0 || target >= defender.board.length) {
    return false;
  }
  const victim = defender.board[target];
  if (!victim) return false;
  if (victim.keywords.stealth) return false;
  if (taunts.length > 0 && !ignoresTaunt && !victim.keywords.taunt) return false;
  return true;
}

/** PlayTarget ability on cast/equip (not activated Charge/Cast). */
export function onPlayTargetAbility(defAbilities: AbilityId[]): AbilityId | null {
  for (const id of defAbilities) {
    const meta = abilityLines([id])[0];
    if (meta?.needsTarget && !meta.activated) return id;
  }
  return null;
}

function resolveInstantOnPlay(
  state: GameState,
  who: "player" | "ai",
  card: CardInstance,
  rng: ReturnType<typeof createRng>,
) {
  const def = getCardDef(card.defId);
  const me = sideOf(state, who);
  const opp = oppOf(state, who);

  if (hasAbility(def.abilities, "haste")) {
    card.canAttack = true;
    pushLog(state, `${def.name} gains Haste.`);
  }
  if (hasAbility(def.abilities, "stealth")) {
    card.keywords.stealth = true;
  }
  if (hasAbility(def.abilities, "roll_d6_attack")) {
    const roll = rng.int(6) + 1;
    card.bonusAttack += roll;
    refreshBothBoards(state);
    pushLog(state, `${def.name}: rolled ${roll} — +${roll} attack (${card.attack}).`);
  }
  if (hasAbility(def.abilities, "blood_crystal")) {
    // Unity spell_summon_mana2 — units gain a Crystal in hand; the token itself is +2 mana.
    if (def.id === "blood-crystal") {
      me.mana = Math.min(MAX_MANA, me.mana + 2);
      pushLog(state, `${def.name}: +2 mana.`);
    } else if (me.hand.length >= MAX_HAND) {
      pushLog(state, `${def.name}: Blood Crystal — hand full.`);
    } else {
      me.hand.push(makeInstance("blood-crystal", rng));
      pushLog(state, `${def.name}: Blood Crystal added to hand.`);
    }
  }
  if (hasAbility(def.abilities, "dig")) {
    const digTargets = me.graveyard.filter((id) => isCharacterCard(id));
    if (digTargets.length === 0) {
      pushLog(state, `${def.name}: Dig — no characters in graveyard.`);
    } else if (me.hand.length >= MAX_HAND) {
      pushLog(state, `${def.name}: Dig — hand full.`);
    } else {
      state.pendingGraveyard = {
        who,
        sourceInstanceId: card.instanceId,
        title: "Dig",
        filter: "character",
      };
      pushLog(state, `${def.name}: Dig — choose a fallen character.`);
    }
  }
  // After Haste (unexhaust) so Charge can unlock same turn when ready.
  syncActivatedAbility(card);
  if (hasAbility(def.abilities, "fire_aoe2")) {
    const dmg = 2 + me.spellDamage;
    // Unity EffectDamage from a Character pierces Spell Immunity.
    for (const c of me.board) {
      if (c && c.instanceId !== card.instanceId) {
        damageUnit(c, dmg, false, "character");
      }
    }
    for (const c of opp.board) if (c) damageUnit(c, dmg, false, "character");
    buryDead(me);
    buryDead(opp);
    pushLog(state, `${def.name}: Fire Damage — ${dmg} to all other cards.`);
  }
  refreshBothBoards(state);
  void rng;
}

function beginPendingTarget(
  state: GameState,
  who: "player" | "ai",
  card: CardInstance,
  ability: AbilityId,
  spell?: { defId: string; cost: number },
  extras?: { restoreCanAttack?: boolean },
) {
  const meta = abilityLines([ability])[0];
  const shotsLeft =
    ability === "damage_thrice" ? 3 : ability === "damage_twice" ? 2 : undefined;
  state.pendingTarget = {
    who,
    ability,
    sourceInstanceId: card.instanceId,
    title: meta.title,
    allowHero:
      ability === "damage_thrice" ||
      ability === "damage_once" ||
      ability === "damage_twice",
    allyTarget: Boolean(meta.allyTarget),
    anyBoard: Boolean(meta.anyBoard),
    spellDefId: spell?.defId,
    spellCost: spell?.cost,
    restoreCanAttack: extras?.restoreCanAttack,
    shotsLeft,
  };
  pushLog(
    state,
    shotsLeft && shotsLeft > 1
      ? `Choose a target for ${meta.title} (${shotsLeft} shots).`
      : `Choose a target for ${meta.title}.`,
  );
}

function resolveTargetBoard(
  ability: AbilityId,
  board?: TargetBoard,
): TargetBoard {
  const meta = abilityLines([ability])[0];
  if (board) return board;
  if (meta?.allyTarget) return "ally";
  return "enemy";
}

export function isValidAbilityTarget(
  state: GameState,
  ability: AbilityId,
  who: "player" | "ai",
  target: "hero" | number,
  board?: TargetBoard,
  sourceInstanceId?: string,
): boolean {
  const me = sideOf(state, who);
  const opp = oppOf(state, who);
  if (target === "hero") {
    return (
      ability === "damage_thrice" ||
      ability === "damage_once" ||
      ability === "damage_twice"
    );
  }
  const meta = abilityLines([ability])[0];
  const side = resolveTargetBoard(ability, board);
  // Unity ConditionOwnerAI: AI prefers enemies except Bless (allies only).
  if (
    who === "ai" &&
    meta?.anyBoard &&
    ((ability === "boost_2_2" && side === "enemy") ||
      (ability !== "boost_2_2" && side === "ally"))
  ) {
    return false;
  }
  const owner = side === "ally" ? me : opp;
  if (target < 0 || target >= owner.board.length) return false;
  const victim = owner.board[target];
  if (!victim) return false;
  // Unity AbilityData.CanTarget — Stealth cannot be selected.
  if (victim.keywords.stealth) return false;
  // Unity Spell Immunity blocks targeted effects unless caster has Deathtouch.
  const pierceSrc =
    sourceInstanceId ?? state.pendingTarget?.sourceInstanceId;
  if (
    victim.keywords.spellImmunity &&
    !sourcePiercesSpellImmunity(state, pierceSrc)
  ) {
    return false;
  }
  const site = getCardDef(victim.defId).kind === "structure";
  // Sites: silence/damage/destroy OK. Unity IsPlayTargetValid requires EVERY PlayTarget
  // ability to accept the target — Spire/Cyber Bite include spell_fury (is_character),
  // so sites are illegal even though spell_taunt alone would allow them.
  if (
    site &&
    (ability === "killer" ||
      ability === "cull" ||
      ability === "electrify" ||
      ability === "cyber_bite" ||
      ability === "fury_taunt" ||
      ability === "boost_2_2" ||
      ability === "equip_atk_1" ||
      ability === "charge_bounce")
  ) {
    return false;
  }
  if (ability === "killer") return victim.attack >= 5;
  if (ability === "cull") return victim.attack <= 4;
  // Prefer explicit source id (pre-pending battlecry checks) over pendingTarget.
  const srcId =
    sourceInstanceId ?? state.pendingTarget?.sourceInstanceId ?? null;
  const notSelf = !srcId || victim.instanceId !== srcId;
  if (ability === "boost_2_2" || ability === "charge_bounce" || ability === "silence") {
    return notSelf;
  }
  if (
    ability === "damage_thrice" ||
    ability === "damage_twice" ||
    ability === "damage_once"
  ) {
    return notSelf;
  }
  if (
    ability === "electrify" ||
    ability === "destroy_target" ||
    ability === "cyber_bite" ||
    ability === "fury_taunt" ||
    ability === "equip_atk_1"
  ) {
    return true;
  }
  return false;
}

function aiAnyBoardSide(ability: AbilityId): TargetBoard {
  return ability === "boost_2_2" ? "ally" : "enemy";
}

export function hasValidAbilityTargets(
  state: GameState,
  ability: AbilityId,
  who: "player" | "ai",
  sourceInstanceId?: string,
): boolean {
  const meta = abilityLines([ability])[0];
  const sides: TargetBoard[] = meta?.anyBoard
    ? who === "ai"
      ? [aiAnyBoardSide(ability)]
      : ["ally", "enemy"]
    : [meta?.allyTarget ? "ally" : "enemy"];
  for (const side of sides) {
    const board = side === "ally" ? sideOf(state, who).board : oppOf(state, who).board;
    if (
      board.some((_, i) =>
        isValidAbilityTarget(state, ability, who, i, side, sourceInstanceId),
      )
    ) {
      return true;
    }
  }
  return (
    ability === "damage_thrice" ||
    ability === "damage_once" ||
    ability === "damage_twice"
  );
}

function bounceBoardToHand(player: PlayerState, rng: ReturnType<typeof createRng>) {
  for (let i = 0; i < player.board.length; i++) {
    const card = player.board[i];
    if (!card) continue;
    player.board[i] = null;
    if (card.equipment) player.graveyard.push(card.equipment.defId);
    if (player.hand.length >= MAX_HAND) {
      player.graveyard.push(card.defId);
      continue;
    }
    player.hand.push(
      makeInstance(card.defId, rng), // fresh copy — summoning sick again
    );
  }
}

function resolveSpellInstant(
  state: GameState,
  who: "player" | "ai",
  defId: string,
  rng: ReturnType<typeof createRng>,
) {
  const def = getCardDef(defId);
  const me = sideOf(state, who);
  const opp = oppOf(state, who);

  if (hasAbility(def.abilities, "board_wipe")) {
    // Unity spell_destroy_all / is_character — sites survive the purge.
    for (const c of me.board) if (c && !isStructure(c.defId)) c.health = 0;
    for (const c of opp.board) if (c && !isStructure(c.defId)) c.health = 0;
    buryDead(me);
    buryDead(opp);
    refreshBothBoards(state);
    pushLog(state, `${def.name}: destroyed all characters.`);
  }
  if (hasAbility(def.abilities, "board_bounce")) {
    // Unity spell_return_all — every board card (including sites) returns.
    bounceBoardToHand(me, rng);
    bounceBoardToHand(opp, rng);
    refreshBothBoards(state);
    pushLog(state, `${def.name}: all cards returned to hand.`);
  }
  if (hasAbility(def.abilities, "hemo_hand_3")) {
    let added = 0;
    for (let i = 0; i < 3; i++) {
      if (me.hand.length >= MAX_HAND) break;
      me.hand.push(makeInstance("hemo-hacker", rng));
      added += 1;
    }
    pushLog(state, `${def.name}: added ${added} Hemo Hacker(s) to hand.`);
  }
  if (hasAbility(def.abilities, "blood_crystal")) {
    me.mana = Math.min(MAX_MANA, me.mana + 2);
    pushLog(state, `${def.name}: +2 mana.`);
  }
  if (hasAbility(def.abilities, "mana_coin")) {
    me.mana = Math.min(MAX_MANA, me.mana + 1);
    pushLog(state, `${def.name}: +1 mana.`);
  }
}

/** Unity after_spell_attack3 — only after a spell fully resolves (not on cancel). */
function triggerSpellCharge(state: GameState, who: "player" | "ai") {
  const me = sideOf(state, who);
  let charged = 0;
  for (const c of me.board) {
    if (
      !c ||
      c.silenced ||
      !hasAbility(getCardDef(c.defId).abilities, "spell_charge")
    ) {
      continue;
    }
    c.bonusAttack += 3;
    charged += 1;
    pushLog(state, `${getCardDef(c.defId).name} Scorching — +3 attack.`);
  }
  if (charged > 0) refreshBothBoards(state);
}

function finishPendingSpell(state: GameState, who: "player" | "ai") {
  const pending = state.pendingTarget;
  if (!pending?.spellDefId) return;
  // Equipment stays attached on the bearer — only spells hit the GY here.
  if (getCardDef(pending.spellDefId).kind === "equipment") return;
  sideOf(state, who).graveyard.push(pending.spellDefId);
  triggerSpellCharge(state, who);
}

function applyChooseTarget(
  state: GameState,
  who: "player" | "ai",
  target: "hero" | number,
  board?: TargetBoard,
): boolean {
  const pending = state.pendingTarget;
  if (!pending || pending.who !== who) return false;
  const me = sideOf(state, who);
  const opp = oppOf(state, who);
  const ability = pending.ability;

  if (target === "hero") {
    if (
      ability !== "damage_thrice" &&
      ability !== "damage_once" &&
      ability !== "damage_twice"
    ) {
      return false;
    }
    const per = 1 + me.spellDamage;
    opp.heroHealth -= per;
    const left = (pending.shotsLeft ?? 1) - 1;
    pushLog(state, `Hit face for ${per}.`);
    pushHistory(state, {
      type: "ability",
      who,
      cardDefId: pendingSourceDefId(state, pending),
      abilityTitle: pending.title,
      text: `${getCardDef(pendingSourceDefId(state, pending)).name} hit face for ${per}`,
    });
    checkWinner(state);
    if (left > 0 && !state.winner) {
      const base = pending.title
        .replace(/\s*\(\d+ left\)$/, "")
        .replace(/\s*\(last shot\)$/, "")
        .replace(/\s*\(\d+ shots\)$/, "");
      state.pendingTarget = {
        ...pending,
        shotsLeft: left,
        title: left > 1 ? `${base} (${left} left)` : `${base} (last shot)`,
      };
      return true;
    }
    finishPendingSpell(state, who);
    state.pendingTarget = null;
    return true;
  }

  if (pending.anyBoard && !board) return false;
  const side = resolveTargetBoard(ability, board);
  if (!isValidAbilityTarget(state, ability, who, target, side)) return false;
  const owner = side === "ally" ? me : opp;
  const victim = owner.board[target];
  if (!victim) return false;
  const name = getCardDef(victim.defId).name;

  if (ability === "silence") {
    silenceCard(victim);
    buryDead(owner);
    refreshSpellDamage(me);
    refreshSpellDamage(opp);
    refreshBothBoards(state);
    pushLog(state, `Silenced ${name} — abilities cleared, stats reset (gear kept).`);
  } else if (ability === "electrify") {
    // Unity play_set_attack_cyber: Attack=1 for duration 2 (one turn cycle).
    // Do not wipe bonus/Bless ATK — they resume when the status fades.
    victim.electrified = true;
    victim.electrifyDuration = 2;
    refreshBothBoards(state);
    pushLog(state, `Electrify — ${name} attack set to 1 for one turn.`);
  } else if (ability === "killer") {
    victim.health = 0;
    buryDead(opp);
    refreshSpellDamage(opp);
    pushLog(state, `Killer destroyed ${name}.`);
  } else if (ability === "cull") {
    victim.health = 0;
    buryDead(opp);
    refreshSpellDamage(opp);
    const rng = createRng(`${state.seed}:cull:${state.turn}:${pending.sourceInstanceId}`);
    draw(me, rng, 1, state);
    pushLog(state, `Cull destroyed ${name} and drew a card.`);
  } else if (
    ability === "damage_thrice" ||
    ability === "damage_once" ||
    ability === "damage_twice"
  ) {
    const per = 1 + me.spellDamage;
    const spellCaster =
      pending.spellDefId != null &&
      getCardDef(pending.spellDefId).kind === "spell";
    const dmgSource: DamageSource = spellCaster ? "spell" : "character";
    const pierce = sourcePiercesSpellImmunity(state, pending.sourceInstanceId);
    damageUnit(victim, per, pierce, dmgSource);
    buryDead(owner);
    refreshSpellDamage(owner);
    const left = (pending.shotsLeft ?? 1) - 1;
    pushLog(state, `Dealt ${per} to ${name}.`);
    pushHistory(state, {
      type: "ability",
      who,
      cardDefId: pendingSourceDefId(state, pending),
      targetDefId: victim.defId,
      abilityTitle: pending.title,
      text: `${getCardDef(pendingSourceDefId(state, pending)).name} dealt ${per} to ${name}`,
    });
    refreshBothBoards(state);
    checkWinner(state);
    if (left > 0 && !state.winner) {
      const base = pending.title
        .replace(/\s*\(\d+ left\)$/, "")
        .replace(/\s*\(last shot\)$/, "")
        .replace(/\s*\(\d+ shots\)$/, "");
      state.pendingTarget = {
        ...pending,
        shotsLeft: left,
        title: left > 1 ? `${base} (${left} left)` : `${base} (last shot)`,
      };
      return true;
    }
    finishPendingSpell(state, who);
    state.pendingTarget = null;
    return true;
  } else if (ability === "boost_2_2") {
    // Unity play_boost2 status AttackBonus+HPBonus value 2, duration 2.
    victim.tempAttack = (victim.tempAttack ?? 0) + 2;
    victim.tempHealth = (victim.tempHealth ?? 0) + 2;
    victim.tempDuration = Math.max(victim.tempDuration ?? 0, 2);
    victim.health += 2;
    victim.maxHealth += 2;
    refreshBothBoards(state);
    pushLog(state, `Bless — ${name} gains +2/+2 until your next turn.`);
  } else if (ability === "charge_bounce") {
    const idx = owner.board.findIndex((c) => c?.instanceId === victim.instanceId);
    if (idx < 0) return false;
    const removed = owner.board[idx]!;
    owner.board[idx] = null;
    if (removed.equipment) owner.graveyard.push(removed.equipment.defId);
    // Hand full — same overflow as Silicon Crypt bounce (card burns to GY).
    if (owner.hand.length >= MAX_HAND) {
      owner.graveyard.push(removed.defId);
      pushLog(state, `Charge — ${name} burned (hand full).`);
    } else {
      const rng = createRng(
        `${state.seed}:charge:${state.turn}:${pending.sourceInstanceId}`,
      );
      owner.hand.push(makeInstance(removed.defId, rng));
      pushLog(state, `Charge — ${name} returned to hand.`);
    }
    refreshSpellDamage(me);
    refreshSpellDamage(opp);
    pushHistory(state, {
      type: "ability",
      who,
      cardDefId: pendingSourceDefId(state, pending),
      targetDefId: victim.defId,
      abilityTitle: "Charge",
      text: `${getCardDef(pendingSourceDefId(state, pending)).name} Charged ${name}`,
    });
    state.pendingTarget = null;
    refreshBothBoards(state);
    checkWinner(state);
    return true;
  } else if (ability === "destroy_target") {
    victim.health = 0;
    buryDead(owner);
    refreshSpellDamage(me);
    refreshSpellDamage(opp);
    pushLog(state, `Destroyed ${name}.`);
  } else if (ability === "cyber_bite") {
    victim.bonusAttack += 3;
    victim.keywords.taunt = true;
    victim.keywords.fury = true;
    // Unity CanAttack — Fury allows a second swing if one attack was already spent.
    if (victim.attacksThisTurn === 1) victim.canAttack = true;
    syncActivatedAbility(victim);
    refreshBothBoards(state);
    pushLog(state, `Cyber Bite — ${name} gains +3 / Fury / Taunt.`);
  } else if (ability === "fury_taunt") {
    // Unity spell_fury + spell_taunt PlayTarget — characters only (see CanTarget gate).
    victim.keywords.taunt = true;
    victim.keywords.fury = true;
    if (victim.attacksThisTurn === 1) victim.canAttack = true;
    syncActivatedAbility(victim);
    pushLog(state, `Spire — ${name} gains Fury and Taunt.`);
  } else if (ability === "equip_atk_1") {
    const gearId = pending.spellDefId ?? "relic-chalice";
    attachEquipment(victim, gearId, me);
    const gear = getCardDef(gearId);
    pushLog(
      state,
      `Equipped ${gear.name} (${Math.max(1, gear.health)}) — ${name} +1 ATK, no counter damage.`,
    );
  }

  const srcDef = pendingSourceDefId(state, pending);
  pushHistory(state, {
    type: "ability",
    who,
    cardDefId: srcDef,
    targetDefId: victim.defId,
    abilityTitle: pending.title,
    text: `${getCardDef(srcDef).name} → ${name}`,
  });
  finishPendingSpell(state, who);
  state.pendingTarget = null;
  refreshBothBoards(state);
  checkWinner(state);
  return true;
}

/** Unity CanTriggerAbilityThisTurn — StartOfTurn skips the entry round. */
function canTriggerStartOfTurn(card: CardInstance, turn: number) {
  const entered = card.boardEnteredTurn;
  if (entered == null || entered < 0) return true;
  return turn > entered;
}

function runStartOfTurnAbilities(state: GameState, who: "player" | "ai") {
  const me = sideOf(state, who);
  const opp = oppOf(state, who);

  for (const c of me.board) {
    if (
      c &&
      !c.silenced &&
      c.keywords.regen &&
      canTriggerStartOfTurn(c, state.turn) &&
      c.health < c.maxHealth
    ) {
      const before = c.health;
      const healed = c.maxHealth - before;
      c.health = c.maxHealth;
      pushLog(
        state,
        `${getCardDef(c.defId).name} Regenerates (+${healed} HP).`,
      );
      pushHistory(state, {
        type: "ability",
        who,
        cardDefId: c.defId,
        abilityTitle: "Regeneration",
        text: `${getCardDef(c.defId).name} Regenerates (+${healed} HP)`,
      });
    }
  }

  // Unity turn_kill_lowest: each Reaper wave kills characters (not sites) with the
  // lowest attack on BOTH boards — including friendly units.
  // Newly entered Reapers do not fire in their entry round.
  const reaperWaves = me.board.filter(
    (c) => c?.keywords.reaper && canTriggerStartOfTurn(c, state.turn),
  ).length;
  for (let wave = 0; wave < reaperWaves; wave++) {
    const characters: CardInstance[] = [];
    for (const side of [me, opp]) {
      for (const c of side.board) {
        if (c && !isStructure(c.defId)) characters.push(c);
      }
    }
    if (characters.length === 0) break;
    let minAtk = Infinity;
    for (const c of characters) minAtk = Math.min(minAtk, c.attack);
    let killed = 0;
    for (const c of characters) {
      if (c.attack !== minAtk) continue;
      pushLog(state, `Reaper destroys ${getCardDef(c.defId).name}.`);
      c.health = 0;
      killed += 1;
    }
    if (killed === 0) break;
    buryDead(me);
    buryDead(opp);
    refreshBothBoards(state);
  }
}

export function createMatch(seed: string): GameState {
  instanceCounter = 0;
  const rng = createRng(seed);
  const base = buildStarterDeck();
  const playerDeck = rng.shuffle(base);
  const aiDeck = rng.shuffle(base);

  const state: GameState = {
    seed,
    turn: 1,
    active: "player",
    player: emptyPlayer("player", playerDeck),
    ai: emptyPlayer("ai", aiDeck),
    winner: null,
    maxTurns: MAX_TURNS,
    pendingTarget: null,
    pendingGraveyard: null,
    history: [],
    log: ["Match start — fight!"],
  };

  // Jump straight into turn 1 (no mulligan — Cybersoul Solo Battle does not gate play).
  state.player.maxMana = START_MANA;
  state.player.mana = START_MANA;
  state.ai.maxMana = START_MANA;
  state.ai.mana = START_MANA;
  draw(state.player, rng, OPENING_HAND);
  draw(state.ai, rng, OPENING_HAND);
  // Unity second_bonus — Energy Core (gain 1 mana) for the second player.
  if (state.ai.hand.length < MAX_HAND) {
    state.ai.hand.push(makeInstance("energy-core", rng));
  }
  ensurePlayableOpener(state.player, rng);
  ensurePlayableOpener(state.ai, rng);
  startTurn(state, "player", createRng(`${seed}:turnstart:1`));
  checkWinner(state);
  return state;
}

function ensurePlayableOpener(
  player: PlayerState,
  rng: ReturnType<typeof createRng>,
) {
  if (player.hand.some((c) => getCardDef(c.defId).cost <= START_MANA)) return;
  const deckIdx = player.deck.findIndex((id) => getCardDef(id).cost <= START_MANA);
  if (deckIdx < 0) return;
  const handIdx = rng.int(player.hand.length);
  const fromDeck = player.deck[deckIdx];
  player.deck[deckIdx] = player.hand[handIdx].defId;
  player.hand[handIdx] = makeInstance(fromDeck, rng);
}

function startTurn(
  state: GameState,
  who: "player" | "ai",
  rng: ReturnType<typeof createRng>,
) {
  const p = who === "player" ? state.player : state.ai;
  const opp = who === "player" ? state.ai : state.player;
  // Unity StartGame sets mana_start, then every StartTurn adds mana_per_turn.
  if (p.maxMana <= 0) p.maxMana = START_MANA;
  p.maxMana = Math.min(MAX_MANA, p.maxMana + 1);
  p.mana = p.maxMana;
  p.heroPowerReady = true;
  for (const c of p.board) {
    if (!c) continue;
    c.attacksThisTurn = 0;
    c.canAttack = !isStructure(c.defId);
    syncActivatedAbility(c);
  }
  for (const c of opp.board) if (c) c.canAttack = false;
  // Unity: first player skips the turn-1 draw; second player draws on their first turn.
  const skipDraw = state.turn <= 1 && who === "player";
  if (!skipDraw) draw(p, rng, 1, state);
  state.active = who;
  state.pendingTarget = null;
  state.pendingGraveyard = null;
  // Unity StartTurn clears that player's history_list before new actions.
  state.history = [];
  runStartOfTurnAbilities(state, who);
  pushLog(state, `${who === "player" ? "Your" : "Enemy"} turn — mana ${p.mana}.`);
}

function checkWinner(state: GameState) {
  if (state.winner) return;
  if (state.player.heroHealth <= 0 && state.ai.heroHealth <= 0) {
    state.winner = "ai";
    pushLog(state, "Both heroes fell — enemy wins the draw.");
    return;
  }
  if (state.player.heroHealth <= 0) {
    state.winner = "ai";
    pushLog(state, "Your hero was destroyed.");
    return;
  }
  if (state.ai.heroHealth <= 0) {
    state.winner = "player";
    pushLog(state, "Enemy hero destroyed — victory!");
    return;
  }
  if (state.turn > state.maxTurns) {
    state.winner =
      state.player.heroHealth >= state.ai.heroHealth ? "player" : "ai";
    pushLog(
      state,
      `Turn limit (${state.maxTurns}) — ${
        state.winner === "player" ? "you win" : "enemy wins"
      } on health.`,
    );
  }
}

function applyChooseGraveyard(
  state: GameState,
  who: "player" | "ai",
  index: number,
): boolean {
  const pending = state.pendingGraveyard;
  if (!pending || pending.who !== who) return false;
  const me = sideOf(state, who);
  if (index < 0 || index >= me.graveyard.length) return false;
  const defId = me.graveyard[index]!;
  if (pending.filter === "spell" && !isSpellCard(defId)) return false;
  if (pending.filter === "character" && !isCharacterCard(defId)) return false;
  if (me.hand.length >= MAX_HAND) {
    // Cast deducts mana when opened — refund if the return can't land.
    if (pending.paidMana) {
      me.mana = Math.min(MAX_MANA, me.mana + pending.paidMana);
    }
    state.pendingGraveyard = null;
    pushLog(state, `${pending.title} cancelled — hand full.`);
    return true;
  }
  me.graveyard.splice(index, 1);
  const rng = createRng(`${state.seed}:gy:${state.turn}:${pending.sourceInstanceId}`);
  me.hand.push(makeInstance(defId, rng));
  state.pendingGraveyard = null;
  pushLog(state, `${pending.title} returned ${getCardDef(defId).name} to hand.`);
  return true;
}

function applyHeroPower(state: GameState, who: "player" | "ai"): boolean {
  if (hasBlockingPending(state)) return false;
  const me = sideOf(state, who);
  if (!me.heroPowerReady) return false;
  if (me.mana < HERO_POWER_COST) return false;
  if (me.hand.length >= MAX_HAND) {
    pushLog(state, "Blood Energy — hand full.");
    return false;
  }
  me.mana -= HERO_POWER_COST;
  me.heroPowerReady = false;
  const rng = createRng(`${state.seed}:heropower:${state.turn}:${who}`);
  me.hand.push(makeInstance("blood-crystal", rng));
  pushHistory(state, {
    type: "hero_power",
    who,
    cardDefId: "blood-crystal",
    abilityTitle: "Blood Energy",
    text: `${who === "player" ? "You" : "Enemy"} used Blood Energy`,
  });
  pushLog(
    state,
    `${who === "player" ? "You" : "Enemy"} used Blood Energy — Blood Crystal added.`,
  );
  return true;
}

function applyActivate(
  state: GameState,
  who: "player" | "ai",
  boardIndex: number,
): boolean {
  if (hasBlockingPending(state)) return false;
  const me = sideOf(state, who);
  if (boardIndex < 0 || boardIndex >= me.board.length) return false;
  const card = me.board[boardIndex];
  if (!card) return false;
  const def = getCardDef(card.defId);
  if (card.silenced || !card.canActivate) return false;

  if (hasAbility(def.abilities, "charge_bounce")) {
    if (!hasValidAbilityTargets(state, "charge_bounce", who, card.instanceId)) {
      pushLog(state, `${def.name}: Charge — no valid targets.`);
      return false;
    }
    // Unity CastAbility — activating clears Stealth.
    if (card.keywords.stealth) {
      card.keywords.stealth = false;
      pushLog(state, `${def.name} revealed.`);
    }
    // Unity activate_send_hand exhausts the card's action.
    const wasReady = card.canAttack;
    card.canActivate = false;
    card.canAttack = false;
    pushHistory(state, {
      type: "ability",
      who,
      cardDefId: def.id,
      abilityTitle: "Charge",
    });
    beginPendingTarget(state, who, card, "charge_bounce", undefined, {
      restoreCanAttack: wasReady,
    });
    return true;
  }

  if (!hasAbility(def.abilities, "cast_return_spell")) return false;
  const cost = abilityLines(["cast_return_spell"])[0].activateCost ?? 2;
  if (me.mana < cost) return false;
  const spellIndexes = me.graveyard
    .map((id, i) => ({ id, i }))
    .filter((e) => isSpellCard(e.id));
  if (spellIndexes.length === 0) {
    pushLog(state, `${def.name}: no spells in graveyard.`);
    return false;
  }
  if (me.hand.length >= MAX_HAND) {
    pushLog(state, `${def.name}: hand full.`);
    return false;
  }
  me.mana -= cost;
  if (card.keywords.stealth) {
    card.keywords.stealth = false;
    pushLog(state, `${def.name} revealed.`);
  }
  // Unity activate_select_discard_spell2 has exhaust:0 — Cast does not spend the
  // unit's action; it can be used again this turn if mana remains.
  state.pendingGraveyard = {
    who,
    sourceInstanceId: card.instanceId,
    title: "Cast",
    filter: "spell",
    paidMana: cost,
  };
  pushHistory(state, {
    type: "ability",
    who,
    cardDefId: def.id,
    abilityTitle: "Cast",
  });
  pushLog(state, `${def.name}: Cast — choose a spell from your graveyard.`);
  return true;
}

function applyPlay(
  state: GameState,
  who: "player" | "ai",
  handIndex: number,
  boardIndex?: number,
): boolean {
  if (hasBlockingPending(state)) return false;
  const p = sideOf(state, who);
  if (handIndex < 0 || handIndex >= p.hand.length) return false;
  const card = p.hand[handIndex];
  const def = getCardDef(card.defId);
  const cost = getPlayCost(p, def.id);
  if (p.mana < cost) return false;

  if (isOffBoardPlay(def.id)) {
    const targetAbility = onPlayTargetAbility(def.abilities);
    // Unity PlayTarget spells/gear cannot be cast with zero legal targets.
    if (
      targetAbility &&
      !hasValidAbilityTargets(state, targetAbility, who, card.instanceId)
    ) {
      return false;
    }
    p.mana -= cost;
    p.hand.splice(handIndex, 1);
    pushHistory(state, { type: "play", who, cardDefId: def.id });
    pushLog(
      state,
      `${who === "player" ? "You" : "AI"} ${
        def.kind === "equipment" ? "equipped" : "cast"
      } ${def.name}.`,
    );
    const rng = createRng(`${state.seed}:spell:${state.turn}:${card.instanceId}`);
    if (targetAbility) {
      beginPendingTarget(state, who, card, targetAbility, {
        defId: def.id,
        cost,
      });
    } else {
      resolveSpellInstant(state, who, def.id, rng);
      p.graveyard.push(def.id);
      if (def.kind === "spell") triggerSpellCharge(state, who);
      refreshBothBoards(state);
    }
    checkWinner(state);
    return true;
  }

  if (boardCount(p) >= MAX_BOARD) return false;
  const targetAbility = onPlayTargetAbility(def.abilities);
  let slot =
    typeof boardIndex === "number" && boardIndex >= 0 && boardIndex < MAX_BOARD
      ? boardIndex
      : firstEmptySlot(p);
  if (slot < 0) return false;
  if (p.board[slot] != null) {
    slot = firstEmptySlot(p);
    if (slot < 0) return false;
  }
  p.mana -= cost;
  p.hand.splice(handIndex, 1);
  card.canAttack = false;
  card.keywords = keywordsFromAbilities(def.abilities);
  card.boardEnteredTurn = state.turn;
  p.board[slot] = card;
  pushHistory(state, { type: "play", who, cardDefId: def.id });
  pushLog(state, `${who === "player" ? "You" : "AI"} played ${def.name}.`);

  const rng = createRng(`${state.seed}:play:${state.turn}:${card.instanceId}`);
  resolveInstantOnPlay(state, who, card, rng);
  if (isStructure(def.id)) card.canAttack = false;

  // Battlecries: enter the board even with no legal target; skip the choose step.
  // (Spells/equipment still hard-gate above — they fizzle without a target.)
  if (
    targetAbility &&
    hasValidAbilityTargets(state, targetAbility, who, card.instanceId)
  ) {
    beginPendingTarget(state, who, card, targetAbility);
  } else if (targetAbility) {
    pushLog(
      state,
      `${def.name}'s ${targetAbility.replace(/_/g, " ")} finds no target.`,
    );
  }

  refreshBothBoards(state);
  checkWinner(state);
  return true;
}

function applyAttack(
  state: GameState,
  who: "player" | "ai",
  attackerIndex: number,
  target: "hero" | number,
): boolean {
  if (hasBlockingPending(state)) return false;
  const atk = sideOf(state, who);
  const def = oppOf(state, who);
  if (attackerIndex < 0 || attackerIndex >= atk.board.length) return false;
  const attacker = atk.board[attackerIndex];
  if (!attacker || !canAttackTarget(attacker, def, target)) return false;

  const atkName = getCardDef(attacker.defId).name;

  if (target === "hero") {
    const dmg = attacker.attack;
    def.heroHealth -= dmg;
    if (attacker.keywords.lifesteal) applyLifesteal(atk, dmg, state, atkName);
    exhaustAfterAttack(attacker);
    if (attacker.keywords.stealth) attacker.keywords.stealth = false;
    if (attacker.keywords.pillage) {
      atk.mana = Math.min(MAX_MANA, atk.mana + 2);
      pushLog(state, `${atkName} Pillages for +2 mana.`);
    }
    pushHistory(state, {
      type: "attack_hero",
      who,
      cardDefId: attacker.defId,
    });
    pushLog(state, `${atkName} hits face for ${dmg}.`);
    consumeEquipmentDurability(attacker, atk, state);
    checkWinner(state);
    return true;
  }

  const victim = def.board[target];
  if (!victim) return false;
  const vicName = getCardDef(victim.defId).name;
  const dmg = attacker.attack;
  const safeStrike = hasSafeStrike(attacker);
  // Unity ResolveAttackHit — sites/Artifacts counter with GetAttack() (printed ATK;
  // character auras do not buff sites).
  const retaliate = safeStrike ? 0 : victim.attack;
  const dtSwing = attacker.keywords.deathtouch && dmg > 0;
  const dtRetaliate = victim.keywords.deathtouch && retaliate > 0;
  const swing = damageUnit(victim, dmg, attacker.keywords.deathtouch);
  const ret =
    retaliate > 0
      ? damageUnit(attacker, retaliate, victim.keywords.deathtouch)
      : { landed: 0, excess: 0 };
  if (attacker.keywords.lifesteal && swing.landed > 0) {
    applyLifesteal(atk, swing.landed, state, atkName);
  }
  if (victim.keywords.lifesteal && ret.landed > 0) {
    applyLifesteal(def, ret.landed, state, vicName);
  }

  // Unity Trample — only when the hit lands (Shield soak blocks overflow).
  if (attacker.keywords.trample && swing.excess > 0) {
    def.heroHealth -= swing.excess;
    if (attacker.keywords.lifesteal) applyLifesteal(atk, swing.excess, state, atkName);
    pushLog(state, `${atkName} Tramples for ${swing.excess} face damage.`);
  }

  exhaustAfterAttack(attacker);
  if (attacker.keywords.stealth) attacker.keywords.stealth = false;

  pushHistory(state, {
    type: "attack",
    who,
    cardDefId: attacker.defId,
    targetDefId: victim.defId,
  });
  if (dtSwing && victim.health <= 0) {
    pushLog(state, `${atkName} Deathtouch destroys ${vicName}.`);
  } else if (dtRetaliate && attacker.health <= 0) {
    pushLog(state, `${vicName} Deathtouch destroys ${atkName}.`);
  } else {
    pushLog(
      state,
      safeStrike
        ? `${atkName} strikes ${vicName} (Intimidate — no return damage).`
        : `${atkName} trades with ${vicName}.`,
    );
  }
  // Durability before bury — shattered gear still lands in GY if the bearer dies.
  if (attacker.health > 0) consumeEquipmentDurability(attacker, atk, state);
  buryDead(def);
  buryDead(atk);
  refreshBothBoards(state);
  checkWinner(state);
  return true;
}

/** Unity ExhaustBattle — Fury keeps canAttack for one extra swing. */
function exhaustAfterAttack(attacker: CardInstance) {
  attacker.attacksThisTurn += 1;
  if (attacker.keywords.fury && attacker.attacksThisTurn < 2) {
    attacker.canAttack = true;
  } else {
    attacker.canAttack = false;
  }
  // Charge shares the action (exhaust:1); Cast does not (exhaust:0).
  syncActivatedAbility(attacker);
}

function applyEndTurn(state: GameState, who: "player" | "ai") {
  if (hasBlockingPending(state)) return;
  tickTempBuffs(state);
  const rng = createRng(`${state.seed}:turn:${state.turn}:${who}`);
  if (who === "player") {
    startTurn(state, "ai", rng);
  } else {
    state.turn += 1;
    startTurn(state, "player", rng);
  }
  checkWinner(state);
}

export function applyInput(
  state: GameState,
  who: "player" | "ai",
  input: GameInput,
): boolean {
  if (state.winner) return false;
  if (state.active !== who) return false;

  switch (input.type) {
    case "play":
      return applyPlay(state, who, input.handIndex, input.boardIndex);
    case "attack":
      return applyAttack(state, who, input.attackerIndex, input.target);
    case "activate":
      return applyActivate(state, who, input.boardIndex);
    case "hero_power":
      return applyHeroPower(state, who);
    case "choose_target":
      return applyChooseTarget(state, who, input.target, input.board);
    case "choose_graveyard":
      return applyChooseGraveyard(state, who, input.index);
    case "cancel_target":
      if (state.pendingGraveyard?.who === who) {
        const pending = state.pendingGraveyard;
        if (pending.paidMana) {
          const me = sideOf(state, who);
          me.mana = Math.min(MAX_MANA, me.mana + pending.paidMana);
          const src = me.board.find((c) => c?.instanceId === pending.sourceInstanceId);
          if (src && !src.silenced) src.canActivate = true;
        }
        state.pendingGraveyard = null;
        pushLog(state, `${pending.title} cancelled.`);
        return true;
      }
      if (!state.pendingTarget || state.pendingTarget.who !== who) return false;
      {
        const me = sideOf(state, who);
        const pending = state.pendingTarget;
        if (pending.spellDefId != null) {
          const cost = pending.spellCost ?? 0;
          me.mana = Math.min(MAX_MANA, me.mana + cost);
          const rng = createRng(
            `${state.seed}:refund:${state.turn}:${pending.sourceInstanceId}`,
          );
          if (me.hand.length < MAX_HAND) {
            me.hand.push(makeInstance(pending.spellDefId, rng));
          } else {
            me.graveyard.push(pending.spellDefId);
          }
        } else if (pending.ability === "charge_bounce") {
          const src = me.board.find((c) => c?.instanceId === pending.sourceInstanceId);
          if (src) {
            // Restore only prior readiness — don't wake summoning-sick / spent units.
            src.canAttack = Boolean(pending.restoreCanAttack);
            // Unity CanPayAbility — Charge stays locked if still exhausted.
            syncActivatedAbility(src);
          }
        }
      }
      state.pendingTarget = null;
      pushLog(state, "Targeting cancelled.");
      return true;
    case "end_turn":
      if (hasBlockingPending(state)) return false;
      applyEndTurn(state, who);
      return true;
    default:
      return false;
  }
}

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export type ReplayResult = GameState & { appliedPlayerInputs: GameInput[] };

export function replayMatch(
  seed: string,
  playerInputs: GameInput[],
  aiPolicy: (state: GameState) => GameInput[],
): ReplayResult {
  const state = createMatch(seed);
  const appliedPlayerInputs: GameInput[] = [];
  let inputIdx = 0;
  let steps = 0;
  const deadline = Date.now() + 2_500;

  while (!state.winner) {
    steps += 1;
    if (steps > 400 || Date.now() > deadline) {
      state.winner = "ai";
      break;
    }
    if (state.active === "player") {
      if (inputIdx >= playerInputs.length) break;
      const input = playerInputs[inputIdx];
      const ok = applyInput(state, "player", input);
      inputIdx += 1;
      if (!ok) {
        state.winner = "ai";
        break;
      }
      appliedPlayerInputs.push(input);
    } else {
      const moves = aiPolicy(state);
      if (moves.length === 0) {
        applyInput(state, "ai", { type: "end_turn" });
      } else {
        for (const m of moves) {
          steps += 1;
          if (steps > 400 || Date.now() > deadline || state.winner || state.active !== "ai") break;
          applyInput(state, "ai", m);
        }
        if (!state.winner && state.active === "ai") {
          applyInput(state, "ai", { type: "end_turn" });
        }
      }
    }
  }

  if (!state.winner) state.winner = "ai";
  return Object.assign(state, { appliedPlayerInputs });
}
