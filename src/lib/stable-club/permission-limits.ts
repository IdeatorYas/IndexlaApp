/**
 * SC-07 permission limit inventory — authoritative enforcement map for Stable Club.
 * Metadata-only fields must never be described as active security caps in UI or ops copy.
 */

export type PermissionLimitEnforcement =
  | "on-chain-enforced"
  | "metadata-only"
  | "identity"
  | "lifecycle";

export type PermissionLimitField = {
  field: string;
  struct: string;
  enforcement: PermissionLimitEnforcement;
  authoritativePath: string;
  notes?: string;
};

/** PermissionRegistry.Permission — all numeric/action limits enforced via validateExecution. */
export const PERMISSION_REGISTRY_LIMIT_FIELDS: PermissionLimitField[] = [
  {
    field: "allowedActions",
    struct: "PermissionRegistry.Permission",
    enforcement: "on-chain-enforced",
    authoritativePath: "PermissionRegistry.validateExecution → isActionAllowed",
  },
  {
    field: "maxAmountPerTx",
    struct: "PermissionRegistry.Permission",
    enforcement: "on-chain-enforced",
    authoritativePath: "PermissionRegistry.validateExecution",
    notes: "Enforced when amount>0 only. Harvest, exit and emergency pass amount=0 — not a monetary cap on those paths.",
  },
  {
    field: "maxAmountPerDay",
    struct: "PermissionRegistry.Permission",
    enforcement: "on-chain-enforced",
    authoritativePath: "PermissionRegistry.validateExecution",
    notes: "Enforced when amount>0 only. Harvest, exit and emergency pass amount=0 — not a monetary cap on those paths.",
  },
  {
    field: "maxSlippageBps",
    struct: "PermissionRegistry.Permission",
    enforcement: "on-chain-enforced",
    authoritativePath: "PermissionRegistry.validateExecution",
  },
  {
    field: "minTimeBetweenExecutions",
    struct: "PermissionRegistry.Permission",
    enforcement: "on-chain-enforced",
    authoritativePath: "PermissionRegistry.validateExecution",
  },
  {
    field: "maxExecutionsPerDay",
    struct: "PermissionRegistry.Permission",
    enforcement: "on-chain-enforced",
    authoritativePath: "PermissionRegistry.validateExecution",
  },
  {
    field: "expiresAt",
    struct: "PermissionRegistry.Permission",
    enforcement: "on-chain-enforced",
    authoritativePath: "PermissionRegistry._activePermission",
    notes: "Not checked on validateEmergencyExecution.",
  },
  {
    field: "user",
    struct: "PermissionRegistry.Permission",
    enforcement: "identity",
    authoritativePath: "PermissionRegistry._activePermission",
  },
  {
    field: "chainId",
    struct: "PermissionRegistry.Permission",
    enforcement: "identity",
    authoritativePath: "PermissionRegistry._activePermission",
  },
  {
    field: "poolId",
    struct: "PermissionRegistry.Permission",
    enforcement: "identity",
    authoritativePath: "executor pool/adapter binding",
  },
  {
    field: "tokenA",
    struct: "PermissionRegistry.Permission",
    enforcement: "identity",
    authoritativePath: "executor token binding",
  },
  {
    field: "tokenB",
    struct: "PermissionRegistry.Permission",
    enforcement: "identity",
    authoritativePath: "executor token binding",
  },
  {
    field: "revoked",
    struct: "PermissionRegistry.Permission",
    enforcement: "lifecycle",
    authoritativePath: "PermissionRegistry._activePermission",
  },
  {
    field: "paused",
    struct: "PermissionRegistry.Permission",
    enforcement: "lifecycle",
    authoritativePath: "PermissionRegistry._activePermission",
  },
];

/** StrategyPermissionRegistry.StrategyPermission */
export const STRATEGY_PERMISSION_LIMIT_FIELDS: PermissionLimitField[] = [
  {
    field: "allowedActions",
    struct: "StrategyPermissionRegistry.StrategyPermission",
    enforcement: "metadata-only",
    authoritativePath: "none — SC-07 metadata only",
    notes: "Leg PermissionRegistry.allowedActions enforces action bits per leg.",
  },
  {
    field: "maxTotalPerTx",
    struct: "StrategyPermissionRegistry.StrategyPermission",
    enforcement: "on-chain-enforced",
    authoritativePath: "StrategyPermissionRegistry.validateAndConsumeStrategyDepositIntent / validateStrategyDeposit",
  },
  {
    field: "maxTotalPerDay",
    struct: "StrategyPermissionRegistry.StrategyPermission",
    enforcement: "on-chain-enforced",
    authoritativePath: "StrategyPermissionRegistry.validateStrategyDeposit",
  },
  {
    field: "maxSlippageBps",
    struct: "StrategyPermissionRegistry.StrategyPermission",
    enforcement: "on-chain-enforced",
    authoritativePath: "StrategyPermissionRegistry.validateStrategyLegDeposit / validateStrategyLegExit",
  },
  {
    field: "minTimeBetweenExecutions",
    struct: "StrategyPermissionRegistry.StrategyPermission",
    enforcement: "on-chain-enforced",
    authoritativePath: "StrategyPermissionRegistry.validateStrategyDeposit",
  },
  {
    field: "maxExecutionsPerDay",
    struct: "StrategyPermissionRegistry.StrategyPermission",
    enforcement: "on-chain-enforced",
    authoritativePath: "StrategyPermissionRegistry.validateStrategyDeposit",
  },
  {
    field: "expiresAt",
    struct: "StrategyPermissionRegistry.StrategyPermission",
    enforcement: "on-chain-enforced",
    authoritativePath: "StrategyPermissionRegistry._activeStrategy",
  },
];

/** StrategyPermissionRegistry.PoolLegBinding */
export const POOL_LEG_BINDING_LIMIT_FIELDS: PermissionLimitField[] = [
  {
    field: "maxLegPerTx",
    struct: "StrategyPermissionRegistry.PoolLegBinding",
    enforcement: "on-chain-enforced",
    authoritativePath: "StrategyPermissionRegistry.validateStrategyLegDeposit",
  },
  {
    field: "maxLegPerDay",
    struct: "StrategyPermissionRegistry.PoolLegBinding",
    enforcement: "metadata-only",
    authoritativePath: "none — SC-07 metadata only",
    notes: "Leg PermissionRegistry.maxAmountPerDay enforces daily caps on execution.",
  },
];

export const SC07_METADATA_ONLY_FIELDS = [
  ...STRATEGY_PERMISSION_LIMIT_FIELDS,
  ...POOL_LEG_BINDING_LIMIT_FIELDS,
].filter((f) => f.enforcement === "metadata-only");

export function isMetadataOnlyLimitField(struct: string, field: string): boolean {
  return SC07_METADATA_ONLY_FIELDS.some((f) => f.struct === struct && f.field === field);
}

export function assertNoMetadataOnlyLimitPresentedAsEnforced(label: string): void {
  const normalized = label.toLowerCase();
  for (const meta of SC07_METADATA_ONLY_FIELDS) {
    if (normalized.includes("strategy") && meta.field === "allowedActions" && normalized.includes("strategy action")) {
      throw new Error(`UI copy must not present strategy allowedActions as enforced: ${label}`);
    }
    if (meta.field === "maxLegPerDay" && normalized.includes("leg") && normalized.includes("daily")) {
      throw new Error(`UI copy must not present maxLegPerDay as enforced: ${label}`);
    }
  }
}

/** Authoritative operation → validation mapping (on-chain call sites). */
export type OperationPermissionPath = {
  operation: string;
  actionId: number;
  actionName: string;
  amountPassed: string;
  slippagePassed: string;
  registry: string;
  permissionRecord: string;
  enforced: {
    allowedAction: boolean;
    perTxAmount: boolean;
    dailyAmount: boolean;
    slippage: boolean;
    minInterval: boolean;
    executionsPerDay: boolean;
    expiry: boolean;
    identity: boolean;
  };
  notes?: string;
};

export const OPERATION_PERMISSION_PATHS: OperationPermissionPath[] = [
  {
    operation: "deposit",
    actionId: 0,
    actionName: "DepositAndAddLiquidity",
    amountPassed: "legAmount(grossUsdc, legIndex) — USDC 6dp",
    slippagePassed: "leg.slippageBps",
    registry: "StrategyPermissionRegistry + PermissionRegistry",
    permissionRecord: "strategyId + leg.legPermissionId",
    enforced: {
      allowedAction: true,
      perTxAmount: true,
      dailyAmount: true,
      slippage: true,
      minInterval: true,
      executionsPerDay: true,
      expiry: true,
      identity: true,
    },
    notes: "Strategy maxTotalPerTx/Day via validateStrategyDeposit; leg maxLegPerTx via validateStrategyLegDeposit.",
  },
  {
    operation: "exit",
    actionId: 3,
    actionName: "RemoveLiquidity | WithdrawAll (4)",
    amountPassed: "0 (exit path — no USDC notional at validation)",
    slippagePassed: "leg.slippageBps",
    registry: "StrategyPermissionRegistry + PermissionRegistry",
    permissionRecord: "strategyId + leg.legPermissionId",
    enforced: {
      allowedAction: true,
      perTxAmount: false,
      dailyAmount: false,
      slippage: true,
      minInterval: true,
      executionsPerDay: true,
      expiry: true,
      identity: true,
    },
    notes: "Leg PermissionRegistry tx/daily caps non-applicable when amount=0.",
  },
  {
    operation: "harvest",
    actionId: 8,
    actionName: "Harvest",
    amountPassed: "0 (no swap notional)",
    slippagePassed: "0 (non-applicable at validation)",
    registry: "PermissionRegistry",
    permissionRecord: "permissionId (legacy unscoped)",
    enforced: {
      allowedAction: true,
      perTxAmount: false,
      dailyAmount: false,
      slippage: false,
      minInterval: true,
      executionsPerDay: true,
      expiry: true,
      identity: true,
    },
    notes: "perTx/daily/slippage non-applicable: validateExecution receives amount=0 and slippage=0.",
  },
  {
    operation: "compound",
    actionId: 9,
    actionName: "Compound",
    amountPassed: "_compoundNotional(...) — USDC-normalized",
    slippagePassed: "slippageBps",
    registry: "PermissionRegistry",
    permissionRecord: "permissionId (scoped compound)",
    enforced: {
      allowedAction: true,
      perTxAmount: true,
      dailyAmount: true,
      slippage: true,
      minInterval: true,
      executionsPerDay: true,
      expiry: true,
      identity: true,
    },
  },
  {
    operation: "rebalance",
    actionId: 10,
    actionName: "Rebalance",
    amountPassed: "_livePositionValue(...) — permission.tokenA units",
    slippagePassed: "slippageBps",
    registry: "PermissionRegistry",
    permissionRecord: "permissionId (scoped rebalance)",
    enforced: {
      allowedAction: true,
      perTxAmount: true,
      dailyAmount: true,
      slippage: true,
      minInterval: true,
      executionsPerDay: true,
      expiry: true,
      identity: true,
    },
  },
  {
    operation: "emergency",
    actionId: 7,
    actionName: "EmergencyExit",
    amountPassed: "0 (validateEmergencyExecution — nonce only)",
    slippagePassed: "n/a (minOut enforced in executor)",
    registry: "PermissionRegistry",
    permissionRecord: "leg.legPermissionId or legacy permissionId",
    enforced: {
      allowedAction: false,
      perTxAmount: false,
      dailyAmount: false,
      slippage: false,
      minInterval: false,
      executionsPerDay: false,
      expiry: false,
      identity: true,
    },
    notes: "validateEmergencyExecution ignores revoked/paused/expiry; identity + nonce only. Amount/slippage/rate limits non-applicable.",
  },
];

/** Limit applicability for amount=0 / validation-bypass paths (not metadata-only registry fields). */
export const NON_APPLICABLE_LIMIT_OPERATIONS: Record<
  string,
  { perTxAmount: string; dailyAmount: string; slippage: string }
> = {
  harvest: {
    perTxAmount: "non-applicable — validateExecution amount=0",
    dailyAmount: "non-applicable — validateExecution amount=0",
    slippage: "non-applicable — validateExecution slippage=0",
  },
  exit: {
    perTxAmount: "non-applicable — validateExecution amount=0",
    dailyAmount: "non-applicable — validateExecution amount=0",
    slippage: "enforced — leg.slippageBps at validateExecution",
  },
  emergency: {
    perTxAmount: "non-applicable — validateEmergencyExecution has no amount",
    dailyAmount: "non-applicable — validateEmergencyExecution has no amount",
    slippage: "non-applicable — minOut enforced in executor, not registry slippage field",
  },
};

/** Production call sites that reach PermissionRegistry validation with amount=0. */
export const AMOUNT_ZERO_VALIDATION_PATHS = [
  "StableClubAutomationExecutor._executeHarvest → validateExecution(..., amount=0, slippage=0)",
  "StrategyPermissionRegistry.validateStrategyLegExit → validateExecution(..., amount=0)",
  "PermissionRegistry.validateEmergencyExecution (no amount parameter)",
] as const;
