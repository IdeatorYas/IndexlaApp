import type { AdapterStatus, ExecutionQuote, NetworkId } from "@/lib/domain/types";
import type { FeatureFlags } from "@/lib/feature-flags";

export interface AdapterResult<T> {
  status: AdapterStatus;
  data?: T;
  reason?: string;
}

export interface ExecutionAdapter {
  id: "cow" | "lifi" | "across";
  label: string;
  getStatus(flags: FeatureFlags): AdapterStatus;
  getQuote(
    flags: FeatureFlags,
    input: { source: NetworkId; destination: NetworkId; amountUsd: number },
  ): Promise<AdapterResult<ExecutionQuote>>;
}

function disabledResult<T>(reason: string): AdapterResult<T> {
  return { status: "disabled", reason };
}

export const cowAdapter: ExecutionAdapter = {
  id: "cow",
  label: "CoW Protocol",
  getStatus(flags) {
    return flags.COW_EXECUTION_ENABLED ? "unavailable" : "disabled";
  },
  async getQuote(flags) {
    if (!flags.COW_EXECUTION_ENABLED) {
      return disabledResult("CoW execution is not enabled in this environment.");
    }
    return {
      status: "unavailable",
      reason: "CoW adapter not integrated — Phase 5.",
    };
  },
};

export const lifiAdapter: ExecutionAdapter = {
  id: "lifi",
  label: "LI.FI",
  getStatus(flags) {
    return flags.CROSS_CHAIN_ENABLED ? "unavailable" : "disabled";
  },
  async getQuote(flags) {
    if (!flags.CROSS_CHAIN_ENABLED) {
      return disabledResult("Cross-chain routing is not enabled.");
    }
    return {
      status: "unavailable",
      reason: "LI.FI adapter not integrated — Phase 5.",
    };
  },
};

export const acrossAdapter: ExecutionAdapter = {
  id: "across",
  label: "Across",
  getStatus(flags) {
    return flags.CROSS_CHAIN_ENABLED ? "unavailable" : "disabled";
  },
  async getQuote(flags) {
    if (!flags.CROSS_CHAIN_ENABLED) {
      return disabledResult("Cross-chain routing is not enabled.");
    }
    return {
      status: "unavailable",
      reason: "Across adapter not integrated — Phase 5.",
    };
  },
};

export const EXECUTION_ADAPTERS: ExecutionAdapter[] = [
  cowAdapter,
  lifiAdapter,
  acrossAdapter,
];

export interface ContractAdapter {
  id: string;
  getStatus(): AdapterStatus;
}

export const permissionManagerAdapter: ContractAdapter = {
  id: "permission-manager",
  getStatus() {
    return "disabled";
  },
};

export const portfolioRegistryAdapter: ContractAdapter = {
  id: "portfolio-registry",
  getStatus() {
    return "disabled";
  },
};
