"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { abilityLines } from "@/lib/game/abilities";
import { getCardDef } from "@/lib/game/cards";
import type { CardInstance } from "@/lib/game/types";

type Focus = {
  card: CardInstance;
  source: "hand" | "board";
} | null;

type Props = {
  focus: Focus;
  /** Effective mana when hovering hand (after cost auras). */
  manaCost?: number;
  /** Current player mana — used to show remaining after play. */
  currentMana?: number;
};

/** Unity CardPreviewUI — left popout: framed art + clean text plate. */
export function CardPreview({ focus, manaCost, currentMana }: Props) {
  const [shown, setShown] = useState<Focus>(null);
  const [shownCost, setShownCost] = useState<number | undefined>(undefined);
  const [shownMana, setShownMana] = useState<number | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!focus) {
      setShown(null);
      setShownCost(undefined);
      setShownMana(undefined);
      return;
    }
    const delay = focus.source === "hand" ? 120 : 280;
    const t = window.setTimeout(() => {
      setShown(focus);
      setShownCost(manaCost);
      setShownMana(currentMana);
    }, delay);
    return () => window.clearTimeout(t);
  }, [focus, manaCost, currentMana]);

  if (!mounted || !shown) return null;
  const def = getCardDef(shown.card.defId);
  const lines = abilityLines(def.abilities);
  const art = def.art ?? "";
  const cost = shownCost ?? def.cost;
  const discounted = cost < def.cost;
  const isStructure = def.kind === "structure";
  const isSpell = def.kind === "spell";
  const isEquipment = def.kind === "equipment";

  return createPortal(
    <div className="card-preview-layer" aria-hidden>
      <div className="card-preview" role="dialog" aria-label={`${def.name} preview`}>
        {art ? (
          <img className="card-preview-art-img" src={art} alt="" draggable={false} />
        ) : (
          <div className="card-preview-art-img is-empty" aria-hidden />
        )}
        <div className="card-preview-body">
          <div className="card-preview-top">
            <span className={`card-preview-cost ${discounted ? "is-discounted" : ""}`}>
              {cost}
            </span>
            <h3 className="card-preview-name">{def.name}</h3>
          </div>
          {shown.source === "hand" &&
            typeof shownMana === "number" &&
            (() => {
              const left = shownMana - cost;
              if (left < 0) {
                return (
                  <p className="card-preview-mana is-short">
                    Need {cost - shownMana} more mana
                  </p>
                );
              }
              return (
                <p className="card-preview-mana">
                  {shownMana} → {left} mana after play
                  {discounted ? ` · −${def.cost - cost} discount` : ""}
                </p>
              );
            })()}
          <p className="card-preview-text">{def.text}</p>
          {lines.length > 0 && (
            <ul className="card-preview-abilities">
              {lines.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>
                  <span>{a.desc}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="card-preview-stats">
            {!isSpell && !isEquipment && !isStructure && (
              <span className="atk">{shown.card.attack} ATK</span>
            )}
            {!isSpell && !isEquipment && (
              <span className="hp">
                {shown.card.health}/{shown.card.maxHealth} HP
              </span>
            )}
            {isSpell && <span className="atk">Spell</span>}
            {isEquipment && <span className="atk">Equipment</span>}
            {isStructure && <span className="atk">Site</span>}
          </div>
          {shown.source === "board" &&
            !isSpell &&
            !isEquipment &&
            (() => {
              const c = shown.card;
              let status: string | null = null;
              if (!isStructure && c.canAttack) {
                status =
                  c.keywords.fury && c.attacksThisTurn === 1
                    ? "Fury — can attack again"
                    : "Ready to attack";
              } else if (c.canActivate && !c.silenced) {
                status = def.abilities.includes("charge_bounce")
                  ? "Charge ready"
                  : "Cast ready";
              } else if (
                !isStructure &&
                !c.canAttack &&
                c.attacksThisTurn === 0
              ) {
                status = "Summoning sick — can't attack yet";
              } else if (!isStructure && !c.canAttack && c.attacksThisTurn > 0) {
                status = "Already attacked this turn";
              }
              return status ? (
                <p className="card-preview-status">{status}</p>
              ) : null;
            })()}
          {(shown.card.silenced ||
            shown.card.electrified ||
            shown.card.equipment ||
            (shown.card.tempDuration ?? 0) > 0 ||
            shown.card.keywords.stealth ||
            shown.card.keywords.taunt ||
            shown.card.keywords.flying ||
            shown.card.keywords.lifesteal ||
            shown.card.keywords.fury ||
            shown.card.keywords.shield ||
            shown.card.keywords.spellImmunity ||
            shown.card.keywords.deathtouch ||
            shown.card.keywords.trample ||
            shown.card.keywords.pillage ||
            shown.card.keywords.reaper ||
            shown.card.keywords.regen) && (
            <div className="card-preview-keywords">
              {shown.card.silenced && <span className="is-bad">Silenced</span>}
              {shown.card.electrified && <span className="is-bad">Electrified</span>}
              {shown.card.equipment && (
                <span>
                  Equip: {getCardDef(shown.card.equipment.defId).name} (
                  {shown.card.equipment.health}/{shown.card.equipment.maxHealth})
                </span>
              )}
              {(shown.card.tempDuration ?? 0) > 0 && (
                <span>
                  Blessed +{shown.card.tempAttack ?? 0}/+{shown.card.tempHealth ?? 0}
                </span>
              )}
              {shown.card.keywords.flying && <span>Flying</span>}
              {shown.card.keywords.taunt && <span>Taunt</span>}
              {shown.card.keywords.stealth && <span>Stealth</span>}
              {shown.card.keywords.deathtouch && <span>Deathtouch</span>}
              {shown.card.keywords.trample && <span>Trample</span>}
              {shown.card.keywords.lifesteal && <span>Lifesteal</span>}
              {shown.card.keywords.fury && <span>Fury</span>}
              {shown.card.keywords.shield && <span>Shield</span>}
              {shown.card.keywords.pillage && <span>Pillage</span>}
              {shown.card.keywords.reaper && <span>Reaper</span>}
              {shown.card.keywords.regen && <span>Regen</span>}
              {shown.card.keywords.spellImmunity && <span>Spell Immune</span>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
