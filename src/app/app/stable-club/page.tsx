import { headers } from "next/headers";
import { StableClubBetaView } from "@/components/stable-club/StableClubBetaView";
import { StableClubView } from "@/components/stable-club/StableClubView";
import { StableClubWalletProvider } from "@/components/wallet/StableClubWalletProvider";
import { canExposeStableClubDevPanel } from "@/lib/stable-club/dev-panel-access";
import { getStableClubServerConfig } from "@/lib/stable-club/config";

export default async function StableClubPage() {
  const config = getStableClubServerConfig();
  const host = (await headers()).get("host");
  const devPanelAllowed = canExposeStableClubDevPanel({
    nodeEnv: process.env.NODE_ENV,
    host,
    devFlagEnabled: config.devEnabled,
  });

  if (!config.productEnabled && !devPanelAllowed) {
    return null;
  }

  return (
    <StableClubWalletProvider preferLocalHardhat={devPanelAllowed}>
      <StableClubBetaView devToolsEnabled={devPanelAllowed} />
      {devPanelAllowed ? (
        <div className="mx-auto max-w-6xl border-t border-app-line px-4 py-8 sm:px-6">
          <StableClubView
            feeRecipientConfigured={config.feeRecipient !== null}
            baseRpcConfigured={config.baseRpcConfigured}
            preferLocalHardhat
            devPanelAllowed={devPanelAllowed}
          />
        </div>
      ) : null}
    </StableClubWalletProvider>
  );
}
