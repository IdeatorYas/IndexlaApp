"use client";

import { DegenAssetIcon } from "@/components/degen-club/DegenAssetIcon";

const SINGLE = "pepe";

type Outcome = "fail" | "survive" | "launch";

const PORTFOLIO: { key: string; outcome: Outcome }[] = [
  { key: "shib", outcome: "fail" },
  { key: "floki", outcome: "fail" },
  { key: "toshi", outcome: "fail" },
  { key: "pengu", outcome: "survive" },
  { key: "bonk", outcome: "survive" },
  { key: "pepe", outcome: "survive" },
  { key: "fartcoin", outcome: "survive" },
  { key: "brett", outcome: "survive" },
  { key: "spx", outcome: "survive" },
  { key: "wif", outcome: "launch" },
];

function TargetReticle({
  active,
  color,
  size = "lg",
}: {
  active: boolean;
  color: string;
  size?: "lg" | "sm";
}) {
  const dim = size === "lg" ? 88 : 40;
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 120 120"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      aria-hidden
    >
      <circle
        cx="60"
        cy="60"
        r="46"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity={active ? 0.9 : 0.3}
      />
      <circle
        cx="60"
        cy="60"
        r="30"
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeOpacity={active ? 0.55 : 0.2}
        strokeDasharray="4 6"
      />
      <line x1="60" y1="6" x2="60" y2="24" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="60" y1="96" x2="60" y2="114" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="6" y1="60" x2="24" y2="60" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="96" y1="60" x2="114" y2="60" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
      {active ? (
        <circle cx="60" cy="60" r="4" fill={color} className="degen-reticle-pulse" />
      ) : null}
    </svg>
  );
}

function MiniSparkline({ outcome }: { outcome: Outcome }) {
  const points: Record<Outcome, string> = {
    fail: "0,2 8,4 16,7 24,11 32,14 40,15",
    survive: "0,8 10,7 20,9 30,8 40,8",
    launch: "0,14 8,11 16,8 24,4 32,2 40,0",
  };
  const colors: Record<Outcome, string> = {
    fail: "var(--degen-danger)",
    survive: "var(--degen-muted)",
    launch: "var(--degen-neon-green)",
  };

  return (
    <svg
      viewBox="0 0 40 16"
      className="degen-mini-spark mt-0.5 h-3 w-full"
      aria-hidden
    >
      <polyline
        points={points[outcome]}
        fill="none"
        stroke={colors[outcome]}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`degen-spark-${outcome}`}
      />
    </svg>
  );
}

function CrashChart() {
  return (
    <svg viewBox="0 0 120 36" className="degen-crash-chart mt-1.5 h-9 w-full" aria-hidden>
      <defs>
        <linearGradient id="degen-crash-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,77,77,0.35)" />
          <stop offset="100%" stopColor="rgba(255,77,77,0)" />
        </linearGradient>
      </defs>
      <path
        d="M0,4 L20,6 L40,10 L60,18 L80,28 L100,32 L120,34 L120,36 L0,36 Z"
        fill="url(#degen-crash-fill)"
        className="degen-crash-fill"
      />
      <polyline
        points="0,4 20,6 40,10 60,18 80,28 100,32 120,34"
        fill="none"
        stroke="var(--degen-danger)"
        strokeWidth="2"
        strokeLinecap="round"
        className="degen-crash-line"
      />
    </svg>
  );
}

function PortfolioChart() {
  return (
    <svg viewBox="0 0 120 32" className="degen-portfolio-chart mt-2 h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id="degen-portfolio-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(57,255,136,0.28)" />
          <stop offset="100%" stopColor="rgba(57,255,136,0)" />
        </linearGradient>
      </defs>
      <path
        d="M0,26 L15,24 L30,22 L45,20 L60,16 L75,12 L90,8 L105,5 L120,3 L120,32 L0,32 Z"
        fill="url(#degen-portfolio-fill)"
        className="degen-portfolio-fill"
      />
      <polyline
        points="0,26 15,24 30,22 45,20 60,16 75,12 90,8 105,5 120,3"
        fill="none"
        stroke="var(--degen-neon-green)"
        strokeWidth="2"
        strokeLinecap="round"
        className="degen-portfolio-line"
      />
    </svg>
  );
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  if (outcome === "launch") {
    return (
      <span className="degen-outcome-badge degen-outcome-launch" aria-hidden>
        ↑
      </span>
    );
  }
  if (outcome === "fail") {
    return (
      <span className="degen-outcome-badge degen-outcome-fail" aria-hidden>
        ↓
      </span>
    );
  }
  return (
    <span className="degen-outcome-badge degen-outcome-survive" aria-hidden>
      ·
    </span>
  );
}

/** 1 Shot vs 10 Shots — crash vs diversified launch story (illustrative). */
export function DegenShotsVisual({
  logoByAsset = {},
}: {
  logoByAsset?: Record<string, string | null | undefined>;
}) {
  return (
    <div className="degen-shots-wrap mx-auto w-full max-w-md lg:max-w-none">
      <div className="degen-shots-panel overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {/* 1 Shot — single coin crashes */}
          <div className="degen-shot-col degen-shot-one border-b border-[var(--degen-panel-border)] sm:border-b-0 sm:border-r">
            <p className="degen-shots-label degen-shots-label-danger">1 Shot</p>
            <div className="relative mx-auto mt-1.5 flex h-[4.5rem] w-full items-center justify-center sm:h-[4.75rem]">
              <TargetReticle active color="#ff4d4d" size="lg" />
              <div className="degen-single-coin relative z-10">
                <DegenAssetIcon
                  assetKey={SINGLE}
                  size={46}
                  imageUrl={logoByAsset[SINGLE]}
                />
              </div>
            </div>
            <CrashChart />
            <p className="degen-game-over mt-1.5">GAME OVER</p>
            <p className="degen-shots-caption mt-1">One coin · one crash · all in</p>
          </div>

          {/* 10 Shots — diversified outcomes */}
          <div className="degen-shot-col degen-shot-ten">
            <p className="degen-shots-label degen-shots-label-win">10 Shots</p>
            <div className="mt-1.5 grid grid-cols-5 gap-1 px-0.5">
              {PORTFOLIO.map(({ key, outcome }, i) => (
                <div
                  key={key}
                  className={[
                    "degen-portfolio-coin relative flex flex-col items-center",
                    outcome === "fail" ? "degen-coin-fail" : "",
                    outcome === "launch" ? "degen-coin-launch" : "",
                  ].join(" ")}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div className="relative flex h-9 w-full items-center justify-center sm:h-10">
                    <TargetReticle
                      active={outcome === "launch"}
                      color={
                        outcome === "launch"
                          ? "var(--degen-neon-green)"
                          : "var(--degen-purple)"
                      }
                      size="sm"
                    />
                    <div className="relative z-10">
                      <DegenAssetIcon
                        assetKey={key}
                        size={26}
                        imageUrl={logoByAsset[key]}
                      />
                    </div>
                    <OutcomeBadge outcome={outcome} />
                  </div>
                  <MiniSparkline outcome={outcome} />
                </div>
              ))}
            </div>
            <PortfolioChart />
            <p className="degen-shots-caption mt-1">
              Some fail · others survive ·{" "}
              <span className="text-[var(--degen-neon-green)]">one launches</span>
            </p>
          </div>
        </div>
      </div>

      <p className="degen-shots-disclaimer mt-1.5 text-center">
        Illustrative scenario.
      </p>
    </div>
  );
}
