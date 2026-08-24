"use client";

import { DegenAssetIcon } from "@/components/degen-club/DegenAssetIcon";

const SINGLE = "pepe";
const PORTFOLIO = [
  "pengu",
  "wif",
  "bonk",
  "shib",
  "pepe",
  "spx",
  "floki",
  "fartcoin",
  "toshi",
  "brett",
] as const;

function TargetReticle({
  active,
  color,
  size = "lg",
}: {
  active: boolean;
  color: string;
  size?: "lg" | "sm";
}) {
  const dim = size === "lg" ? 96 : 44;
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 120 120"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      aria-hidden
    >
      <circle cx="60" cy="60" r="46" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity={active ? 0.9 : 0.35} />
      <circle cx="60" cy="60" r="30" fill="none" stroke={color} strokeWidth="1" strokeOpacity={active ? 0.6 : 0.25} strokeDasharray="4 6" />
      <line x1="60" y1="6" x2="60" y2="26" stroke={color} strokeWidth="1.5" strokeOpacity="0.75" />
      <line x1="60" y1="94" x2="60" y2="114" stroke={color} strokeWidth="1.5" strokeOpacity="0.75" />
      <line x1="6" y1="60" x2="26" y2="60" stroke={color} strokeWidth="1.5" strokeOpacity="0.75" />
      <line x1="94" y1="60" x2="114" y2="60" stroke={color} strokeWidth="1.5" strokeOpacity="0.75" />
      {active ? (
        <circle cx="60" cy="60" r="4" fill={color} className="degen-reticle-pulse" />
      ) : null}
    </svg>
  );
}

/** 1 Shot vs 10 Shots — aligned with indexla.tech/degen-club concept. */
export function DegenShotsVisual({
  logoByAsset = {},
}: {
  logoByAsset?: Record<string, string | null | undefined>;
}) {
  const singleColor = "#ff6b2c";

  return (
    <div className="degen-shots-wrap mx-auto w-full max-w-md lg:max-w-none">
      <p className="degen-shots-tagline text-center">
        <span className="text-[var(--degen-ink)]">One Coin.</span>{" "}
        <span className="text-[var(--degen-neon-magenta)]">One Shot.</span>
      </p>

      <div className="degen-shots-panel mt-2 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="degen-shot-col degen-shot-one border-b border-[var(--degen-panel-border)] sm:border-b-0 sm:border-r">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ff8fab]">
              1 Shot
            </p>
            <div className="relative mx-auto mt-2 flex h-[5.5rem] w-full items-center justify-center sm:h-[6rem]">
              <TargetReticle active color={singleColor} size="lg" />
              <div className="degen-single-coin relative z-10">
                <DegenAssetIcon
                  assetKey={SINGLE}
                  size={52}
                  imageUrl={logoByAsset[SINGLE]}
                />
              </div>
            </div>
          </div>

          <div className="degen-shot-col degen-shot-ten">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--degen-neon-green)]">
              10 Shots
            </p>
            <div className="mt-2 grid grid-cols-5 gap-1.5 px-1 sm:grid-cols-5">
              {PORTFOLIO.map((key, i) => (
                <div
                  key={key}
                  className="degen-portfolio-coin relative flex flex-col items-center"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="relative flex h-10 w-full items-center justify-center sm:h-11">
                    <TargetReticle active={false} color="var(--degen-purple)" size="sm" />
                    <div className="relative z-10">
                      <DegenAssetIcon
                        assetKey={key}
                        size={28}
                        imageUrl={logoByAsset[key]}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="degen-shots-tagline mt-2 text-center">
        <span className="text-[var(--degen-ink)]">Portfolio.</span>{" "}
        <span className="text-[var(--degen-neon-green)]">Multiple Shots.</span>
      </p>
      <p className="mt-1.5 text-center text-[10px] font-semibold text-[var(--degen-muted)]">
        Visual representation only. Logos do not imply endorsement.
      </p>
    </div>
  );
}
