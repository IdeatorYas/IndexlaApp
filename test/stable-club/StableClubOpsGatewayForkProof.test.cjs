/**
 * Fork E2E scaffold for Ops Gateway prompt counts + USDC-only exit.
 * Skipped unless RUN_OPS_GATEWAY_FORK=1 and BASE_RPC_URL are set — gateway is not live on Base yet.
 */
const { expect } = require("chai");

describe("StableClubOpsGateway fork proof (gated)", function () {
  it("documents that live ≤3 is blocked until Safe deploy", function () {
    if (process.env.RUN_OPS_GATEWAY_FORK !== "1") {
      this.skip();
    }
    // When enabled post-deploy: pin FORK_CHAIN_ID=8453, deploy/attach gateway, assert
    // depositFirst prompt inventory and exitPercentToUsdc residual invariant on a fork.
    expect(process.env.BASE_RPC_URL, "BASE_RPC_URL required for fork proof").to.be.ok;
  });
});
