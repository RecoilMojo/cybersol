"use client";

import { getCardDef } from "@/lib/game/cards";
import type { CardInstance } from "@/lib/game/types";

type Props = {
  card: CardInstance;
  selected?: boolean;
  dimmed?: boolean;
  disabled?: boolean;
  ready?: boolean;
  validTarget?: boolean;
  dragging?: boolean;
  /** Unity Protected — shielded by a friendly Taunt (cannot be attacked). */
  protectedByTaunt?: boolean;
  /** Brief Unity spawn / damage juice. */
  pulse?: "summon" | "hit" | null;
  /** Board activate (Cast/Charge) is currently legal. */
  activateReady?: boolean;
  /** Why a hand card cannot be played (Unity-style feedback). */
  blockReason?: "no-target" | "mana" | "board" | null;
  /** Visible hand hotkey (1–5). */
  hotkey?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onHover?: (active: boolean) => void;
  onDragStart?: (e: React.PointerEvent) => void;
  showCost?: boolean;
  /** Effective mana cost (after Siphon Deacon etc.). Defaults to printed cost. */
  manaCost?: number;
  size?: "hand" | "board";
  dropZone?: "ally-board" | "enemy-board" | "enemy-hero" | null;
};

/**
 * Card face — art + cost/ATK/HP only.
 * Keywords / status live in the hover preview (no pip clutter).
 */
export function CardView({
  card,
  selected,
  dimmed,
  disabled,
  ready,
  validTarget,
  dragging,
  protectedByTaunt = false,
  pulse = null,
  activateReady = false,
  blockReason = null,
  hotkey,
  onClick,
  onHover,
  onDragStart,
  showCost = true,
  manaCost,
  size = "hand",
}: Props) {
  const def = getCardDef(card.defId);
  const art = def.art ?? "";
  const clickable = (Boolean(onClick) || Boolean(onDragStart)) && !disabled;
  const isSpell = def.kind === "spell";
  const isEquipment = def.kind === "equipment";
  const isStructure = def.kind === "structure";
  const offBoard = isSpell || isEquipment;
  const effectiveCost = manaCost ?? def.cost;
  const discounted = effectiveCost < def.cost;
  const buffedAtk = !offBoard && card.attack > def.attack;
  const onBoard = size === "board";

  return (
    <button
      type="button"
      onClick={clickable && onClick ? (e) => onClick(e) : undefined}
      disabled={disabled}
      onPointerEnter={(e) => {
        if (e.pointerType === "touch" || e.pointerType === "pen") return;
        onHover?.(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "touch" || e.pointerType === "pen") return;
        onHover?.(false);
      }}
      onMouseEnter={() => {
        if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
          return;
        }
        onHover?.(true);
      }}
      onMouseLeave={() => {
        if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
          return;
        }
        onHover?.(false);
      }}
      onFocus={() => {
        if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
          return;
        }
        onHover?.(true);
      }}
      onBlur={() => onHover?.(false)}
      onPointerDown={(e) => {
        if (disabled || !onDragStart) return;
        if (e.button !== 0) return;
        onDragStart(e);
      }}
      className={[
        "tcg-card",
        onBoard ? "tcg-card--board" : "tcg-card--hand",
        isSpell ? "is-spell" : "",
        isEquipment ? "is-equipment" : "",
        isStructure ? "is-structure" : "",
        selected ? "is-selected" : "",
        ready && !selected ? "is-ready" : "",
        validTarget ? "is-valid-target" : "",
        dimmed ? "is-dimmed" : "",
        clickable ? "is-clickable" : "",
        disabled ? "is-disabled" : "",
        dragging ? "is-dragging" : "",
        card.keywords.stealth ? "is-stealth" : "",
        card.keywords.taunt ? "is-taunt" : "",
        protectedByTaunt && !card.keywords.taunt ? "is-protected" : "",
        card.silenced ? "is-silenced" : "",
        pulse === "summon" ? "is-summoned" : "",
        pulse === "hit" ? "is-hit" : "",
        !isStructure &&
        onBoard &&
        !card.canAttack &&
        !card.canActivate &&
        !activateReady
          ? "is-exhausted"
          : "",
        card.health < card.maxHealth ? "is-damaged" : "",
        onBoard &&
        card.health < card.maxHealth &&
        card.health <= Math.max(2, Math.floor(card.maxHealth * 0.25))
          ? "is-critical-hp"
          : "",
        size === "hand" && blockReason === "no-target" ? "is-no-target" : "",
        size === "hand" && blockReason === "mana" ? "is-no-mana" : "",
        size === "hand" && blockReason === "board" ? "is-board-full" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-instance-id={card.instanceId}
      data-hotkey={size === "hand" && hotkey ? hotkey : undefined}
      style={{ ["--card-accent" as string]: def.color }}
      aria-label={`${def.name}${
        isSpell
          ? `, spell, costs ${effectiveCost}`
          : isEquipment
            ? `, equipment, costs ${effectiveCost}`
            : isStructure
              ? `, site, ${card.attack} attack, ${card.health} health`
              : `, ${card.attack} attack, ${card.health} health`
      }${protectedByTaunt && !card.keywords.taunt ? ", protected by taunt" : ""}${
        blockReason === "no-target"
          ? ", no valid target"
          : blockReason === "mana"
            ? ", not enough mana"
            : blockReason === "board"
              ? ", board full"
              : ""
      }${size === "hand" && hotkey ? `, hotkey ${hotkey}` : ""}${
        def.abilities.length ? `, ${def.text}` : ""
      }`}
    >
      <div
        className="tcg-card-art"
        style={art ? { backgroundImage: `url('${art}')` } : undefined}
      />
      {/* Hand art already framed — no silver overlay. Board keeps a light face. */}
      {!onBoard ? null : <div className="tcg-card-frame" />}
      {showCost && (
        <span className={`tcg-card-cost ${discounted ? "is-discounted" : ""}`}>
          {effectiveCost}
        </span>
      )}
      {size === "hand" && blockReason === "no-target" && (
        <span className="tcg-card-block-chip" aria-hidden>
          No tgt
        </span>
      )}
      {size === "hand" && blockReason === "mana" && (
        <span className="tcg-card-block-chip is-mana" aria-hidden>
          Mana
        </span>
      )}
      {size === "hand" && blockReason === "board" && (
        <span className="tcg-card-block-chip is-board" aria-hidden>
          Full
        </span>
      )}
      {!onBoard && <span className="tcg-card-name">{def.name}</span>}
      {!offBoard && (!isStructure || card.attack > 0) && (
        <span className={`tcg-card-atk ${buffedAtk ? "is-buffed" : ""}`}>
          {card.attack}
        </span>
      )}
      {!offBoard && (
        <span
          className={[
            "tcg-card-hp",
            card.health < card.maxHealth ? "is-hurt" : "",
            onBoard &&
            card.health < card.maxHealth &&
            card.health <= Math.max(2, Math.floor(card.maxHealth * 0.25))
              ? "is-critical"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {card.health}
        </span>
      )}
    </button>
  );
}
