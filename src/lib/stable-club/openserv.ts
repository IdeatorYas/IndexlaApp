/**
 * OpenServ Step 2 — untrusted monitoring proposals (no keys, no arbitrary calldata).
 */
export type OpenServProposedAction =
  | "harvest"
  | "compound"
  | "rebalance"
  | "pause-automation"
  | "notify-only";

export type OpenServProposal = {
  user: `0x${string}`;
  permissionId: `0x${string}`;
  poolId: `0x${string}`;
  positionTokenId: string;
  action: OpenServProposedAction;
  reasonCode: string;
  observedValues: Record<string, string | number | boolean>;
  timestamp: number;
  idempotencyKey: `0x${string}`;
};

export type OpenServCircuitState = {
  broken: boolean;
  proposalsThisMinute: number;
  maxProposalsPerMinute: number;
  failedStreak: number;
  autoBreakAfterFailures: number;
};

const ACTION_TO_ONCHAIN: Record<OpenServProposedAction, number> = {
  harvest: 0,
  compound: 1,
  rebalance: 2,
  "pause-automation": 3,
  "notify-only": 4,
};

export function openServActionCode(action: OpenServProposedAction): number {
  return ACTION_TO_ONCHAIN[action];
}

/** Local in-memory OpenServ monitor used for Step 2 UI / tests. */
export class OpenServMonitor {
  private proposals: OpenServProposal[] = [];
  private idempotency = new Set<string>();
  private windowStart = 0;
  private windowCount = 0;
  private failedStreak = 0;
  circuitBroken = false;

  constructor(
    private readonly maxPerMinute = 60,
    private readonly autoBreakAfterFailures = 10,
  ) {}

  getState(): OpenServCircuitState {
    return {
      broken: this.circuitBroken,
      proposalsThisMinute: this.windowCount,
      maxProposalsPerMinute: this.maxPerMinute,
      failedStreak: this.failedStreak,
      autoBreakAfterFailures: this.autoBreakAfterFailures,
    };
  }

  listProposals(): OpenServProposal[] {
    return [...this.proposals];
  }

  submit(proposal: OpenServProposal): { ok: true } | { ok: false; error: string } {
    if (this.circuitBroken) return { ok: false, error: "circuit-open" };
    if (this.idempotency.has(proposal.idempotencyKey)) {
      return { ok: false, error: "duplicate-idempotency" };
    }

    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    if (this.windowCount + 1 > this.maxPerMinute) {
      return { ok: false, error: "rate-limited" };
    }

    // Forbidden: arbitrary calldata fields
    if ("calldata" in proposal || "to" in proposal) {
      return { ok: false, error: "arbitrary-calldata-forbidden" };
    }

    this.idempotency.add(proposal.idempotencyKey);
    this.windowCount += 1;
    this.proposals.push(proposal);
    return { ok: true };
  }

  markFailed(): void {
    this.failedStreak += 1;
    if (this.failedStreak >= this.autoBreakAfterFailures) {
      this.circuitBroken = true;
    }
  }

  markSuccess(): void {
    this.failedStreak = 0;
  }

  tripCircuit(): void {
    this.circuitBroken = true;
  }

  resetCircuit(): void {
    this.circuitBroken = false;
    this.failedStreak = 0;
  }
}

export function buildHarvestProposal(input: {
  user: `0x${string}`;
  permissionId: `0x${string}`;
  poolId: `0x${string}`;
  positionTokenId: string;
  feesUsd: number;
  gasUsd: number;
  idempotencyKey: `0x${string}`;
}): OpenServProposal | null {
  // Gas economics: do not propose harvest below safety margin.
  if (input.feesUsd <= input.gasUsd) return null;
  return {
    user: input.user,
    permissionId: input.permissionId,
    poolId: input.poolId,
    positionTokenId: input.positionTokenId,
    action: "harvest",
    reasonCode: "fees-exceed-gas",
    observedValues: {
      feesUsd: input.feesUsd,
      gasUsd: input.gasUsd,
      netUsd: input.feesUsd - input.gasUsd,
    },
    timestamp: Math.floor(Date.now() / 1000),
    idempotencyKey: input.idempotencyKey,
  };
}
