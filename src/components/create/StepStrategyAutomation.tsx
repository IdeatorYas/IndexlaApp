"use client";

import {
  createCardClass,
  createInputClass,
  createSectionSubClass,
  createSectionTitleClass,
  createSelectClass,
} from "@/components/create/createUi";
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
        <h2 className={createSectionTitleClass}>Strategy & Automation</h2>
        <p className={createSectionSubClass}>
          Configure only the fields relevant to the selected strategy. Preview
          mode — no permissions are granted.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
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

      {showFields ? (
        <div className={`${createCardClass} grid gap-3 p-4 sm:grid-cols-2 sm:p-5`}>
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
              className={`${createSelectClass} mt-1.5 w-full`}
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
              className={`${createInputClass} mt-1.5`}
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
          <label className="flex items-center gap-2.5 text-sm font-semibold text-app-ink sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.strategy.circuitBreaker}
              onChange={(e) =>
                onChange({
                  ...draft.strategy,
                  circuitBreaker: e.target.checked,
                })
              }
              className="h-4 w-4 accent-[var(--color-brand)]"
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
        className={`${createInputClass} mt-1.5`}
      />
    </label>
  );
}
