"use client";

import {
  createCardClass,
  createInputClass,
  createSectionSubClass,
  createSectionTitleClass,
  createSelectClass,
} from "@/components/create/createUi";
import {
  CREATE_STRATEGY_OPTIONS,
  FEAR_GREED_FIXED_RULES,
  type CreateDraft,
  type CreateStrategyId,
  type MomentumTimeframe,
} from "@/lib/domain/create";
import { getStrategies } from "@/lib/data";

export function StepStrategyAutomation({
  draft,
  onChange,
}: {
  draft: CreateDraft;
  onChange: (strategy: CreateDraft["strategy"]) => void;
}) {
  const creators = getStrategies().data.filter((s) => !s.isIndexlaCore);
  const id = draft.strategy.strategyId;
  const needsSetup = id !== "none";

  function selectStrategy(strategyId: CreateStrategyId) {
    onChange({
      ...draft.strategy,
      strategyId,
      creatorStrategyId:
        strategyId === "creator-strategy"
          ? draft.strategy.creatorStrategyId
          : null,
      condition: "",
      action: "",
      amountOrPercent:
        draft.strategy.executionPercent > 0
          ? String(draft.strategy.executionPercent)
          : "",
    });
  }

  function setExecutionPercent(value: number) {
    const executionPercent = Math.max(0, Math.min(100, value));
    onChange({
      ...draft.strategy,
      executionPercent,
      amountOrPercent: executionPercent > 0 ? String(executionPercent) : "",
    });
  }

  function setMomentumTimeframe(momentumTimeframe: MomentumTimeframe) {
    onChange({
      ...draft.strategy,
      momentumTimeframe,
      frequency: momentumTimeframe,
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className={createSectionTitleClass}>Strategy & Automation</h2>
        <p className={createSectionSubClass}>
          Select a strategy, set execution %, then continue to review. Rules are
          fixed by INDEXLA — preview mode only, no permissions granted.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {CREATE_STRATEGY_OPTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectStrategy(item.id)}
            className={[
              createCardClass,
              "p-3.5 text-left transition",
              id === item.id
                ? "ring-2 ring-app-brand/80"
                : "hover:border-app-brand/35",
            ].join(" ")}
          >
            <p className="text-sm font-bold text-app-ink">{item.label}</p>
            <p className="mt-1 text-[11px] leading-snug text-app-dim">
              {item.hint}
            </p>
          </button>
        ))}
      </div>

      {id === "creator-strategy" ? (
        <label className={`${createCardClass} block p-4 text-sm`}>
          <span className="font-semibold text-app-ink">Creator strategy</span>
          <select
            className={`${createSelectClass} mt-2 w-full`}
            value={draft.strategy.creatorStrategyId ?? ""}
            onChange={(e) =>
              onChange({
                ...draft.strategy,
                creatorStrategyId: e.target.value || null,
              })
            }
          >
            <option value="">Select eligible strategy</option>
            {creators.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · @{s.creatorHandle}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {needsSetup ? (
        <div className={`${createCardClass} space-y-4 p-4 sm:p-5`}>
          {id === "fear-greed" ? (
            <div className="rounded-[12px] border border-app-line/60 bg-app-panel/50 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-dim">
                INDEXLA Fear &amp; Greed rules
              </p>
              <p className="mt-1 text-xs text-app-muted">
                Buy during Fear/Extreme Fear and sell during Greed/Extreme
                Greed. Thresholds are fixed — no condition or action setup.
              </p>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {FEAR_GREED_FIXED_RULES.map((rule) => (
                  <li
                    key={rule.label}
                    className="flex items-center justify-between rounded-[10px] border border-app-line/50 bg-app-elevated/80 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-semibold text-app-ink">
                      {rule.label}
                    </span>
                    <span className="tabular-nums text-app-dim">
                      {rule.threshold}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {id === "rsi" ? (
            <p className="rounded-[12px] border border-app-line/60 bg-app-panel/50 px-3.5 py-3 text-xs text-app-muted">
              RSI buys when oversold and sells when overbought. Thresholds are
              strategy-defined — no separate condition or action setup.
            </p>
          ) : null}

          {id === "take-profit-stop-loss" ? (
            <p className="rounded-[12px] border border-app-line/60 bg-app-panel/50 px-3.5 py-3 text-xs text-app-muted">
              Take Profit &amp; Stop Loss runs as one strategy for upside exits
              and downside protection. No separate TP/SL setup fields.
            </p>
          ) : null}

          {id === "momentum" ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-app-ink">
                Trend timeframe
              </p>
              <p className="text-xs text-app-muted">
                Buy when the selected trend turns bullish.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["daily", "weekly"] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setMomentumTimeframe(tf)}
                    className={[
                      "h-10 rounded-[12px] px-4 text-sm font-bold capitalize transition",
                      draft.strategy.momentumTimeframe === tf
                        ? "bg-gradient-to-r from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-white"
                        : "border border-app-line text-app-muted hover:text-app-ink",
                    ].join(" ")}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {id === "dca" || id === "rebalance" || id === "creator-strategy" ? (
            <p className="rounded-[12px] border border-app-line/60 bg-app-panel/50 px-3.5 py-3 text-xs text-app-muted">
              {id === "dca"
                ? "DCA executes recurring buys on schedule using your execution %."
                : id === "rebalance"
                  ? "Rebalance restores target weights using your execution %."
                  : "Creator strategy rules apply; set how much balance to use per run."}
            </p>
          ) : null}

          <label className="block text-sm">
            <span className="font-semibold text-app-ink">
              Execution % of deposited wallet balance
            </span>
            <p className="mt-0.5 text-[11px] text-app-dim">
              Percentage only — used per strategy execution. Not a fixed USD
              amount.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={
                  draft.strategy.executionPercent > 0
                    ? draft.strategy.executionPercent
                    : ""
                }
                placeholder="e.g. 10"
                onChange={(e) =>
                  setExecutionPercent(Number(e.target.value) || 0)
                }
                className={`${createInputClass} max-w-[10rem]`}
              />
              <span className="text-sm font-bold text-app-dim">%</span>
            </div>
          </label>
        </div>
      ) : (
        <p className={`${createCardClass} px-4 py-3 text-sm text-app-muted`}>
          No automation — continue when you are ready to review.
        </p>
      )}
    </section>
  );
}
