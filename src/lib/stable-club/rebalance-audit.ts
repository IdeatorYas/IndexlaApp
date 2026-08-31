import type { Hex } from "viem";
import type { RebalanceValidationCode } from "@/lib/stable-club/rebalance-validation";
import type { BuiltRebalanceProposal } from "@/lib/stable-club/openserv";

export type RebalanceAuditPhase =
  | "opt-in-changed"
  | "proposal-built"
  | "validation"
  | "tx-submitted"
  | "tx-confirmed"
  | "failed";

export type RebalanceAuditEvent = {
  id: string;
  timestamp: number;
  phase: RebalanceAuditPhase;
  user: `0x${string}`;
  chainId: number;
  poolId: string;
  positionTokenId: string;
  proposalId?: Hex;
  validationDecision: "approved" | "rejected";
  validationCode?: RebalanceValidationCode;
  validationReason?: string;
  txHash?: Hex;
  receiptStatus?: string;
  manual: boolean;
};

/** In-memory auditable rebalance event log (session-scoped in hook). */
export class RebalanceAuditStore {
  private events: RebalanceAuditEvent[] = [];

  append(event: Omit<RebalanceAuditEvent, "id" | "timestamp">): RebalanceAuditEvent {
    const row: RebalanceAuditEvent = {
      ...event,
      id: `${event.phase}-${this.events.length + 1}-${Date.now()}`,
      timestamp: Math.floor(Date.now() / 1000),
    };
    this.events.push(row);
    return row;
  }

  list(): readonly RebalanceAuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

export function rebalanceProposalIdFromBuilt(
  built: BuiltRebalanceProposal | null | undefined,
): Hex | undefined {
  return built?.proposalId;
}
