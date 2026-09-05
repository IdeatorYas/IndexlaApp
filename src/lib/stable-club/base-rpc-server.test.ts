import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveStableClubBaseUpstreamRpcUrls } from "@/lib/stable-club/base-rpc-server";

describe("base-rpc-server upstream resolution", () => {
  const prevBase = process.env.BASE_RPC_URL;
  const prevQn = process.env.QUICKNODE_RPC_URL;
  const prevFb = process.env.BASE_RPC_FALLBACK_URL;

  beforeEach(() => {
    delete process.env.BASE_RPC_URL;
    delete process.env.QUICKNODE_RPC_URL;
    delete process.env.BASE_RPC_FALLBACK_URL;
  });

  afterEach(() => {
    if (prevBase === undefined) delete process.env.BASE_RPC_URL;
    else process.env.BASE_RPC_URL = prevBase;
    if (prevQn === undefined) delete process.env.QUICKNODE_RPC_URL;
    else process.env.QUICKNODE_RPC_URL = prevQn;
    if (prevFb === undefined) delete process.env.BASE_RPC_FALLBACK_URL;
    else process.env.BASE_RPC_FALLBACK_URL = prevFb;
  });

  it("orders BASE_RPC_URL then QUICKNODE then fallback and skips mainnet.base.org", () => {
    process.env.BASE_RPC_URL = "https://primary.example/rpc";
    process.env.QUICKNODE_RPC_URL = "https://mainnet.base.org";
    process.env.BASE_RPC_FALLBACK_URL = "https://fallback.example/rpc";
    expect(resolveStableClubBaseUpstreamRpcUrls()).toEqual([
      "https://primary.example/rpc",
      "https://fallback.example/rpc",
    ]);
  });

  it("returns empty when nothing configured", () => {
    expect(resolveStableClubBaseUpstreamRpcUrls()).toEqual([]);
  });
});
