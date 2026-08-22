import type { ReactNode } from "react";

export function LoadingSkeleton({
  title = "Loading",
  lines = 3,
}: {
  title?: string;
  lines?: number;
}) {
  return (
    <div
      className="app-panel p-6 animate-pulse"
      role="status"
      aria-label={title}
    >
      <div className="mb-4 h-4 w-40 rounded bg-app-panel" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="mb-2 h-3 rounded bg-app-panel"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="app-panel flex flex-col items-start gap-3 p-8 text-left">
      <h3 className="app-display text-lg font-semibold text-app-ink">{title}</h3>
      <p className="max-w-prose text-sm text-app-muted">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="app-panel border-app-danger/30 p-8"
      role="alert"
    >
      <h3 className="app-display text-lg font-semibold text-app-danger">
        {title}
      </h3>
      <p className="mt-2 text-sm text-app-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function DisconnectedWalletState({
  onConnect,
  showAction = true,
}: {
  onConnect?: () => void;
  showAction?: boolean;
}) {
  return (
    <EmptyState
      title="Wallet not connected"
      description={
        showAction
          ? "Connect your wallet to view balances, portfolios and automation. Your keys never leave your control."
          : "Connect your wallet using the button in the header to load your portfolio overview."
      }
      action={
        showAction ? (
          <button
            type="button"
            onClick={onConnect}
            className="rounded-lg bg-app-brand px-4 py-2 text-sm font-medium text-white"
          >
            Connect Wallet
          </button>
        ) : undefined
      }
    />
  );
}

export function UnavailableState({
  title = "Unavailable",
  description,
  demoLabel,
}: {
  title?: string;
  description: string;
  demoLabel?: string;
}) {
  return (
    <div className="app-panel p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="app-display text-base font-semibold text-app-ink">
          {title}
        </h3>
        {demoLabel ? (
          <span className="rounded-full bg-app-warning/15 px-2 py-0.5 text-xs font-medium text-app-warning">
            {demoLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-app-muted">{description}</p>
    </div>
  );
}

export function UtilityGateState({
  featureName,
  demoMode,
}: {
  featureName: string;
  demoMode: boolean;
}) {
  if (demoMode) {
    return (
      <UnavailableState
        title={`${featureName} — Demo UI`}
        demoLabel="Non-production"
        description="This utility action is shown for development/staging preview only. No real $DEXLA transaction will execute."
      />
    );
  }

  return (
    <UnavailableState
      title={`${featureName} — Coming after $DEXLA launch`}
      description="This action remains disabled until $DEXLA utility activation on production."
    />
  );
}
