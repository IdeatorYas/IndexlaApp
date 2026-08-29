const { expect } = require("chai");
const {
  validatePhase2aManifest,
  assertRejectsWrongGeneration,
  EXPECTED_ROUTE_IDS,
  BASE_PERMIT2,
} = require("../../scripts/stable-club/phase2a-manifest.cjs");
const { deployPhase2aLocalStack, toPhase2aDeploymentJson } = require("../../scripts/stable-club/deploy-phase2a-local.cjs");

describe("Phase 2b — deployment manifest validation", function () {
  it("rejects wrong factory/NPM/router generation mixing", function () {
    expect(assertRejectsWrongGeneration()).to.equal(true);
  });

  it("accepts Phase 2a local stack manifest (MockPermit2 allowed)", async function () {
    const stack = await deployPhase2aLocalStack();
    const json = toPhase2aDeploymentJson(stack);
    expect(json.routes.length).to.equal(4);
    expect(json.adapters.length).to.equal(5);
    expect(json.permit2).to.not.equal(BASE_PERMIT2); // MockPermit2
    expect(() => validatePhase2aManifest(json, { localMocksOk: true })).to.not.throw();
    expect(() => validatePhase2aManifest(json, { localMocksOk: false })).to.throw(/permit2 must be canonical/);
  });

  it("requires all four expected route IDs", function () {
    const routes = Object.entries(EXPECTED_ROUTE_IDS)
      .slice(0, 3)
      .map(([name, routeId]) => ({ name, routeId, enabled: true }));
    expect(() =>
      validatePhase2aManifest(
        {
          strategyRegistry: "0x1",
          clExecutor: "0x2",
          swapRouter: "0x3",
          permit2: BASE_PERMIT2,
          oracleGuard: "0x4",
          mevGuard: "0x5",
          feeRouter: "0x6",
          permissionRegistry: "0x7",
          adapters: Array(5).fill({ adapter: "0x10", protocol: "uniswap-v3" }),
          routes,
        },
        { localMocksOk: false },
      ),
    ).to.throw(/expected 4 allowlisted/);
  });
});
