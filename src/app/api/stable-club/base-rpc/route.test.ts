import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/stable-club/base-rpc/route";

describe("POST /api/stable-club/base-rpc", () => {
  const prevBase = process.env.BASE_RPC_URL;
  const prevQn = process.env.QUICKNODE_RPC_URL;
  const prevFb = process.env.BASE_RPC_FALLBACK_URL;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevBase === undefined) delete process.env.BASE_RPC_URL;
    else process.env.BASE_RPC_URL = prevBase;
    if (prevQn === undefined) delete process.env.QUICKNODE_RPC_URL;
    else process.env.QUICKNODE_RPC_URL = prevQn;
    if (prevFb === undefined) delete process.env.BASE_RPC_FALLBACK_URL;
    else process.env.BASE_RPC_FALLBACK_URL = prevFb;
  });

  it("rejects write methods", async () => {
    process.env.BASE_RPC_URL = "https://primary.example/rpc";
    const res = await POST(
      new Request("http://localhost/api/stable-club/base-rpc", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_sendRawTransaction",
          params: ["0x"],
        }),
      }),
    );
    expect(res.status).toBe(405);
  });

  it("forwards eth_call to configured upstream", async () => {
    process.env.BASE_RPC_URL = "https://primary.example/rpc";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(
      new Request("http://localhost/api/stable-club/base-rpc", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "eth_call",
          params: [{ to: "0x1", data: "0x" }, "latest"],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://primary.example/rpc",
      expect.objectContaining({ method: "POST" }),
    );
    const json = (await res.json()) as { result: string };
    expect(json.result).toBe("0x1");
  });

  it("returns 503 when no upstream is configured", async () => {
    delete process.env.BASE_RPC_URL;
    delete process.env.QUICKNODE_RPC_URL;
    delete process.env.BASE_RPC_FALLBACK_URL;
    const res = await POST(
      new Request("http://localhost/api/stable-club/base-rpc", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      }),
    );
    expect(res.status).toBe(503);
  });
});
