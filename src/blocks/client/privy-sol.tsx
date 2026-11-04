"use client";

import { useEffect } from "react";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { useCreateWallet, useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import type { PrivyClientConfig } from "@privy-io/react-auth";
import type { SolHooks } from "./privy";

// Privy's Solana side, loaded only on Solana sites. Privy broadcasts through these RPCs after the visitor approves.

export const config = (): NonNullable<PrivyClientConfig["solana"]> => ({
  rpcs: {
    "solana:mainnet": {
      rpc: createSolanaRpc("https://api.mainnet-beta.solana.com"),
      rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.mainnet-beta.solana.com"),
      blockExplorerUrl: "https://solscan.io",
    },
  },
});

export function Hooks({ set }: { set: (s: SolHooks) => void }) {
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { createWallet } = useCreateWallet();
  useEffect(() => {
    set({
      wallets,
      create: () => createWallet(),
      async send(transaction, address) {
        const wallet = wallets.find((w) => w.address === address);
        if (!wallet) throw new Error("Sign in again to send.");
        // Like a browser wallet's signAndSend: back as soon as the network has it, without waiting for confirmation.
        const { signature } = await signAndSendTransaction({ transaction, wallet, chain: "solana:mainnet", options: { optimisticBroadcast: true } });
        return signature;
      },
    });
  });
  return null;
}
