import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAGE1_FIVE_POOL_BETA_POOL_IDS } from "@/lib/stable-club/stage1-launch";

const fetchOfficialPoolApyQuotes = vi.fn();

vi.mock("@/lib/stable-club/pool-apy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stable-club/pool-apy")>();
  return {
    ...actual,
    fetchOfficialPoolApyQuotes: (...args: unknown[]) => fetchOfficialPoolApyQuotes(...args),
  };
});

describe("GET /api/stable-club/pool-apy", () => {
  beforeEach(() => {
    fetchOfficialPoolApyQuotes.mockReset();
    fetchOfficialPoolApyQuotes.mockResolvedValue({
      fetchedAt: new Date().toISOString(),
      quotes: STAGE1_FIVE_POOL_BETA_POOL_IDS.map((poolId) => ({
        poolId,
        poolAddress: "0x0000000000000000000000000000000000000001",
        apyPercent: 5,
        apyBasePercent: 5,
        apyRewardPercent: 0,
        source: "defillama-yields",
        updatedAt: new Date().toISOString(),
        status: "available",
      })),
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function loadGet() {
    const mod = await import("./route");
    return mod.GET;
  }

  it("returns five canonical quotes with source and fetchedAt", async () => {
    const GET = await loadGet();
    const res = await GET(new Request("http://localhost/api/stable-club/pool-apy"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("defillama-yields");
    expect(body.fetchedAt).toBeTruthy();
    expect(body.displayOnly).toBe(true);
    expect(body.quotes).toHaveLength(5);
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=/);
  });

  it("filters by canonical poolId", async () => {
    const GET = await loadGet();
    const res = await GET(
      new Request("http://localhost/api/stable-club/pool-apy?poolId=USDC-cbBTC-UNI-005"),
    );
    const body = await res.json();
    expect(body.quotes).toHaveLength(1);
    expect(body.quotes[0].poolId).toBe("USDC-cbBTC-UNI-005");
  });

  it("rejects unknown poolId", async () => {
    const GET = await loadGet();
    const res = await GET(new Request("http://localhost/api/stable-club/pool-apy?poolId=evil-pool"));
    expect(res.status).toBe(400);
  });

  it("rejects user-supplied external url parameter", async () => {
    const GET = await loadGet();
    const res = await GET(
      new Request("http://localhost/api/stable-club/pool-apy?url=https://evil.example/pools"),
    );
    expect(res.status).toBe(400);
    expect(fetchOfficialPoolApyQuotes).not.toHaveBeenCalled();
  });

  it("returns 503 when upstream fetch fails", async () => {
    fetchOfficialPoolApyQuotes.mockRejectedValueOnce(new Error("timeout"));
    const GET = await loadGet();
    const res = await GET(new Request("http://localhost/api/stable-club/pool-apy"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.quotes).toEqual([]);
    expect(body.source).toBe("defillama-yields");
  });
});
