"use client";

import { useState } from "react";

type Props = {
  ca: string;
  buyUrl: string;
  pumpUrl: string;
  dexUrl: string;
};

function Chip({ href, label }: { href: string; label: string }) {
  if (href) {
    return (
      <a className="chip" href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }
  return (
    <span className="chip is-tba">
      {label} · TBA
    </span>
  );
}

export function LaunchPlaceholders({ ca, buyUrl, pumpUrl, dexUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const live = ca.length > 0;

  async function copyCa() {
    if (!live) return;
    try {
      await navigator.clipboard.writeText(ca);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="hero-launch">
      <p className="hero-ca">
        CA: {live ? ca : "TBA — drops at token launch"}
        {live && (
          <button type="button" className="hero-ca-copy" onClick={() => void copyCa()}>
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </p>
      <div className="hero-meta">
        <Chip href={buyUrl} label="Buy $CYBERSOL" />
        <Chip href={pumpUrl} label="Pump.fun" />
        <Chip href={dexUrl} label="DexScreener" />
      </div>
    </div>
  );
}
