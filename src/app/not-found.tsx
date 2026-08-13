import type { Metadata } from "next";
import Link from "next/link";
import { LINKS } from "@/lib/links";

export const metadata: Metadata = {
  title: "Page not found — Cybersol",
};

export default function NotFound() {
  return (
    <div className="page-wrap about-page">
      <header className="about-hero panel panel-glow">
        <p className="home-kicker">
          <span className="home-kicker-dot" aria-hidden />
          404
        </p>
        <h1 className="page-title">This node is dark</h1>
        <p className="about-lead">
          That page isn’t on the Grid. Solo Battle is still live — no wallet needed.
        </p>
        <div className="hero-actions about-hero-actions">
          <Link href={LINKS.play} className="btn-primary">
            Play Free Now
          </Link>
          <Link href="/" className="btn-secondary">
            Home
          </Link>
        </div>
      </header>
    </div>
  );
}
