import cardsJson from "../../../public/cards/cards.json";
import type { AbilityId, CardDef } from "./types";

export const CARD_DEFS: CardDef[] = (cardsJson.cards as CardDef[]).map((c) => ({
  ...c,
  abilities: (c.abilities ?? []) as AbilityId[],
}));

const byId = new Map(CARD_DEFS.map((c) => [c.id, c]));

export function getCardDef(id: string): CardDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown card: ${id}`);
  return def;
}

/** Unity-flavored Cyber Vamps curve: cheap units, a few spells/sites, top-end finishers. */
const STARTER_CURVE: { id: string; copies: number }[] = [
  { id: "bat-drone-operator", copies: 2 },
  { id: "mainframe-acolyte", copies: 2 },
  { id: "drained-unit", copies: 1 },
  { id: "blood-shield", copies: 2 },
  { id: "relic-chalice", copies: 2 },
  { id: "crimson-spire", copies: 2 },
  { id: "blood-gladiator", copies: 2 },
  { id: "ghost-eye-sniper", copies: 1 },
  { id: "shadow-of-the-nosferatu", copies: 1 },
  { id: "mist-walker-operative", copies: 1 },
  { id: "mind-locked-thrall", copies: 2 },
  { id: "siphon-deacon", copies: 1 },
  { id: "crimson-baroness", copies: 1 },
  { id: "bio-fuel-vault", copies: 1 },
  { id: "injector-fangs", copies: 1 },
  { id: "gilded-sentry", copies: 1 },
  { id: "nocturnal-ranger", copies: 1 },
  { id: "elite-infiltrator", copies: 1 },
  { id: "digital-contagion", copies: 1 },
  { id: "cyber-bite", copies: 1 },
  { id: "vamp-hound", copies: 1 },
  { id: "count-hemo-vance", copies: 1 },
  { id: "red-crested-paladin", copies: 1 },
  { id: "bat-wing-commando", copies: 1 },
];

/** Build a 30-card starter deck from the Cyber Vamps pool. */
export function buildStarterDeck(): string[] {
  const deck: string[] = [];
  for (const row of STARTER_CURVE) {
    if (!byId.has(row.id)) continue;
    for (let i = 0; i < row.copies; i++) deck.push(row.id);
  }
  const fillers = CARD_DEFS.filter((c) => !c.token && !deck.includes(c.id)).sort(
    (a, b) => a.cost - b.cost,
  );
  let f = 0;
  while (deck.length < 30 && fillers.length > 0) {
    deck.push(fillers[f % fillers.length].id);
    f += 1;
  }
  return deck.slice(0, 30);
}

export { cardsJson };
