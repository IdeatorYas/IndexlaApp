"use client";

import { useMemo } from "react";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { canExposeStableClubDevPanelInBrowser } from "@/lib/stable-club/dev-panel-access";

export function useStableClubDevPanelAllowed(devFlagEnabled: boolean): boolean {
  const wallet = useStableClubWallet();
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return canExposeStableClubDevPanelInBrowser({
      hostname: window.location.hostname,
      devFlagEnabled,
      walletChainId: wallet.chainId,
    });
  }, [devFlagEnabled, wallet.chainId]);
}
