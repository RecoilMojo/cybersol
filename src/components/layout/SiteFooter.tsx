import Link from "next/link";
import { LINKS } from "@/lib/links";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        Play is free. $CYBERSOL is optional. Tickets are a raffle, not a paycheck — no guaranteed
        SOL. Not financial advice.{" "}
        <Link href={LINKS.about}>How it works</Link>
        {" · "}
        <Link href={LINKS.roadmap}>Roadmap</Link>
      </p>
    </footer>
  );
}
