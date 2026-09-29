import { describe, expect, it } from "vitest";
import { solanaRpcFallbackUrl, solanaRpcUrl } from "@/lib/degen-solana/constants";
import { solanaRpcEndpoints } from "@/lib/degen-solana/rpc-upstream";

describe("degen solana rpc upstream", () => {
  it("exposes at least the primary Solana RPC endpoint", () => {
    const eps = solanaRpcEndpoints();
    expect(eps.length).toBeGreaterThanOrEqual(1);
    expect(eps[0]).toBe(solanaRpcUrl());
    const fb = solanaRpcFallbackUrl();
    if (fb && fb !== solanaRpcUrl()) {
      expect(eps).toContain(fb);
      expect(eps.length).toBe(2);
    }
  });
});
