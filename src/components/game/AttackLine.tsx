"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type Props = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  valid?: boolean;
  /** Unity MouseLineFX — cyan for attacks, magenta for ability/spell select. */
  mode?: "attack" | "ability";
};

/** Unity MouseLineFX-style attack aim: curved beam, pulse, arrow tip. */
export function AttackLine({
  x1,
  y1,
  x2,
  y2,
  valid = true,
  mode = "attack",
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const mx = (x1 + x2) / 2;
  const my = Math.min(y1, y2) - Math.max(48, Math.abs(y2 - y1) * 0.28);
  const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  const ok = mode === "ability" ? "#ff6bcb" : "#2ef5ff";
  const bad = "#ff3b5c";
  const stroke = valid ? ok : bad;
  const glow =
    valid
      ? mode === "ability"
        ? "rgba(255, 107, 203, 0.55)"
        : "rgba(46, 245, 255, 0.55)"
      : "rgba(255, 59, 92, 0.5)";

  const angle = Math.atan2(y2 - my, x2 - mx);
  const tip = 20;
  const ax = x2 - Math.cos(angle) * tip;
  const ay = y2 - Math.sin(angle) * tip;
  const left = `${ax + Math.cos(angle + 2.5) * 13},${ay + Math.sin(angle + 2.5) * 13}`;
  const right = `${ax + Math.cos(angle - 2.5) * 13},${ay + Math.sin(angle - 2.5) * 13}`;

  const filterId = mode === "ability" ? "aim-glow-ability" : "aim-glow-attack";

  if (!mounted) return null;

  return createPortal(
    <svg className="attack-line" aria-hidden>
      <defs>
        <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={glow}
        strokeWidth="14"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        className="attack-line-beam"
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="14 10"
        filter={`url(#${filterId})`}
      />
      {/* Target reticle at aim point */}
      <circle cx={x2} cy={y2} r="22" fill="none" stroke={stroke} strokeWidth="2.5" opacity="0.85" />
      <circle cx={x2} cy={y2} r="14" fill="none" stroke={stroke} strokeWidth="1.8" opacity="0.55" />
      <line x1={x2 - 28} y1={y2} x2={x2 - 16} y2={y2} stroke={stroke} strokeWidth="2.2" opacity="0.9" />
      <line x1={x2 + 16} y1={y2} x2={x2 + 28} y2={y2} stroke={stroke} strokeWidth="2.2" opacity="0.9" />
      <line x1={x2} y1={y2 - 28} x2={x2} y2={y2 - 16} stroke={stroke} strokeWidth="2.2" opacity="0.9" />
      <line x1={x2} y1={y2 + 16} x2={x2} y2={y2 + 28} stroke={stroke} strokeWidth="2.2" opacity="0.9" />
      <circle cx={x1} cy={y1} r="8" fill={stroke} opacity="0.8" />
      <circle cx={x1} cy={y1} r="15" fill="none" stroke={stroke} strokeWidth="2" opacity="0.5" />
      <polygon points={`${x2},${y2} ${left} ${right}`} fill={stroke} opacity="0.95" />
      <circle cx={x2} cy={y2} r="5" fill="#fff" opacity="0.9" />
    </svg>,
    document.body,
  );
}
