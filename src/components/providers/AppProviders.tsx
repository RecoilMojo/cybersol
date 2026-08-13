"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const WalletProvider = dynamic(
  () => import("@/components/wallet/WalletProvider").then((m) => m.WalletProvider),
  { ssr: false },
);

export function AppProviders({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
