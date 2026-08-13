"use client";

import { useEffect, useRef, useState } from "react";
import { getCardDef } from "@/lib/game/cards";
import type { GameState } from "@/lib/game/types";

type Floater = {
  id: string;
  text: string;
  x: number;
  y: number;
  kind: "dmg" | "heal" | "info" | "buff";
};

type Props = {
  state: GameState | null;
};

function cardAnchor(
  instanceId: string,
  fallbackX: number,
  fallbackY: number,
): { x: number; y: number } {
  const arena = document.querySelector(".tcg-arena") as HTMLElement | null;
  const el = document.querySelector(
    `[data-instance-id="${instanceId}"]`,
  ) as HTMLElement | null;
  if (!arena || !el) return { x: fallbackX, y: fallbackY };
  const a = arena.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (a.width < 8 || a.height < 8) return { x: fallbackX, y: fallbackY };
  return {
    x: ((r.left + r.width / 2 - a.left) / a.width) * 100,
    y: ((r.top + r.height * 0.35 - a.top) / a.height) * 100,
  };
}

/** Diff consecutive states → floating combat numbers (Unity-ish feedback). */
export function CombatFx({ state }: Props) {
  const prev = useRef<GameState | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);

  useEffect(() => {
    if (!state) {
      prev.current = null;
      return;
    }
    const before = prev.current;
    prev.current = state;
    if (!before || before.seed !== state.seed) return;

    const next: Floater[] = [];
    const stamp = Date.now();

    const heroDelta = (label: string, a: number, b: number, x: number, y: number) => {
      if (a === b) return;
      const d = b - a;
      next.push({
        id: `${stamp}-${label}`,
        text: d < 0 ? `${d}` : `+${d}`,
        x,
        y,
        kind: d < 0 ? "dmg" : "heal",
      });
    };

    heroDelta("enemy", before.ai.heroHealth, state.ai.heroHealth, 78, 18);
    heroDelta("you", before.player.heroHealth, state.player.heroHealth, 18, 72);

    if (state.player.mana < before.player.mana && state.active === "player") {
      const spent = before.player.mana - state.player.mana;
      next.push({
        id: `${stamp}-mana`,
        text: `-${spent} MANA`,
        x: 22,
        y: 78,
        kind: "info",
      });
    } else if (
      state.player.mana > before.player.mana &&
      state.active === "player"
    ) {
      const gained = state.player.mana - before.player.mana;
      next.push({
        id: `${stamp}-mana-gain`,
        text: `+${gained} MANA`,
        x: 22,
        y: 78,
        kind: "buff",
      });
    }

    const latestLog = state.log[state.log.length - 1] ?? "";
    const prevLog = before.log[before.log.length - 1] ?? "";
    if (latestLog !== prevLog) {
      if (/deck empty, no draw|hand full, draw skipped/i.test(latestLog)) {
        const enemy = /Enemy/i.test(latestLog);
        next.push({
          id: `${stamp}-nodraw`,
          text: /deck empty/i.test(latestLog) ? "EMPTY" : "FULL",
          x: enemy ? 78 : 18,
          y: enemy ? 18 : 72,
          kind: "info",
        });
      }
      if (/Regenerates/i.test(latestLog)) {
        next.push({
          id: `${stamp}-regen`,
          text: "REGEN",
          x: 50,
          y: state.active === "ai" ? 32 : 58,
          kind: "heal",
        });
      }
      if (/^Reaper destroys/i.test(latestLog)) {
        next.push({
          id: `${stamp}-reaper`,
          text: "REAPER",
          x: 50,
          y: 45,
          kind: "dmg",
        });
      }
      if (/Bless —/i.test(latestLog)) {
        next.push({
          id: `${stamp}-bless`,
          text: "BLESS",
          x: 48,
          y: 52,
          kind: "buff",
        });
      }
      if (/gains Haste/i.test(latestLog)) {
        const hasteUnit = state.player.board.find(
          (c) =>
            c &&
            getCardDef(c.defId).abilities.includes("haste") &&
            !before.player.board.some((b) => b?.instanceId === c.instanceId),
        ) ?? state.ai.board.find(
          (c) =>
            c &&
            getCardDef(c.defId).abilities.includes("haste") &&
            !before.ai.board.some((b) => b?.instanceId === c.instanceId),
        );
        const at = hasteUnit
          ? cardAnchor(hasteUnit.instanceId, 50, state.active === "ai" ? 32 : 58)
          : { x: 50, y: state.active === "ai" ? 32 : 58 };
        next.push({
          id: `${stamp}-haste`,
          text: "HASTE",
          x: at.x,
          y: at.y,
          kind: "buff",
        });
      }
      if (/Electrify —/i.test(latestLog)) {
        next.push({
          id: `${stamp}-zap`,
          text: "ZAP",
          x: 50,
          y: 38,
          kind: "info",
        });
      }
      if (/Pillages for/i.test(latestLog)) {
        const enemy = /Enemy|AI/i.test(latestLog);
        next.push({
          id: `${stamp}-pillage`,
          text: "+2 MANA",
          x: enemy ? 78 : 22,
          y: enemy ? 22 : 78,
          kind: "buff",
        });
      }
      if (/Bless fades/i.test(latestLog)) {
        next.push({
          id: `${stamp}-blessfade`,
          text: "FADE",
          x: 48,
          y: 52,
          kind: "info",
        });
      }
      if (/Scorching/i.test(latestLog)) {
        next.push({
          id: `${stamp}-scorch`,
          text: "+3 ATK",
          x: 42,
          y: 58,
          kind: "buff",
        });
      }
      if (/Fire Damage/i.test(latestLog)) {
        next.push({
          id: `${stamp}-fire`,
          text: "FIRE",
          x: 50,
          y: 44,
          kind: "dmg",
        });
      }
      if (/gains Fury|\/ Fury \//i.test(latestLog)) {
        next.push({
          id: `${stamp}-fury`,
          text: "FURY",
          x: 46,
          y: 50,
          kind: "buff",
        });
      }
      if (/Intimidate/i.test(latestLog)) {
        next.push({
          id: `${stamp}-intimidate`,
          text: "INTIMIDATE",
          x: 48,
          y: 46,
          kind: "buff",
        });
      }
      if (/Electrify —/i.test(latestLog)) {
        next.push({
          id: `${stamp}-electrify`,
          text: "ELECTRIFY",
          x: 48,
          y: 48,
          kind: "info",
        });
      }
      if (/^Silenced /i.test(latestLog)) {
        next.push({
          id: `${stamp}-mute`,
          text: "MUTE",
          x: 48,
          y: 48,
          kind: "info",
        });
      }
      if (/Charge — .* returned|Charge — .* burned/i.test(latestLog)) {
        next.push({
          id: `${stamp}-charge`,
          text: /burned/i.test(latestLog) ? "BURN" : "CHARGE",
          x: 50,
          y: 46,
          kind: /burned/i.test(latestLog) ? "dmg" : "info",
        });
      }
      if (/^(Dig|Cast) returned /i.test(latestLog)) {
        next.push({
          id: `${stamp}-gy`,
          text: /^Dig/i.test(latestLog) ? "DIG" : "CAST",
          x: 50,
          y: 48,
          kind: "buff",
        });
      }
      if (/Tramples/i.test(latestLog)) {
        next.push({
          id: `${stamp}-tramp`,
          text: "TRAMPLE",
          x: 62,
          y: 28,
          kind: "buff",
        });
      }
      if (/Pillages/i.test(latestLog)) {
        next.push({
          id: `${stamp}-pill`,
          text: "PILLAGE",
          x: 38,
          y: 70,
          kind: "buff",
        });
      }
      if (/Deathtouch destroys/i.test(latestLog)) {
        next.push({
          id: `${stamp}-dt`,
          text: "DEATHTOUCH",
          x: 50,
          y: 42,
          kind: "info",
        });
      }
      if (/Lifesteal \+/i.test(latestLog)) {
        const enemyHeal = state.ai.heroHealth > before.ai.heroHealth;
        const amt = /Lifesteal \+(\d+)/i.exec(latestLog)?.[1];
        next.push({
          id: `${stamp}-ls`,
          text: amt ? `+${amt} LS` : "LIFESTEAL",
          x: enemyHeal ? 78 : 18,
          y: enemyHeal ? 18 : 72,
          kind: "heal",
        });
      }
      if (/destroyed all characters/i.test(latestLog)) {
        next.push({
          id: `${stamp}-purge`,
          text: "PURGE",
          x: 50,
          y: 44,
          kind: "dmg",
        });
      }
      if (/all cards returned to hand/i.test(latestLog)) {
        next.push({
          id: `${stamp}-recall`,
          text: "RECALL",
          x: 50,
          y: 44,
          kind: "info",
        });
      }
    }

    const lastLog = state.log[state.log.length - 1] ?? "";
    const rollMatch = /rolled (\d+)/i.exec(lastLog);
    if (rollMatch && lastLog !== (before.log[before.log.length - 1] ?? "")) {
      next.push({
        id: `${stamp}-d6`,
        text: `D6:${rollMatch[1]}`,
        x: 50,
        y: 52,
        kind: "buff",
      });
    }

    if (state.player.graveyard.length > before.player.graveyard.length) {
      const added = state.player.graveyard.slice(before.player.graveyard.length);
      if (added.some((id) => getCardDef(id).kind === "spell")) {
        next.push({
          id: `${stamp}-cast`,
          text: "CAST",
          x: 50,
          y: 48,
          kind: "buff",
        });
      }
    }

    // Board unit damage / deaths — anchor floaters on the card when possible.
    const scan = (
      side: "ally" | "enemy",
      oldB: typeof before.player.board,
      newB: typeof state.player.board,
    ) => {
      for (const old of oldB) {
        if (!old) continue;
        const cur = newB.find((c) => c?.instanceId === old.instanceId);
        const fallbackX = side === "enemy" ? 50 : 50;
        const fallbackY = side === "enemy" ? 32 : 58;
        const at = cardAnchor(old.instanceId, fallbackX, fallbackY);
        const jitter = () => (Math.random() * 4 - 2);
        if (!cur) {
          next.push({
            id: `${stamp}-dead-${old.instanceId}`,
            text: "DESTROYED",
            x: at.x + jitter(),
            y: at.y,
            kind: "info",
          });
          continue;
        }
        if (cur.health < old.health) {
          next.push({
            id: `${stamp}-hit-${old.instanceId}`,
            text: `${cur.health - old.health}`,
            x: at.x + jitter(),
            y: at.y,
            kind: "dmg",
          });
        } else if (cur.health > old.health) {
          next.push({
            id: `${stamp}-heal-${old.instanceId}`,
            text: `+${cur.health - old.health}`,
            x: at.x,
            y: at.y,
            kind: "heal",
          });
        }
        if (cur.attack > old.attack) {
          next.push({
            id: `${stamp}-atk-${old.instanceId}`,
            text: `+${cur.attack - old.attack} ATK`,
            x: at.x + jitter(),
            y: at.y - 5,
            kind: "buff",
          });
        }
        if (old.keywords.shield && !cur.keywords.shield) {
          next.push({
            id: `${stamp}-shield-${old.instanceId}`,
            text: "SHIELD",
            x: at.x + jitter(),
            y: at.y - 3,
            kind: "info",
          });
        }
        if (!old.silenced && cur.silenced) {
          next.push({
            id: `${stamp}-mute-${old.instanceId}`,
            text: "SILENCE",
            x: at.x,
            y: at.y - 2,
            kind: "info",
          });
        }
        if (old.keywords.stealth && !cur.keywords.stealth) {
          next.push({
            id: `${stamp}-stealth-${old.instanceId}`,
            text: "REVEALED",
            x: at.x + jitter(),
            y: at.y - 5,
            kind: "info",
          });
        }
        if (!old.equipment && cur.equipment) {
          next.push({
            id: `${stamp}-equip-${old.instanceId}`,
            text: "EQUIP",
            x: at.x,
            y: at.y - 6,
            kind: "buff",
          });
        }
        if (old.equipment && !cur.equipment) {
          next.push({
            id: `${stamp}-shatter-${old.instanceId}`,
            text: "SHATTER",
            x: at.x,
            y: at.y - 6,
            kind: "info",
          });
        }
      }
    };

    scan("enemy", before.ai.board, state.ai.board);
    scan("ally", before.player.board, state.player.board);

    if (next.length === 0) return;
    setFloaters((f) => [...f, ...next].slice(-12));
    if (next.some((n) => n.kind === "dmg" || n.kind === "info")) {
      const arena = document.querySelector(".tcg-arena");
      arena?.classList.remove("is-shaking");
      // force reflow so animation retriggers
      void (arena as HTMLElement | null)?.offsetWidth;
      arena?.classList.add("is-shaking");
      window.setTimeout(() => arena?.classList.remove("is-shaking"), 320);
    }
    const t = window.setTimeout(() => {
      setFloaters((f) => f.filter((x) => !next.some((n) => n.id === x.id)));
    }, 900);
    return () => window.clearTimeout(t);
  }, [state]);

  if (floaters.length === 0) return null;

  return (
    <div className="combat-fx" aria-hidden>
      {floaters.map((f) => (
        <span
          key={f.id}
          className={`combat-floater is-${f.kind}`}
          style={{ left: `${f.x}%`, top: `${f.y}%` }}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}
