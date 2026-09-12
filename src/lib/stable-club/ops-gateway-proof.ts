/**
 * Phase 3 proof checklist for ≤3 wallet prompts via Ops Gateway.
 * Live ≤3 must NOT be claimed until every blocker below is cleared.
 * opsGatewayWithdraw may be pinned for Safe-owned NPM exit; opsGatewayDeposit stays false
 * until a matched deposit stack is Safe-wired.
 */
export const OPS_GATEWAY_LIVE_BLOCKERS = [
  "Universal ≤3 unresolved: cold sequential withdraw is 4 prompts (3× setApprovalForAll + exit) without EIP-5792.",
  "opsGatewayDeposit must stay false — live deposits use clExecutor; gateway deposit needs matched registry+adapters.",
  "Kimi independent review unavailable (no Moonshot/Kimi in allowed models).",
  "Live signed E2E (deposit → 5 LPs → partial/full gateway withdraw → USDC) still required after pin.",
  "Pending Timelock unpause of old gateway 0xAa0a… must stay cancelled.",
] as const;

export const OPS_GATEWAY_FORK_PROOF_CHECKLIST = [
  "Fresh first deposit + depositAgain + partial/full exit USDC-only + residual revert — StableClubOpsGatewayForkE2E.test.cjs.",
  "Deposit-matched stack (registry+executor+adapters+gateway) — StableClubOpsGatewayDepositStackFork.test.cjs on Base fork.",
  "Executor deployedBytecode ≤24576 with linked libs.",
  "Fallback must not re-exit after any gateway broadcast; legacy recover + completedPositionKeys preserved.",
  "Deploy gate: split flags in trusted manifest; Basescan verify before enabling.",
] as const;

/** True only when product may claim ≤3 on sequential EOAs for warm paths (not cold migration). */
export function mayClaimWarmPathLe3(params: {
  opsGatewayLive: boolean;
  forkProofPassed: boolean;
  basescanVerified: boolean;
}): boolean {
  return params.opsGatewayLive && params.forkProofPassed && params.basescanVerified;
}
