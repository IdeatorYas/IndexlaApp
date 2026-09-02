import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Avoid importing real constants → viem/chains (multi-second cold import under full-suite load).
 * URL value matches production local RPC so forwarding assertions stay honest.
 */
vi.mock("@/lib/stable-club/constants", () => ({
  STABLE_CLUB_LOCAL_RPC_URL: "http://127.0.0.1:8545",
}));

function mockRequest(host: string, jsonImpl?: () => Promise<unknown>): Request {
  return {
    headers: new Headers({ host }),
    json: jsonImpl ?? vi.fn(async () => ({ method: "eth_chainId", params: [] })),
  } as unknown as Request;
}

describe("SC-F07 e2e/rpc route gate", () => {
  const originalDev = process.env.STABLE_CLUB_DEV_ENABLED;
  const originalE2e = process.env.STABLE_CLUB_E2E_SIGNING;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Isolate from any prior file/worker pollution before installing our stub.
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();

    // Deterministic stub — never fall through to real localhost:8545.
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: "0x7a69" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect(globalThis.fetch).toBe(fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (originalDev === undefined) delete process.env.STABLE_CLUB_DEV_ENABLED;
    else process.env.STABLE_CLUB_DEV_ENABLED = originalDev;
    if (originalE2e === undefined) delete process.env.STABLE_CLUB_E2E_SIGNING;
    else process.env.STABLE_CLUB_E2E_SIGNING = originalE2e;
  });

  async function loadPost() {
    const mod = await import("./route");
    return mod.POST;
  }

  it("both flags true + localhost → forwards RPC", async () => {
    process.env.STABLE_CLUB_DEV_ENABLED = "true";
    process.env.STABLE_CLUB_E2E_SIGNING = "true";
    const POST = await loadPost();
    // Re-bind after import in case the module graph replaced global fetch.
    vi.stubGlobal("fetch", fetchMock);
    expect(globalThis.fetch).toBe(fetchMock);
    const json = vi.fn(async () => ({ method: "eth_chainId", params: [] }));
    const res = await POST(mockRequest("localhost:3457", json));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "0x7a69" });
    expect(json).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8545");
    expect(globalThis.fetch).toBe(fetchMock);
  });

  it("DEV unset + E2E true → 404 before RPC", async () => {
    delete process.env.STABLE_CLUB_DEV_ENABLED;
    process.env.STABLE_CLUB_E2E_SIGNING = "true";
    const POST = await loadPost();
    const json = vi.fn(async () => ({ method: "eth_chainId" }));
    const res = await POST(mockRequest("localhost", json));
    expect(res.status).toBe(404);
    expect(json).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DEV true + E2E unset → 404 before RPC", async () => {
    process.env.STABLE_CLUB_DEV_ENABLED = "true";
    delete process.env.STABLE_CLUB_E2E_SIGNING;
    const POST = await loadPost();
    const json = vi.fn(async () => ({ method: "eth_chainId" }));
    const res = await POST(mockRequest("127.0.0.1:3457", json));
    expect(res.status).toBe(404);
    expect(json).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("both true + non-local Host → 404 before RPC", async () => {
    process.env.STABLE_CLUB_DEV_ENABLED = "true";
    process.env.STABLE_CLUB_E2E_SIGNING = "true";
    const POST = await loadPost();
    const json = vi.fn(async () => ({ method: "eth_chainId" }));
    const res = await POST(mockRequest("evil.example", json));
    expect(res.status).toBe(404);
    expect(json).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DEV=1 (not exact true) fails closed", async () => {
    process.env.STABLE_CLUB_DEV_ENABLED = "1";
    process.env.STABLE_CLUB_E2E_SIGNING = "true";
    const POST = await loadPost();
    const json = vi.fn(async () => ({ method: "eth_chainId" }));
    const res = await POST(mockRequest("localhost", json));
    expect(res.status).toBe(404);
    expect(json).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
