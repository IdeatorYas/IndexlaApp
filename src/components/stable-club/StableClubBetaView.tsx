"use client";

import { StableClubFivePoolDepositPanel } from "@/components/stable-club/StableClubFivePoolDepositPanel";
import { useStableClubBetaReadiness } from "@/components/stable-club/useStableClubBetaReadiness";

const RISK_NOTICE =
  "Concentrated liquidity can lose value, including from impermanent loss. INDEXLA does not custody funds. Deposit only what you can afford to lose.";

export function StableClubBetaView({ devToolsEnabled = false }: { devToolsEnabled?: boolean }) {
  const { readiness, loading, error } = useStableClubBetaReadiness();

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <header className="mb-6 text-center">
        <p className="app-label text-app-brand">Stable Club</p>
        <h1 className="app-display mt-2 text-2xl font-bold tracking-tight text-app-ink sm:text-3xl">
          One Deposit. Five Liquidity Pools.
        </h1>
      </header>

      {error ? <p className="mb-3 text-center text-[11px] text-app-danger">{error}</p> : null}

      <StableClubFivePoolDepositPanel
        depositsEnabled={readiness.depositsEnabled}
        depositBlockers={loading ? [] : readiness.depositBlockers}
        variant="product"
      />

      <p className="mt-5 text-center text-[11px] leading-relaxed text-app-muted">{RISK_NOTICE}</p>

      {devToolsEnabled ? (
        <p className="mt-6 text-center text-[10px] text-app-dim">
          Developer tools enabled — internal test pool and Step 1/2 panels available below.
        </p>
      ) : null}
    </div>
  );
}
