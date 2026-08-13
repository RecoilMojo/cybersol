"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { LINKS } from "@/lib/links";

const ConnectButton = dynamic(
  () => import("@/components/wallet/ConnectButton").then((m) => m.ConnectButton),
  { ssr: false, loading: () => <span className="nav-wallet-fallback">Wallet…</span> },
);

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="nav-scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="site-header-bar">
        <header className="site-header">
          <Link href="/" className="site-brand" onClick={() => setOpen(false)}>
            <span className="brand-icon-pulse">
              <Image
                src="/graphics/cybersoul2-icon.png"
                alt="Cybersol"
                width={56}
                height={56}
                priority
                className="brand-icon"
              />
            </span>
            <span className="site-brand-text">
              Cybersol
              <span className="site-brand-ticker">$CYBERSOL</span>
            </span>
          </Link>

          <button
            type="button"
            className="nav-burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav className={`site-nav ${open ? "is-open" : ""}`}>
            <Link href={LINKS.play} onClick={() => setOpen(false)}>
              Play
            </Link>
            <Link href={LINKS.leaderboard} onClick={() => setOpen(false)}>
              Leaderboard
            </Link>
            <Link href={LINKS.about} onClick={() => setOpen(false)}>
              About
            </Link>
            <Link href={LINKS.roadmap} onClick={() => setOpen(false)}>
              Roadmap
            </Link>
            <a href={LINKS.youtube} target="_blank" rel="noopener noreferrer">
              YouTube
            </a>
            <a href={LINKS.tiktok} target="_blank" rel="noopener noreferrer">
              TikTok
            </a>
            <a href={LINKS.twitter} target="_blank" rel="noopener noreferrer">
              X / Twitter
            </a>
            <ConnectButton />
          </nav>
        </header>

        <div className="nav-comet-track" aria-hidden>
          <div className="nav-comet-line" />
          <div className="nav-comet" />
        </div>
      </div>
    </>
  );
}
