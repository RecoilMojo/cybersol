import type { AbilityDef, AbilityId, CardKeywords } from "./types";

export const ABILITY_CATALOG: Record<AbilityId, AbilityDef> = {
  flying: {
    id: "flying",
    title: "Flying",
    desc: "Can ignore Taunt when attacking.",
  },
  taunt: {
    id: "taunt",
    title: "Taunt",
    desc: "Enemies must attack this before your other units or face (unless Flying).",
  },
  stealth: {
    id: "stealth",
    title: "Stealth",
    desc: "Cannot be attacked or targeted until it performs an action.",
  },
  haste: {
    id: "haste",
    title: "Haste",
    desc: "Can attack immediately.",
  },
  trample: {
    id: "trample",
    title: "Trample",
    desc: "Excess damage hits the enemy hero.",
  },
  deathtouch: {
    id: "deathtouch",
    title: "Deathtouch",
    desc: "Destroy any character this damages (sites survive).",
  },
  spell_immunity: {
    id: "spell_immunity",
    title: "Spell Immunity",
    desc: "Cannot be targeted by abilities (Deathtouch pierces). Immune to non-character spell damage.",
  },
  pillage: {
    id: "pillage",
    title: "Pillage",
    desc: "After attacking the enemy hero, gain 2 mana.",
  },
  regen: {
    id: "regen",
    title: "Regeneration",
    desc: "At the start of your turn, heal this unit to full HP (skips the turn it enters). Does not heal your hero.",
  },
  silence: {
    id: "silence",
    title: "Silence",
    desc: "Silence target card — strip abilities and reset to printed stats (equipment stays).",
    needsTarget: true,
    anyBoard: true,
  },
  electrify: {
    id: "electrify",
    title: "Electrify",
    desc: "On play: set an enemy character's attack to 1 for one turn (auras/gear still apply; buffs resume after).",
    needsTarget: true,
  },
  fire_aoe2: {
    id: "fire_aoe2",
    title: "Fire Damage",
    desc: "On play: deal 2 damage to all other cards.",
  },
  reaper: {
    id: "reaper",
    title: "Reaper",
    desc: "At the start of your turn, destroy lowest-attack characters on both boards (not the turn it enters).",
  },
  killer: {
    id: "killer",
    title: "Killer",
    desc: "On play: destroy an enemy unit with 5+ attack.",
    needsTarget: true,
  },
  damage_thrice: {
    id: "damage_thrice",
    title: "Triple Shot",
    desc: "On play: deal 1 damage three times to a target.",
    needsTarget: true,
    anyBoard: true,
  },
  damage_twice: {
    id: "damage_twice",
    title: "Double Strike",
    desc: "On play: deal 1 damage twice to a target.",
    needsTarget: true,
    anyBoard: true,
  },
  shield: {
    id: "shield",
    title: "Shield",
    desc: "The first hit deals no damage (Unity Shell — blocks Trample and Lifesteal from that hit).",
  },
  boost_2_2: {
    id: "boost_2_2",
    title: "Bless",
    desc: "On play: give another character +2/+2 until your next turn.",
    needsTarget: true,
    anyBoard: true,
  },
  charge_bounce: {
    id: "charge_bounce",
    title: "Charge",
    desc: "Action: return a character to hand (humans: either board; AI: enemies). Costs the unit's action — not while summoning sick or after attacking.",
    needsTarget: true,
    anyBoard: true,
    activated: true,
    activateCost: 0,
  },
  roll_d6_attack: {
    id: "roll_d6_attack",
    title: "Dice Attack",
    desc: "On play: roll a D6 and increase this unit's attack by the result.",
  },
  blood_crystal: {
    id: "blood_crystal",
    title: "Blood Crystal",
    desc: "Token: +2 mana. On units: add a Blood Crystal to hand.",
  },
  mana_coin: {
    id: "mana_coin",
    title: "Energy Core",
    desc: "Gain 1 mana this turn.",
  },
  dig: {
    id: "dig",
    title: "Dig",
    desc: "On play: return a character from your graveyard to your hand.",
  },
  cull: {
    id: "cull",
    title: "Cull",
    desc: "On play: destroy an enemy unit with 4 or less attack, then draw a card.",
    needsTarget: true,
  },
  spell_damage: {
    id: "spell_damage",
    title: "Spell Damage",
    desc: "Your damaging play effects deal +1 damage.",
  },
  cyber_bite: {
    id: "cyber_bite",
    title: "Cyber Bite",
    desc: "Give a friendly unit +3 attack, Fury, and Taunt (Fury can unlock a second swing).",
    needsTarget: true,
    allyTarget: true,
  },
  destroy_target: {
    id: "destroy_target",
    title: "Destroy",
    // Unity play_destroy: is_enemy + is_not_self — sites legal (no is_character).
    desc: "Destroy an enemy card or site.",
    needsTarget: true,
  },
  cast_return_spell: {
    id: "cast_return_spell",
    title: "Magic Focus",
    desc: "Cast (2): return a spell from your graveyard to your hand (does not exhaust).",
    activated: true,
    activateCost: 2,
  },
  fury_taunt: {
    id: "fury_taunt",
    title: "Fury",
    desc: "Give a friendly character Fury and Taunt (can unlock a second swing).",
    needsTarget: true,
    allyTarget: true,
  },
  board_wipe: {
    id: "board_wipe",
    title: "Purge",
    desc: "Destroy all characters on the board (sites survive).",
  },
  board_bounce: {
    id: "board_bounce",
    title: "Recall",
    desc: "Return all cards on the board to their owner's hand.",
  },
  hemo_hand_3: {
    id: "hemo_hand_3",
    title: "Vault",
    desc: "Add three 1/1 Hemo Hackers to your hand.",
  },
  damage_once: {
    id: "damage_once",
    title: "Pierce",
    desc: "Deal 1 damage to a target.",
    needsTarget: true,
    anyBoard: true,
  },
  attack_aura_2: {
    id: "attack_aura_2",
    title: "Blood Banner",
    desc: "All Cyber Vamps characters have +2 attack (sites unchanged).",
  },
  atk_aura_1: {
    id: "atk_aura_1",
    title: "Relic Aura",
    desc: "Your characters have +1 attack.",
  },
  equip_atk_1: {
    id: "equip_atk_1",
    title: "Equip",
    desc: "Attach: +1 attack. Bearer receives no damage when attacking. Loses 1 durability per attack.",
    needsTarget: true,
    allyTarget: true,
  },
  lifesteal_aura: {
    id: "lifesteal_aura",
    title: "Crimson Weave",
    desc: "All Cyber Vamps characters gain Lifesteal.",
  },
  cost_aura_1: {
    id: "cost_aura_1",
    title: "Tithe",
    desc: "Your Cyber Vamps cards cost 1 less (not Energy Core / Blood Crystal).",
  },
  spell_charge: {
    id: "spell_charge",
    title: "Scorching",
    desc: "After a spell fully resolves, this gains +3 attack.",
  },
};

export function emptyKeywords(): CardKeywords {
  return {
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
}

export function keywordsFromAbilities(abilities: AbilityId[]): CardKeywords {
  const k = emptyKeywords();
  for (const id of abilities) {
    if (id === "flying") k.flying = true;
    if (id === "taunt") k.taunt = true;
    if (id === "stealth") k.stealth = true;
    if (id === "deathtouch") k.deathtouch = true;
    if (id === "trample") k.trample = true;
    if (id === "spell_immunity") k.spellImmunity = true;
    if (id === "regen") k.regen = true;
    if (id === "pillage") k.pillage = true;
    if (id === "reaper") k.reaper = true;
    if (id === "shield") k.shield = true;
  }
  return k;
}


export function abilityLines(abilities: AbilityId[]): AbilityDef[] {
  return abilities.map((id) => ABILITY_CATALOG[id]);
}

export function hasAbility(abilities: AbilityId[], id: AbilityId): boolean {
  return abilities.includes(id);
}
