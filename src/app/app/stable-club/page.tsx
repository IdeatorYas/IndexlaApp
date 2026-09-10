import { Suspense } from "react";
import { headers } from "next/headers";
import { StableClubBetaView } from "@/components/stable-club/StableClubBetaView";
import { StableClubView } from "@/components/stable-club/StableClubView";
import { StableClubWalletProvider } from "@/components/wallet/StableClubWalletProvider";
import { LoadingSkeleton } from "@/components/states/AppStates";
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
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-[#0b1f3a]">Stable Club</h1>
        <p className="mt-2 text-sm text-[#5b6b7c]">
          This product is not enabled in this environment.
        </p>
      </div>
    );
  }

  return (
    <StableClubWalletProvider preferLocalHardhat={false}>
      <Suspense
        fallback={
          <div className="min-h-[70vh] bg-[#e8eef5] px-4 py-8">
            <div className="mx-auto max-w-3xl">
              <LoadingSkeleton title="Loading Stable Club" lines={6} />
            </div>
          </div>
        }
      >
        <StableClubBetaView />
      </Suspense>
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
