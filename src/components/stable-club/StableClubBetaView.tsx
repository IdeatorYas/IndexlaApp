"use client";

import { StableClubAutomationPanel } from "@/components/stable-club/StableClubAutomationPanel";
import { StableClubCategoryExplain } from "@/components/stable-club/StableClubCategoryExplain";
import { StableClubDemoStrategyCard } from "@/components/stable-club/StableClubDemoStrategyCard";
import { StableClubFivePoolDepositPanel } from "@/components/stable-club/StableClubFivePoolDepositPanel";
import { useStableClubBetaReadiness } from "@/components/stable-club/useStableClubBetaReadiness";
import { STABLE_CLUB_DEMO_PRODUCTS } from "@/lib/stable-club/demo-strategies";

const RISK_NOTICE =
  "Concentrated liquidity can lose value, including from impermanent loss. INDEXLA does not custody funds. Deposit only what you can afford to lose.";

const APY_DISCLAIMER =
  "APYs are variable, may change rapidly and are not guaranteed.";

export function StableClubBetaView({
  depositsEnabledOverride,
  depositBlockersOverride,
  loadingOverride,
  errorOverride,
  devToolsEnabled = false,
}: {
  /** Test-only overrides. Production uses readiness hook. */
  depositsEnabledOverride?: boolean;
  depositBlockersOverride?: readonly string[];
  loadingOverride?: boolean;
  errorOverride?: string | null;
  devToolsEnabled?: boolean;
} = {}) {
  const { readiness, loading, error } = useStableClubBetaReadiness();
  const depositsEnabled = depositsEnabledOverride ?? readiness.depositsEnabled;
  const depositBlockers =
    depositBlockersOverride ?? (loadingOverride ?? loading ? [] : readiness.depositBlockers);
  const readinessError = errorOverride === undefined ? error : errorOverride;

  const heroCtaDisabled = !depositsEnabled;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mx-auto max-w-3xl text-center">
        <p className="app-label text-app-brand">INDEXLA STABLE CLUB</p>
        <h1 className="app-display mt-3 text-3xl font-bold tracking-tight text-app-ink sm:text-4xl lg:text-[2.75rem]">
          One Deposit. Five Pools. Less Risk.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-app-muted sm:text-base">
          Deposit USDC once and spread it equally across five selected DEX liquidity pools. Earn
          trading fees while INDEXLA automatically harvests and compounds your earnings—without
          lending, borrowing, or taking custody.
        </p>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-sky-300 sm:text-[13px]">
          20% Per Pool · Auto-Harvest · Auto-Compound · Non-Custodial
        </p>
        <div className="mt-6 flex justify-center">
          <a
            href="#base-strategy"
            className={[
              "app-gradient-btn inline-flex h-12 items-center justify-center rounded-[12px] px-6 text-sm font-bold",
              heroCtaDisabled ? "pointer-events-auto opacity-80" : "",
            ].join(" ")}
            aria-disabled={heroCtaDisabled}
            onClick={(e) => {
              // Always scroll to the live Base strategy; deposit remains gated in the strategy box.
              const target = document.getElementById("base-strategy");
              if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
          >
            Deposit Into 5-Pool Strategy
          </a>
        </div>
      </header>

      {/* Readiness errors stay internal — never render technical attestation/governance diagnostics. */}
      {readinessError && process.env.NODE_ENV !== "production" ? (
        <p className="sr-only" data-testid="stable-club-readiness-error">
          {readinessError}
        </p>
      ) : null}

      <div className="mt-10 space-y-8">
        <StableClubFivePoolDepositPanel
          depositsEnabled={depositsEnabled}
          depositBlockers={depositBlockers}
          variant="product"
        />

        <StableClubAutomationPanel />

        {STABLE_CLUB_DEMO_PRODUCTS.map((product) => (
          <StableClubDemoStrategyCard key={product.id} product={product} />
        ))}
      </div>

      <p className="mt-6 text-center text-[12px] font-medium text-app-dim">{APY_DISCLAIMER}</p>

      <StableClubCategoryExplain />

      <p className="mt-10 text-center text-[11px] leading-relaxed text-app-muted">{RISK_NOTICE}</p>

      {devToolsEnabled ? (
        <p className="mt-6 text-center text-[10px] text-app-dim">
          Developer tools enabled — internal test pool and Step 1/2 panels available below.
        </p>
      ) : null}
    </div>
  );
}
