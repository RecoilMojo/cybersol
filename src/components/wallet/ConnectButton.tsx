"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function ConnectButton() {
  return (
    <div className="nav-wallet">
      <WalletMultiButton />
    </div>
  );
}

