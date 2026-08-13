"use client";

type Props = {
  mana: number;
  maxMana: number;
  cap?: number;
  compact?: boolean;
};

/** Unity-style mana row: always `cap` gems so the rail doesn't grow each turn. */
export function ManaOrbs({ mana, maxMana, cap = 10, compact = false }: Props) {
  const slots = cap;
  const filledCount = Math.min(cap, Math.max(0, mana));
  return (
    <div
      className={`mana-orbs ${compact ? "is-compact" : ""}`}
      aria-label={`Mana ${mana} of ${maxMana}`}
    >
      {Array.from({ length: slots }, (_, i) => {
        const filled = i < filledCount;
        const unlocked = i < Math.min(cap, maxMana);
        return (
          <span
            key={i}
            className={[
              "mana-orb",
              filled ? "is-filled" : "",
              !unlocked ? "is-locked" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              backgroundImage: `url('${filled ? "/game/ui/mana_full.png" : "/game/ui/mana_empty.png"}')`,
            }}
          />
        );
      })}
      <span className="mana-orbs-label">
        {mana}/{maxMana}
      </span>
    </div>
  );
}
