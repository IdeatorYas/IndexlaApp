import { describe, expect, it } from "vitest";
import {
  OWNER_NPM_MULTICALL_GAS_FLOOR,
  OWNER_NPM_MULTICALL_OOG_USER_MESSAGE,
  applyOwnerNpmMulticallGasBuffer,
} from "@/lib/stable-club/owner-npm-multicall-gas";

describe("owner-npm-multicall-gas", () => {
  it("buffers the live OOG estimate (565311) above the failed gas limit", () => {
    const estimate = BigInt(565_311);
    const buffered = applyOwnerNpmMulticallGasBuffer(estimate);
    expect(buffered).toBeGreaterThan(estimate);
    expect(buffered).toBeGreaterThanOrEqual(OWNER_NPM_MULTICALL_GAS_FLOOR);
    // +40% of 565311 = 791435 → floor 700k still applies via max
    expect(buffered).toBe(BigInt(791_435));
    expect(OWNER_NPM_MULTICALL_OOG_USER_MESSAGE).toMatch(/Owner NPM multicall/i);
    expect(OWNER_NPM_MULTICALL_OOG_USER_MESSAGE).toMatch(/Resume incomplete withdraw/i);
    expect(OWNER_NPM_MULTICALL_OOG_USER_MESSAGE).not.toMatch(/Deposit/i);
  });

  it("floors the live 0xd73deb70 estimate (429802) to ≥700k", () => {
    // +40% of 429802 = 601722 → floor 700_000 applies
    const buffered = applyOwnerNpmMulticallGasBuffer(BigInt(429_802));
    expect(buffered).toBe(OWNER_NPM_MULTICALL_GAS_FLOOR);
  });
});
