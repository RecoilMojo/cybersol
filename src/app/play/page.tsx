import type { Metadata } from "next";
import { BattleBoard } from "@/components/game/BattleBoard";

export const metadata: Metadata = {
  title: "Play Solo Battle — Cybersol",
  description:
    "Free browser TCG. No wallet required. Hold $CYBERSOL to earn daily SOL raffle tickets.",
};

export default function PlayPage() {
  return (
    <div className="page-wrap play-page">
      <BattleBoard />
    </div>
  );
}
