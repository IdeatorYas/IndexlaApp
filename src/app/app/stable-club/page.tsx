import { notFound } from "next/navigation";
import { StableClubView } from "@/components/stable-club/StableClubView";
import { StableClubWalletProvider } from "@/components/wallet/StableClubWalletProvider";
import { getStableClubServerConfig } from "@/lib/stable-club/config";

export default function StableClubPage() {
  const config = getStableClubServerConfig();
  if (!config.devEnabled) {
    notFound();
  }

  return (
    <StableClubWalletProvider preferLocalHardhat>
      <StableClubView
        feeRecipientConfigured={config.feeRecipient !== null}
        baseRpcConfigured={config.baseRpcConfigured}
      />
    </StableClubWalletProvider>
  );
}
