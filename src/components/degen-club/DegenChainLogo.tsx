/** Chain logos for Degen marketplace category filters. */
export function DegenChainLogo({
  chain,
  size = 28,
}: {
  chain:
    | "all"
    | "ethereum"
    | "solana"
    | "base"
    | "bnb"
    | "sui"
    | "robinhood";
  size?: number;
}) {
  const s = size;
  if (chain === "all") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
        <circle cx="10" cy="12" r="3" fill="currentColor" opacity="0.85" />
        <circle cx="22" cy="12" r="3" fill="currentColor" opacity="0.85" />
        <circle cx="16" cy="22" r="3" fill="currentColor" opacity="0.85" />
      </svg>
    );
  }
  if (chain === "ethereum") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <path fill="#627EEA" d="M16 4 8 16.5 16 22l8-5.5L16 4Z" />
        <path fill="#627EEA" opacity="0.6" d="M16 4v18l8-5.5L16 4Z" />
        <path fill="#627EEA" opacity="0.85" d="M8 16.5 16 28V22l-8-5.5Z" />
        <path fill="#627EEA" opacity="0.45" d="M16 22v6l8-11.5L16 22Z" />
      </svg>
    );
  }
  if (chain === "solana") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id={`degen-sol-${s}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00FFA3" />
            <stop offset="100%" stopColor="#DC1FFF" />
          </linearGradient>
        </defs>
        <rect x="4" y="8" width="24" height="5" rx="1" fill={`url(#degen-sol-${s})`} />
        <rect x="4" y="14" width="24" height="5" rx="1" fill={`url(#degen-sol-${s})`} opacity="0.75" />
        <rect x="4" y="20" width="24" height="5" rx="1" fill={`url(#degen-sol-${s})`} opacity="0.5" />
      </svg>
    );
  }
  if (chain === "base") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="14" fill="#0052FF" />
        <path fill="#fff" d="M16 8c-4.4 0-8 3.6-8 8s3.6 8 8 8c3.9 0 7.1-2.8 7.9-6.5H16v-3.5h11.2C26.8 21.8 21.8 26 16 26 9.4 26 4 20.6 4 14S9.4 2 16 2c5.2 0 9.6 3.2 11.4 7.7H16V8Z" />
      </svg>
    );
  }
  if (chain === "sui") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="14" fill="#4DA2FF" />
        <path
          fill="#fff"
          d="M16 7c-2.2 0-4.1 1.2-5.1 3-.6 1-.9 2.1-.9 3.2 0 2.2 1.2 4.1 3 5.1l2 1.1 2-1.1c1.8-1 3-2.9 3-5.1 0-1.1-.3-2.2-.9-3.2C20.1 8.2 18.2 7 16 7Zm0 2.4c1.3 0 2.4.7 3 1.8.4.7.6 1.5.6 2.3 0 1.3-.7 2.4-1.8 3l-1.8 1-1.8-1c-1.1-.6-1.8-1.7-1.8-3 0-.8.2-1.6.6-2.3.6-1.1 1.7-1.8 3-1.8Z"
        />
        <path fill="#fff" opacity="0.9" d="M11 19.5c1.2 1.6 3.1 2.5 5 2.5s3.8-.9 5-2.5l-1.2-.7c-.9 1.1-2.2 1.7-3.8 1.7s-2.9-.6-3.8-1.7l-1.2.7Z" />
      </svg>
    );
  }
  if (chain === "robinhood") {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="14" fill="#00C805" />
        <path
          fill="#fff"
          d="M10 21.5V10.5h2.2v8.4l6.8-4.2v2.6l-4.6 2.8 4.6 2.8v2.6l-8.8-5.4v5.4H10Z"
        />
      </svg>
    );
  }
  /* BNB Chain — official yellow knot mark */
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#F0B90B" />
      <path
        fill="#1E2026"
        d="M12.05 16 16 10.35 19.95 16 16 21.65 12.05 16Zm3.95-4.55 2.55 3.95-2.55 3.95-2.55-3.95 2.55-3.95ZM10.5 16l2.55-3.95L15.6 16l-2.55 3.95L10.5 16Zm11 0 2.55-3.95L21.6 16l-2.55 3.95L21.5 16Z"
      />
    </svg>
  );
}
