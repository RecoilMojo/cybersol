import type { Metadata, Viewport } from "next";
import { Orbitron, Rajdhani } from "next/font/google";
import { AppProviders } from "@/components/providers/AppProviders";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { NeonAtmosphere } from "@/components/layout/NeonAtmosphere";
import "./base.css";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-orbitron",
  display: "swap",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cybersol — Play in Browser. Win Daily SOL.",
  description:
    "Browser TCG on Solana from the solo indie behind Cybersoul. Free Solo Battle, daily SOL raffles, Cybersoul live on Steam.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://cybersol.org"),
  icons: { icon: "/graphics/cybersoul2-icon.png", apple: "/graphics/cybersoul2-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cybersol",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Cybersol — Browser TCG on Solana",
    description:
      "Free Solo Battle in the browser. Hold $CYBERSOL for daily SOL raffles. Solo indie — Cybersoul live on Steam.",
    type: "website",
    images: [{ url: "/graphics/cybersoul2-icon.png", width: 512, height: 512, alt: "Cybersol" }],
  },
  twitter: {
    card: "summary",
    title: "Cybersol — Play in Browser. Win Daily SOL.",
    description:
      "Free Solo Battle. Hold $CYBERSOL for daily SOL raffles. Built solo. Cybersoul live on Steam.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05020a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${orbitron.variable} ${rajdhani.variable}`}>
      <body>
        <div className="neon-shell">
          <NeonAtmosphere />
          <div className="site-content">
            <AppProviders>
              <SiteHeader />
              <main>{children}</main>
              <SiteFooter />
            </AppProviders>
          </div>
        </div>
      </body>
    </html>
  );
}
