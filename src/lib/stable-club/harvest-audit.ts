import type { Hex } from "viem";
import type { OpenServProposal } from "@/lib/stable-club/openserv";
import type { HarvestValidationCode } from "@/lib/stable-club/harvest-validation";

export type HarvestAuditPhase =
  | "opt-in-changed"
  | "proposal-built"
  | "proposal-submitted"
  | "validation"
  | "tx-submitted"
  | "tx-confirmed"
  | "failed";

export type HarvestAuditEvent = {
  id: string;
  timestamp: number;
  phase: HarvestAuditPhase;
  user: `0x${string}`;
  chainId: number;
  poolId: string;
  positionTokenId: string;
  proposal?: OpenServProposal;
  validationDecision: "approved" | "rejected";
  validationCode?: HarvestValidationCode;
  validationReason?: string;
  txHash?: Hex;
  receiptStatus?: string;
  manual: boolean;
};

/** In-memory auditable harvest event log (persisted per session in hook). */
export class HarvestAuditStore {
  private events: HarvestAuditEvent[] = [];

  append(event: Omit<HarvestAuditEvent, "id" | "timestamp">): HarvestAuditEvent {
    const row: HarvestAuditEvent = {
      ...event,
      id: `${event.phase}-${this.events.length + 1}-${Date.now()}`,
      timestamp: Math.floor(Date.now() / 1000),
    };
    this.events.push(row);
    return row;
  }

  list(): readonly HarvestAuditEvent[] {
    return [...this.events];
  }

  latestForPosition(input: {
    user: `0x${string}`;
    chainId: number;
    poolId: string;
    positionTokenId: string;
  }): HarvestAuditEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      if (
        e.user.toLowerCase() === input.user.toLowerCase() &&
        e.chainId === input.chainId &&
        e.poolId === input.poolId &&
        e.positionTokenId === input.positionTokenId
      ) {
        return e;
      }
    }
    return undefined;
  }

  clear(): void {
    this.events = [];
  }
}
