"use client";

import type { CreateDraft, CreateStrategyId } from "@/lib/domain/create";
import { getStrategies } from "@/lib/data";

const STRATEGIES: { id: CreateStrategyId; label: string; hint: string }[] = [
  { id: "none", label: "None", hint: "Manual management only" },
  { id: "dca", label: "DCA", hint: "Recurring buys on a schedule" },
  { id: "rebalance", label: "Rebalance", hint: "Restore target weights" },
  { id: "buy-fear", label: "Buy Fear", hint: "Sentiment-triggered buys" },
  { id: "sell-greed", label: "Sell Greed", hint: "Sentiment-triggered trims" },
  { id: "rsi", label: "RSI", hint: "RSI threshold automation" },
  { id: "momentum", label: "Momentum", hint: "Trend-following rules" },
  { id: "take-profit", label: "Take Profit", hint: "Exit on upside target" },
  { id: "stop-loss", label: "Stop Loss", hint: "Exit on downside limit" },
  {
    id: "creator-strategy",
    label: "Eligible creator strategy",
    hint: "Apply a marketplace strategy",
  },
];

export function StepStrategyAutomation({
  draft,
  onChange,
}: {
  draft: CreateDraft;
  onChange: (strategy: CreateDraft["strategy"]) => void;
}) {
  const creators = getStrategies().data.filter((s) => !s.isIndexlaCore);
  const id = draft.strategy.strategyId;
  const showFields = id !== "none";

  return (
    <section className="space-y-4">
      <div>
        <h2 className="app-display text-xl font-bold text-app-ink">
          Strategy & Automation
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          Configure only the fields relevant to the selected strategy. Preview
          mode — no permissions are granted.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {STRATEGIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              onChange({
                ...draft.strategy,
                strategyId: item.id,
                creatorStrategyId:
                  item.id === "creator-strategy"
                    ? draft.strategy.creatorStrategyId
                    : null,
              })
            }
            className={[
              "app-panel app-panel-hover p-3 text-left",
              id === item.id ? "ring-2 ring-app-brand" : "",
            ].join(" ")}
          >
            <p className="text-sm font-bold text-app-ink">{item.label}</p>
            <p className="mt-0.5 text-[11px] text-app-dim">{item.hint}</p>
          </button>
        ))}
      </div>

      {id === "creator-strategy" ? (
        <label className="block text-sm">
          <span className="font-semibold text-app-ink">Creator strategy</span>
          <select
            className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3"
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

      {showFields ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Condition"
            value={draft.strategy.condition}
            onChange={(condition) =>
              onChange({ ...draft.strategy, condition })
            }
            placeholder="e.g. Fear & Greed < 30"
          />
          <Field
            label="Action"
            value={draft.strategy.action}
            onChange={(action) => onChange({ ...draft.strategy, action })}
            placeholder="e.g. Buy underweight assets"
          />
          <label className="text-sm">
            <span className="font-semibold text-app-ink">Frequency</span>
            <select
              className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3"
              value={draft.strategy.frequency}
              onChange={(e) =>
                onChange({ ...draft.strategy, frequency: e.target.value })
              }
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="on-trigger">On trigger</option>
            </select>
          </label>
          <Field
            label="Amount or percentage"
            value={draft.strategy.amountOrPercent}
            onChange={(amountOrPercent) =>
              onChange({ ...draft.strategy, amountOrPercent })
            }
            placeholder="e.g. 100 USD or 5%"
          />
          <label className="text-sm">
            <span className="font-semibold text-app-ink">Slippage (bps)</span>
            <input
              type="number"
              className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3"
              value={draft.strategy.slippageBps}
              onChange={(e) =>
                onChange({
                  ...draft.strategy,
                  slippageBps: Number(e.target.value) || 0,
                })
              }
            />
          </label>
          <Field
            label="Trade limit (USD)"
            value={draft.strategy.tradeLimitUsd}
            onChange={(tradeLimitUsd) =>
              onChange({ ...draft.strategy, tradeLimitUsd })
            }
            placeholder="Per-trade max"
          />
          <Field
            label="Daily limit (USD)"
            value={draft.strategy.dailyLimitUsd}
            onChange={(dailyLimitUsd) =>
              onChange({ ...draft.strategy, dailyLimitUsd })
            }
            placeholder="Daily max"
          />
          <Field
            label="Expiry"
            value={draft.strategy.expiry}
            onChange={(expiry) => onChange({ ...draft.strategy, expiry })}
            placeholder="YYYY-MM-DD or session"
          />
          <label className="flex items-center gap-2 text-sm font-semibold text-app-ink">
            <input
              type="checkbox"
              checked={draft.strategy.circuitBreaker}
              onChange={(e) =>
                onChange({
                  ...draft.strategy,
                  circuitBreaker: e.target.checked,
                })
              }
            />
            Circuit breaker enabled
          </label>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-sm">
      <span className="font-semibold text-app-ink">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3"
      />
    </label>
  );
}
