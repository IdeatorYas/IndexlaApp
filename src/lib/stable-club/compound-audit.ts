import type { Hex } from "viem";
import type { CompoundValidationCode } from "@/lib/stable-club/compound-validation";
import type { BuiltCompoundProposal } from "@/lib/stable-club/openserv";

export type CompoundAuditPhase =
  | "opt-in-changed"
  | "proposal-built"
  | "validation"
  | "tx-submitted"
  | "tx-confirmed"
  | "failed";

export type CompoundAuditEvent = {
  id: string;
  timestamp: number;
  phase: CompoundAuditPhase;
  user: `0x${string}`;
  chainId: number;
  poolId: string;
  positionTokenId: string;
  proposalId?: Hex;
  validationDecision: "approved" | "rejected";
  validationCode?: CompoundValidationCode;
  validationReason?: string;
  txHash?: Hex;
  receiptStatus?: string;
  manual: boolean;
};

/** In-memory auditable compound event log (session-scoped in hook). */
export class CompoundAuditStore {
  private events: CompoundAuditEvent[] = [];

  append(event: Omit<CompoundAuditEvent, "id" | "timestamp">): CompoundAuditEvent {
    const row: CompoundAuditEvent = {
      ...event,
      id: `${event.phase}-${this.events.length + 1}-${Date.now()}`,
      timestamp: Math.floor(Date.now() / 1000),
    };
    this.events.push(row);
    return row;
  }

  list(): readonly CompoundAuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

export function compoundProposalIdFromBuilt(
  built: BuiltCompoundProposal | null | undefined,
): Hex | undefined {
  return built?.proposalId;
}
