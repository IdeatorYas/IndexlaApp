import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * Guards against UX commits silently reverting the USDC recover path
 * (regression: 191361a dropped head-read + sweep + force-gas wiring).
 */
describe("withdraw residue→USDC recover wiring", () => {
  const src = readFileSync(
    resolve(__dirname, "../../components/stable-club/useFivePoolPositions.ts"),
    "utf8",
  );

  it("uses HTTP-head residue reads, not pinned historical floors", () => {
    expect(src).toContain("readResidueAtHead");
    expect(src).not.toMatch(/await readResidueAt\(readBlockFloor\)/);
    expect(src).toContain("Plan only withdrawal delta at HTTP head");
  });

  it("wires Uni multicall sweep + force recover gas provider", () => {
    expect(src).toContain("sweepAllResidueToUsdcOnce(");
    expect(src).toContain("wrapProviderForceRecoverGas(wallet.provider)");
    expect(src).toContain("recoverWalletClient");
  });

  it("fail-closes on leftover residue and scopes sweep OOG", () => {
    expect(src).toContain("Non-USDC withdrawal residue remains");
    expect(src).toContain("failed_incomplete");
    expect(src).toContain("RECOVER_SWEEP_OOG_USER_MESSAGE");
    expect(src).toContain("resumeRecoverOnly");
  });

  it("forces NPM multicall gas at the wallet EIP-1193 boundary", () => {
    expect(src).toContain("wrapProviderForceOwnerNpmMulticallGas(wallet.provider)");
    expect(src).toContain("OWNER_NPM_MULTICALL_GAS_FLOOR");
  });

  it("gates recover on HTTP enumeration and per-tokenId completion", () => {
    expect(src).toContain("listOpenOwnerNpmPositions");
    expect(src).toContain("completedPositionKeys");
    expect(src).toContain("auto-retry");
  });

  it("never aborts before receipt on wallet gas rewrite", () => {
    expect(src).toContain("waiting for receipt");
    expect(src).not.toContain(
      "submitted gas ${submitted.gas.toString()} < floor",
    );
  });
});
