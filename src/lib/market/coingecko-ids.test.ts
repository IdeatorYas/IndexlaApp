import { describe, expect, it } from "vitest";
import {
  getCoinGeckoIdForTicker,
  resolveCoinGeckoIds,
} from "@/lib/market/coingecko-ids";

describe("coingecko-ids", () => {
  it("maps core crypto tickers", () => {
    expect(getCoinGeckoIdForTicker("BTC")).toBe("bitcoin");
    expect(getCoinGeckoIdForTicker("eth")).toBe("ethereum");
    expect(getCoinGeckoIdForTicker("PAXG")).toBe("pax-gold");
  });

  it("returns null for equities (Twelve Data, not CoinGecko)", () => {
    expect(getCoinGeckoIdForTicker("NVDA")).toBeNull();
    expect(getCoinGeckoIdForTicker("AAPL")).toBeNull();
    expect(getCoinGeckoIdForTicker("SPY")).toBeNull();
  });

  it("splits mapped and unmapped tickers", () => {
    const { mapped, unmapped } = resolveCoinGeckoIds([
      "BTC",
      "ETH",
      "NVDA",
      "btc",
    ]);
    expect(mapped.map((m) => m.ticker)).toEqual(["btc", "eth"]);
    expect(unmapped).toEqual(["nvda"]);
  });
});
