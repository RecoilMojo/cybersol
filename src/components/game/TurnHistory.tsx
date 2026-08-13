"use client";

import { useEffect, useRef } from "react";
import { getCardDef } from "@/lib/game/cards";
import type { ActionHistory } from "@/lib/game/types";

type Props = {
  history: ActionHistory[];
  /** Controls / status line shown inside the same chrome box. */
  hint?: string;
};

function toneFor(entry: ActionHistory): "play" | "combat" | "system" {
  if (entry.type === "attack" || entry.type === "attack_hero") return "combat";
  if (entry.type === "play" || entry.type === "ability" || entry.type === "hero_power") {
    return "play";
  }
  return "system";
}

/** Unity TurnHistoryBar — art chips + control hint in one panel. */
export function TurnHistory({ history, hint }: Props) {
  const chips = history.slice(-6);
  const empty = chips.length === 0;
  const newestRef = useRef<HTMLDivElement | null>(null);
  const lastLen = useRef(0);

  useEffect(() => {
    if (history.length === lastLen.current) return;
    lastLen.current = history.length;
    newestRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "end",
      block: "nearest",
    });
  }, [history.length]);

  return (
    <div className="turn-history" aria-live="polite" aria-label="Turn history">
      <div className="turn-history-row">
        <span className="turn-history-label">History</span>
        {chips.map((entry, idx) => {
          const art = getCardDef(entry.cardDefId).art;
          const targetArt = entry.targetDefId
            ? getCardDef(entry.targetDefId).art
            : undefined;
          const newest = idx === chips.length - 1;
          return (
            <div
              key={`${entry.type}-${entry.cardDefId}-${idx}-${entry.text.slice(0, 16)}`}
              ref={newest ? newestRef : undefined}
              className={`turn-history-item is-${toneFor(entry)} is-${entry.who} ${newest ? "is-newest" : ""}`}
            >
              <span className="turn-history-who" aria-hidden>
                {entry.who === "player" ? "You" : "AI"}
              </span>
              {art ? (
                <span
                  className="turn-history-art"
                  style={{ backgroundImage: `url('${art}')` }}
                  aria-hidden
                />
              ) : (
                <span className="turn-history-dot" aria-hidden />
              )}
              {targetArt ? (
                <span
                  className="turn-history-art is-target"
                  style={{ backgroundImage: `url('${targetArt}')` }}
                  aria-hidden
                />
              ) : null}
              <span className="turn-history-text">{entry.text}</span>
            </div>
          );
        })}
        {empty && (
          <span className="turn-history-empty">Plays and attacks this turn</span>
        )}
      </div>
      {hint ? <p className="turn-history-hint">{hint}</p> : null}
    </div>
  );
}
