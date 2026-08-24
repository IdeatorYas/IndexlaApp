/** Chain logos for Degen marketplace category filters. */
export function DegenChainLogo({
  chain,
  size = 28,
}: {
  chain: "all" | "ethereum" | "solana" | "base" | "bnb";
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
          <linearGradient id="degen-sol" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00FFA3" />
            <stop offset="100%" stopColor="#DC1FFF" />
          </linearGradient>
        </defs>
        <rect x="4" y="8" width="24" height="5" rx="1" fill="url(#degen-sol)" />
        <rect x="4" y="14" width="24" height="5" rx="1" fill="url(#degen-sol)" opacity="0.75" />
        <rect x="4" y="20" width="24" height="5" rx="1" fill="url(#degen-sol)" opacity="0.5" />
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
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#F0B90B" />
      <path fill="#1E2026" d="M12.2 16 16 10.5 19.8 16 16 21.5 12.2 16Zm3.8-4.2 2.8 4.2-2.8 4.2-2.8-4.2 2.8-4.2ZM10.5 16l2.8-4.2L16 16l-2.7 4.2-2.8-4.2Zm11 0 2.7-4.2 2.8 4.2-2.8 4.2L21.5 16Z" />
    </svg>
  );
}
