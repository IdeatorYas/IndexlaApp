"use client";

import {
  createCardClass,
  createInputClass,
  createSectionSubClass,
  createSectionTitleClass,
  createSelectClass,
} from "@/components/create/createUi";
import { DcaFutureCalendar } from "@/components/create/DcaFutureCalendar";
import {
  AUTOMATE_SELL_OPTIONS,
  CREATE_STRATEGY_OPTIONS,
  FEAR_GREED_FIXED_RULES,
  FEAR_GREED_SELL_RULES,
  type CreateDraft,
  type CreateStrategyId,
  type DcaMode,
  type DcaSchedule,
  type MomentumTimeframe,
  type RsiTimeframe,
} from "@/lib/domain/create";
import { formatUsd } from "@/lib/dashboard/data";
import { getStrategies } from "@/lib/data";

const NO_SETUP_IDS = new Set<CreateStrategyId>(["buy-now"]);

export function StepStrategyAutomation({
  draft,
  onChange,
  onInvestmentChange,
}: {
  draft: CreateDraft;
  onChange: (strategy: CreateDraft["strategy"]) => void;
  onInvestmentChange?: (investmentUsd: number) => void;
}) {
  const creators = getStrategies().data.filter((s) => !s.isIndexlaCore);
  const id = draft.strategy.strategyId;
  const needsSetup = !NO_SETUP_IDS.has(id);

  function patch(partial: Partial<CreateDraft["strategy"]>) {
    onChange({ ...draft.strategy, ...partial });
  }

  function selectStrategy(strategyId: CreateStrategyId) {
    patch({
      strategyId,
      creatorStrategyId:
        strategyId === "creator-strategy"
          ? draft.strategy.creatorStrategyId
          : null,
      automateSellId:
        strategyId === "buy-now-automate-sells"
          ? draft.strategy.automateSellId
          : null,
      condition: "",
      action: "",
    });
  }

  function setExecutionPercent(value: number) {
    const executionPercent = Math.max(0, Math.min(100, value));
    patch({
      executionPercent,
      amountOrPercent: executionPercent > 0 ? String(executionPercent) : "",
    });
  }

  const showInvestmentField =
    id === "buy-now" || id === "buy-now-automate-sells";

  return (
    <section className="space-y-5">
      <div>
        <h2 className={createSectionTitleClass}>Automation Strategy</h2>
        <p className={createSectionSubClass}>
          Select a strategy and configure only the settings that matter. Preview
          mode — no wallet permissions are granted yet.
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

      {showInvestmentField && onInvestmentChange ? (
        <div className={`${createCardClass} space-y-2 p-4 sm:p-5`}>
          <label className="block text-sm">
            <span className="font-semibold text-app-ink">
              Investment amount (USD)
            </span>
            <p className="mt-0.5 text-[11px] text-app-dim">
              Buys execute immediately on confirmation. Adjust anytime on
              review.
            </p>
            <input
              type="number"
              min={0}
              value={draft.investmentUsd}
              onChange={(e) =>
                onInvestmentChange(Number(e.target.value) || 0)
              }
              className={`${createInputClass} mt-2 max-w-xs`}
            />
          </label>
          {draft.investmentUsd > 0 ? (
            <p className="text-xs font-semibold text-app-brand">
              Immediate buy preview: {formatUsd(draft.investmentUsd)}
            </p>
          ) : null}
        </div>
      ) : null}

      {id === "buy-now" ? (
        <p className={`${createCardClass} px-4 py-3 text-sm text-app-muted`}>
          Immediate purchase only — no automated sells. Continue when ready to
          review.
        </p>
      ) : null}

      {id === "creator-strategy" ? (
        <label className={`${createCardClass} block p-4 text-sm`}>
          <span className="font-semibold text-app-ink">Creator strategy</span>
          <select
            className={`${createSelectClass} mt-2 w-full`}
            value={draft.strategy.creatorStrategyId ?? ""}
            onChange={(e) =>
              patch({ creatorStrategyId: e.target.value || null })
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

      {id === "buy-now-automate-sells" ? (
        <div className={`${createCardClass} space-y-5 p-4 sm:p-5`}>
          <div>
            <p className="text-sm font-semibold text-app-ink">
              Automated sell strategy
            </p>
            <p className="mt-0.5 text-[11px] text-app-dim">
              After your immediate buy, automate exits when the selected sell
              condition triggers.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {AUTOMATE_SELL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => patch({ automateSellId: opt.id })}
                  className={[
                    "rounded-[12px] border p-3 text-left transition",
                    draft.strategy.automateSellId === opt.id
                      ? "border-app-brand/50 bg-app-brand/10 ring-2 ring-app-brand/60"
                      : "border-app-line/70 bg-app-elevated/80 hover:border-app-brand/30",
                  ].join(" ")}
                >
                  <p className="text-sm font-bold text-app-ink">{opt.label}</p>
                  <p className="mt-1 text-[10px] leading-snug text-app-dim">
                    {opt.hint}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {draft.strategy.automateSellId === "fear-greed" ? (
            <div className="rounded-[12px] border border-app-line/60 bg-app-panel/50 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-dim">
                Sell triggers
              </p>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {FEAR_GREED_SELL_RULES.map((rule) => (
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

          {draft.strategy.automateSellId === "rsi" ? (
            <TimeframePicker
              label="RSI timeframe"
              hint="Sell when the selected RSI becomes overbought."
              value={draft.strategy.rsiTimeframe}
              onChange={(rsiTimeframe: RsiTimeframe) => patch({ rsiTimeframe })}
            />
          ) : null}

          {draft.strategy.automateSellId === "momentum" ? (
            <TimeframePicker
              label="Momentum timeframe"
              hint="Sell when the selected trend turns bearish."
              value={draft.strategy.momentumTimeframe}
              onChange={(momentumTimeframe: MomentumTimeframe) =>
                patch({ momentumTimeframe, frequency: momentumTimeframe })
              }
            />
          ) : null}

          {draft.strategy.automateSellId ? (
            <label className="block text-sm">
              <span className="font-semibold text-app-ink">
                Sell % per triggered execution
              </span>
              <p className="mt-0.5 text-[11px] text-app-dim">
                10% DCAs out 10% per trigger; 100% fully exits when the sell
                condition fires.
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
          ) : null}
        </div>
      ) : null}

      {needsSetup && id !== "buy-now-automate-sells" ? (
        <div className={`${createCardClass} space-y-5 p-4 sm:p-5`}>
          {id === "fear-greed" ? (
            <div className="rounded-[12px] border border-app-line/60 bg-app-panel/50 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-dim">
                INDEXLA Fear &amp; Greed rules
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
            <TimeframePicker
              label="RSI timeframe"
              hint="Buy when oversold and sell when overbought on the selected RSI."
              value={draft.strategy.rsiTimeframe}
              onChange={(rsiTimeframe: RsiTimeframe) => patch({ rsiTimeframe })}
            />
          ) : null}

          {id === "momentum" ? (
            <TimeframePicker
              label="Trend timeframe"
              hint="Buy when the selected trend turns bullish."
              value={draft.strategy.momentumTimeframe}
              onChange={(momentumTimeframe: MomentumTimeframe) =>
                patch({ momentumTimeframe, frequency: momentumTimeframe })
              }
            />
          ) : null}

          {id === "take-profit-stop-loss" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <PercentField
                label="Take-Profit target %"
                value={draft.strategy.takeProfitTargetPercent}
                onChange={(takeProfitTargetPercent) =>
                  patch({ takeProfitTargetPercent })
                }
              />
              <PercentField
                label="Take-Profit sell %"
                value={draft.strategy.takeProfitSellPercent}
                onChange={(takeProfitSellPercent) =>
                  patch({ takeProfitSellPercent })
                }
              />
              <PercentField
                label="Stop-Loss target %"
                value={draft.strategy.stopLossTargetPercent}
                onChange={(stopLossTargetPercent) =>
                  patch({ stopLossTargetPercent })
                }
              />
              <PercentField
                label="Stop-Loss sell %"
                value={draft.strategy.stopLossSellPercent}
                onChange={(stopLossSellPercent) =>
                  patch({ stopLossSellPercent })
                }
              />
            </div>
          ) : null}

          {id === "dca" ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-app-ink">DCA mode</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["schedule", "Daily / Weekly"],
                      ["calendar", "Specific dates"],
                    ] as [DcaMode, string][]
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => patch({ dcaMode: mode })}
                      className={[
                        "h-10 rounded-[12px] px-4 text-sm font-bold transition",
                        draft.strategy.dcaMode === mode
                          ? "bg-gradient-to-r from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-white"
                          : "border border-app-line text-app-muted hover:text-app-ink",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {draft.strategy.dcaMode === "schedule" ? (
                <TimeframePicker
                  label="DCA schedule"
                  hint="Recurring purchases on the selected cadence."
                  value={draft.strategy.dcaSchedule}
                  onChange={(dcaSchedule: DcaSchedule) =>
                    patch({ dcaSchedule })
                  }
                />
              ) : (
                <DcaFutureCalendar
                  selectedDates={draft.strategy.dcaDates}
                  onChange={(dcaDates) => patch({ dcaDates })}
                />
              )}
            </div>
          ) : null}

          {id !== "take-profit-stop-loss" ? (
            <label className="block text-sm">
              <span className="font-semibold text-app-ink">
                Execution % of deposited wallet balance
              </span>
              <p className="mt-0.5 text-[11px] text-app-dim">
                Percentage only — used per strategy execution.
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
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TimeframePicker<T extends string>({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-app-ink">{label}</p>
      <p className="text-xs text-app-muted">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {(["daily", "weekly"] as T[]).map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => onChange(tf)}
            className={[
              "h-10 rounded-[12px] px-4 text-sm font-bold capitalize transition",
              value === tf
                ? "bg-gradient-to-r from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-white"
                : "border border-app-line text-app-muted hover:text-app-ink",
            ].join(" ")}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm">
      <span className="font-semibold text-app-ink">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={value > 0 ? value : ""}
          onChange={(e) =>
            onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
          }
          className={createInputClass}
        />
        <span className="text-sm font-bold text-app-dim">%</span>
      </div>
    </label>
  );
}
