import { describe, expect, it } from "vitest";
import {
  closeOnOrBefore,
  performanceFromDailyCloses,
  shiftCalendarDays,
  type DailyBar,
} from "@/lib/adapters/twelve-data";
import {
  getTwelveDataSymbol,
  resolveTwelveDataSymbols,
} from "@/lib/market/twelve-data-symbols";

describe("twelve-data-symbols", () => {
  it("maps mega-tech equities and ETFs", () => {
    expect(getTwelveDataSymbol("AAPL")).toBe("AAPL");
    expect(getTwelveDataSymbol("nvda")).toBe("NVDA");
    expect(getTwelveDataSymbol("QQQ")).toBe("QQQ");
    expect(getTwelveDataSymbol("SPY")).toBe("SPY");
  });

  it("does not map crypto tickers", () => {
    expect(getTwelveDataSymbol("BTC")).toBeNull();
    expect(getTwelveDataSymbol("ETH")).toBeNull();
  });

  it("splits mapped equities from unknowns", () => {
    const { mapped, unmapped } = resolveTwelveDataSymbols([
      "AAPL",
      "BTC",
      "MSFT",
      "aapl",
    ]);
    expect(mapped.map((m) => m.ticker)).toEqual(["aapl", "msft"]);
    expect(unmapped).toEqual(["btc"]);
  });
});

describe("performanceFromDailyCloses", () => {
  const bars: DailyBar[] = [
    { date: "2026-08-21", close: 110 }, // Friday
    { date: "2026-08-20", close: 108 },
    { date: "2026-08-19", close: 107 },
    { date: "2026-08-18", close: 106 },
    { date: "2026-08-17", close: 105 },
    { date: "2026-08-14", close: 100 }, // Friday (~7 calendar days before 21st)
    { date: "2026-07-22", close: 80 }, // ~30 calendar days before 21st
    { date: "2026-07-01", close: 70 },
  ];

  it("shifts calendar days", () => {
    expect(shiftCalendarDays("2026-08-21", -7)).toBe("2026-08-14");
    expect(shiftCalendarDays("2026-08-21", -30)).toBe("2026-07-22");
  });

  it("picks close on or before target date", () => {
    expect(closeOnOrBefore(bars, "2026-08-14")).toBe(100);
    expect(closeOnOrBefore(bars, "2026-08-16")).toBe(100); // Sun → Fri 14th
    expect(closeOnOrBefore(bars, "2026-07-22")).toBe(80);
  });

  it("skips weekends by using the prior trading-day close", () => {
    // Latest Friday; 7 calendar days lands on prior Friday.
    expect(shiftCalendarDays("2026-08-21", -7)).toBe("2026-08-14");
    // If lookback lands on Saturday/Sunday, use Friday on or before.
    expect(closeOnOrBefore(bars, "2026-08-16")).toBe(100); // Sun
    expect(closeOnOrBefore(bars, "2026-08-15")).toBe(100); // Sat
  });

  it("returns null when history does not reach the lookback date", () => {
    const short: DailyBar[] = [
      { date: "2026-08-21", close: 110 },
      { date: "2026-08-20", close: 108 },
    ];
    expect(closeOnOrBefore(short, "2026-08-14")).toBeNull();
    const perf = performanceFromDailyCloses(short);
    expect(perf.latestClose).toBe(110);
    expect(perf.change7dPercent).toBeNull();
    expect(perf.change30dPercent).toBeNull();
  });

  it("computes 7D and 30D from trading-day closes", () => {
    const perf = performanceFromDailyCloses(bars);
    expect(perf.latestClose).toBe(110);
    expect(perf.change7dPercent).toBeCloseTo(10, 5); // 110/100 - 1
    expect(perf.change30dPercent).toBeCloseTo(37.5, 5); // 110/80 - 1
  });

  it("returns nulls when history is empty", () => {
    expect(performanceFromDailyCloses([])).toEqual({
      latestClose: null,
      change7dPercent: null,
      change30dPercent: null,
    });
  });
});
