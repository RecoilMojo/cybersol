import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daily Tickets — Cybersol",
  description:
    "Hold $CYBERSOL, beat the AI, earn raffle tickets. Daily SOL winners verified on-chain.",
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
