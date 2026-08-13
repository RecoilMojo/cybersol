export type AbilityId =
  | "flying"
  | "taunt"
  | "stealth"
  | "haste"
  | "trample"
  | "deathtouch"
  | "spell_immunity"
  | "pillage"
  | "regen"
  | "silence"
  | "electrify"
  | "fire_aoe2"
  | "reaper"
  | "killer"
  | "damage_thrice"
  | "damage_twice"
  | "shield"
  | "boost_2_2"
  | "charge_bounce"
  | "roll_d6_attack"
  | "blood_crystal"
  | "mana_coin"
  | "dig"
  | "cull"
  | "spell_damage"
  | "cyber_bite"
  | "destroy_target"
  | "cast_return_spell"
  | "fury_taunt"
  | "board_wipe"
  | "board_bounce"
  | "hemo_hand_3"
  | "damage_once"
  | "attack_aura_2"
  | "atk_aura_1"
  | "lifesteal_aura"
  | "cost_aura_1"
  | "spell_charge"
  | "equip_atk_1";

/** Relative to the acting player when resolving SelectTarget. */
export type TargetBoard = "ally" | "enemy";

export type AbilityDef = {
  id: AbilityId;
  title: string;
  desc: string;
  /** Needs a board/hero click after play (or activate). */
  needsTarget?: boolean;
  /** Target your own board instead of the enemy. */
  allyTarget?: boolean;
  /** Either board (Unity Charge — humans; AI still prefers enemies). */
  anyBoard?: boolean;
  /** Activated from board (Unity Cast), not on play. */
  activated?: boolean;
  /** Mana cost when activated. */
  activateCost?: number;
};

export type CardDef = {
  id: string;
  name: string;
  cost: number;
  attack: number;
  health: number;
  rarity: string;
  color: string;
  text: string;
  art?: string;
  /** Default unit; spells/equipment never enter the board; structures sit on board but never attack. */
  kind?: "unit" | "spell" | "structure" | "equipment";
  /** Token / summoned — not drafted into starter decks. */
  token?: boolean;
  abilities: AbilityId[];
};

export type CardKeywords = {
  flying: boolean;
  taunt: boolean;
  stealth: boolean;
  deathtouch: boolean;
  trample: boolean;
  spellImmunity: boolean;
  regen: boolean;
  pillage: boolean;
  reaper: boolean;
  lifesteal: boolean;
  /** Unity Fury — may attack a second time after the first. */
  fury: boolean;
  /** Unity Shield — first hit deals no damage, then clears. */
  shield: boolean;
};

/** Attached Unity equipment (e.g. Relic Chalice) — not a board slot. */
export type AttachedEquipment = {
  defId: string;
  health: number;
  maxHealth: number;
};

export type CardInstance = {
  instanceId: string;
  defId: string;
  attack: number;
  health: number;
  maxHealth: number;
  /** Permanent attack from buffs (Bite, spell charge, etc.). */
  bonusAttack: number;
  /** Unity AttackBonus / HPBonus status (Bless) — ticks down each EndTurn. */
  tempAttack?: number;
  tempHealth?: number;
  /** Remaining end-turn ticks; 0/undefined = none. */
  tempDuration?: number;
  /** Unity play_set_attack_cyber — attack locked to 1 while duration remains. */
  electrified?: boolean;
  /** End-turn ticks left on Electrify (Unity duration 2). */
  electrifyDuration?: number;
  /** Attacks resolved this turn (Fury allows a second). */
  attacksThisTurn: number;
  /** False while exhausted / summoning sick. */
  canAttack: boolean;
  /** Activated Cast available this turn. */
  canActivate: boolean;
  silenced: boolean;
  keywords: CardKeywords;
  /** Equipped gear riding this unit. */
  equipment?: AttachedEquipment;
  /** Unity board_entered_turn — StartOfTurn passives skip the entry round. */
  boardEnteredTurn?: number;
};

export type PlayerState = {
  id: "player" | "ai";
  heroHealth: number;
  mana: number;
  maxMana: number;
  /** Unity Spell Damage aura from board keywords. */
  spellDamage: number;
  /** Unity Hero Power (Blood Energy) available this turn. */
  heroPowerReady: boolean;
  deck: string[];
  hand: CardInstance[];
  /** Unity 7 board slots — null = empty pad. */
  board: (CardInstance | null)[];
  /** Dead unit defIds, oldest → newest (Unity Dig / CardSelector). */
  graveyard: string[];
};

/** In-flight SelectTarget ability (Unity SelectTargetUI). */
export type PendingTarget = {
  who: "player" | "ai";
  ability: AbilityId;
  sourceInstanceId: string;
  title: string;
  /** Allow clicking enemy hero as target. */
  allowHero: boolean;
  /** Target friendly board units. */
  allyTarget?: boolean;
  /** Target either board (index + board side required). */
  anyBoard?: boolean;
  /** Spell held until target resolves or cancel refunds. */
  spellDefId?: string;
  spellCost?: number;
  /** Pre-activate attack readiness restored if Charge targeting is cancelled. */
  restoreCanAttack?: boolean;
  /** Unity multi-shot (Double/Triple Strike) — remaining picks including current. */
  shotsLeft?: number;
};

/** Dig / Cast: pick a graveyard card to return to hand. */
export type PendingGraveyard = {
  who: "player" | "ai";
  sourceInstanceId: string;
  title: string;
  /** Unity Dig = character; Cast = spell. */
  filter: "character" | "spell";
  /** Mana spent to open this selector (Cast); refunded on cancel. */
  paidMana?: number;
};

/** Unity ActionHistory — one chip in TurnHistoryBar for the active side this turn. */
export type HistoryActionType =
  | "play"
  | "attack"
  | "attack_hero"
  | "ability"
  | "hero_power";

export type ActionHistory = {
  type: HistoryActionType;
  who: "player" | "ai";
  cardDefId: string;
  targetDefId?: string;
  abilityTitle?: string;
  text: string;
};

export type GameState = {
  seed: string;
  turn: number;
  active: "player" | "ai";
  player: PlayerState;
  ai: PlayerState;
  winner: "player" | "ai" | null;
  maxTurns: number;
  pendingTarget: PendingTarget | null;
  pendingGraveyard: PendingGraveyard | null;
  /** Cleared each StartTurn (Unity player.history_list.Clear). */
  history: ActionHistory[];
  log: string[];
};

export type GameInput =
  | { type: "play"; handIndex: number; boardIndex?: number }
  | { type: "attack"; attackerIndex: number; target: "hero" | number }
  | { type: "activate"; boardIndex: number }
  | { type: "hero_power" }
  | { type: "choose_target"; target: "hero" | number; board?: TargetBoard }
  | { type: "choose_graveyard"; index: number }
  | { type: "cancel_target" }
  | { type: "end_turn" };

/** Unity activate_dream — Blood Energy. */
export const HERO_POWER_COST = 2;

/** Unity GameplayData: HP 30, mana start 2, +1/turn, board 7. */
export const HERO_HEALTH = 30;
export const MAX_BOARD = 7;
/** Unity GameplayData.cards_max — soft HS-style 10 was wrong for Solo Battle. */
export const MAX_HAND = 99;
/** Unity GameplayData.mana_max (orb UI still caps visible gems at 10). */
export const MAX_MANA = 100;
export const MAX_TURNS = 40;
/** Unity GameplayData cards_start. */
export const OPENING_HAND = 7;
export const START_MANA = 2;
