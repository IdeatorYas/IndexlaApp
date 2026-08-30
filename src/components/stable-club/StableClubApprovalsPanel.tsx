"use client";

import { useMemo, useState } from "react";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { BASE_CHAIN_ID, BASE_PERMIT2 } from "@/lib/stable-club/verified-base-addresses";
import { LOCAL_HARDHAT_CHAIN_ID } from "@/lib/stable-club/chain-isolation";
import {
  PERMIT2_UNLIMITED_AMOUNT,
  assertDualSpenderAllowancesReady,
  buildDualSpenderDepositApprovalPlan,
  buildPermit2ZeroAllowanceRevokeTx,
  describePermit2Allowance,
  isForbiddenUnlimitedApproval,
  splitDepositSpenderAllowances,
} from "@/lib/stable-club/permit2";
import {
  formatPermissionUserLabel,
  resolveAccountMode,
  type StableClubAccountMode,
} from "@/lib/stable-club/safe-account";
import { isForbiddenApprovalMethod } from "@/lib/stable-club/nft-approval";
import type { DeploymentEnvironment } from "@/lib/stable-club/production-guards";
import type { Address } from "viem";

const DEFAULT_EXPIRY_HOURS = 24;

/**
 * Safe + Permit2 approvals UX — dual bounded spenders (FeeRouter + Executor).
 * Blocks unlimited approvals; keeps NFT per-token path separate.
 */
export function StableClubApprovalsPanel({
  environment = "local",
  feeRouterAddress,
  executorAddress,
  preferSafe = true,
  connectedIsContract = false,
  chainId = environment === "mainnet" ? BASE_CHAIN_ID : LOCAL_HARDHAT_CHAIN_ID,
}: {
  environment?: DeploymentEnvironment;
  feeRouterAddress?: Address | null;
  executorAddress?: Address | null;
  preferSafe?: boolean;
  connectedIsContract?: boolean;
  chainId?: number;
}) {
  const wallet = useStableClubWallet();
  const [depositAmount, setDepositAmount] = useState("1000000");
  const [swapAmount, setSwapAmount] = useState("0");
  const [expiryHours, setExpiryHours] = useState(String(DEFAULT_EXPIRY_HOURS));
  const [token, setToken] = useState<Address>("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Simulated live allowances for readiness gate (dev preview). */
  const [feeRouterLiveAmt, setFeeRouterLiveAmt] = useState("");
  const [executorLiveAmt, setExecutorLiveAmt] = useState("");
  const [liveExpiry, setLiveExpiry] = useState("");

  const mode: StableClubAccountMode = useMemo(
    () =>
      resolveAccountMode({
        environment,
        preferSafe,
        connectedAddressIsContract: connectedIsContract,
      }),
    [environment, preferSafe, connectedIsContract],
  );

  const feeRouter = feeRouterAddress ?? null;
  const executor = executorAddress ?? null;
  const nowSec = Math.floor(Date.now() / 1000);

  function buildFlow() {
    setError(null);
    setPreview(null);
    try {
      if (!wallet.address) throw new Error("Connect wallet first");
      if (environment === "mainnet" && mode !== "safe") {
        throw new Error("Mainnet requires Safe as perm.user");
      }
      if (!feeRouter) throw new Error("FeeRouter address not configured");
      if (!executor) throw new Error("Executor address not configured");
      const deposit = BigInt(depositAmount);
      const swap = BigInt(swapAmount);
      if (isForbiddenUnlimitedApproval(deposit) || deposit >= PERMIT2_UNLIMITED_AMOUNT) {
        throw new Error("Unlimited approvals are blocked");
      }
      if (isForbiddenApprovalMethod("setApprovalForAll")) {
        // keep explicit gate for NFT path documentation
      }
      const hours = Number(expiryHours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
        throw new Error("Expiry must be between 1 hour and 30 days");
      }
      const expiration = nowSec + Math.floor(hours * 3600);
      const plan = buildDualSpenderDepositApprovalPlan({
        chainId,
        token,
        feeRouter,
        executor,
        depositAmount: deposit,
        swapAmount: swap,
        expiration,
        nowSec,
      });
      const feeStatus = describePermit2Allowance({
        amount: plan.split.feeRouterAmount,
        expiration,
        nowSec,
      });
      const execStatus = describePermit2Allowance({
        amount: plan.split.executorAmount,
        expiration,
        nowSec,
      });
      setPreview(
        [
          `Account mode: ${formatPermissionUserLabel(mode, wallet.address as Address)}`,
          `perm.user: ${wallet.address}`,
          `Canonical Permit2: ${BASE_PERMIT2.address}`,
          `--- Dual spenders (amounts not duplicated) ---`,
          `1) ERC20.approve(Permit2, ${plan.split.erc20ToPermit2Amount})`,
          plan.feeRouterPermit2Tx
            ? `2a) Permit2.approve → FeeRouter ${feeRouter} amount=${plan.split.feeRouterAmount} exp=${expiration} [${feeStatus.label}]`
            : `2a) FeeRouter Permit2: skipped (swapAmount=0)`,
          plan.executorPermit2Tx
            ? `2b) Permit2.approve → Executor ${executor} amount=${plan.split.executorAmount} exp=${expiration} [${execStatus.label}]`
            : `2b) Executor Permit2: skipped (no remaining deposit)`,
          `Gate: both spenders required when their required amount > 0 before swap/deposit`,
          `NFT: use per-token approve(adapter, tokenId) only — never setApprovalForAll`,
          ...plan.labels,
        ].join("\n"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function buildRevoke() {
    setError(null);
    setPreview(null);
    try {
      if (!feeRouter || !executor) throw new Error("FeeRouter and executor required to revoke");
      const feeTx = buildPermit2ZeroAllowanceRevokeTx({
        chainId,
        token,
        spender: feeRouter,
        nowSec,
      });
      const execTx = buildPermit2ZeroAllowanceRevokeTx({
        chainId,
        token,
        spender: executor,
        nowSec,
      });
      setPreview(
        [
          `Revoke FeeRouter Permit2: approve(${token}, ${feeRouter}, 0, ${feeTx.args[3]})`,
          `Revoke Executor Permit2: approve(${token}, ${executor}, 0, ${execTx.args[3]})`,
          describePermit2Allowance({
            amount: BigInt(0),
            expiration: Number(feeTx.args[3]),
            nowSec,
          }).label,
        ].join("\n"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function checkReadiness() {
    setError(null);
    setPreview(null);
    try {
      if (!feeRouter || !executor) throw new Error("Both spenders required");
      const deposit = BigInt(depositAmount);
      const swap = BigInt(swapAmount);
      const split = splitDepositSpenderAllowances({ depositAmount: deposit, swapAmount: swap });
      const exp = Number(liveExpiry || String(nowSec + 3600));
      assertDualSpenderAllowancesReady({
        nowSec,
        expectedExecutor: executor,
        allowances: [
          {
            role: "feeRouter",
            spender: feeRouter,
            required: split.feeRouterAmount,
            amount: BigInt(feeRouterLiveAmt || "0"),
            expiration: exp,
          },
          {
            role: "executor",
            spender: executor,
            required: split.executorAmount,
            amount: BigInt(executorLiveAmt || "0"),
            expiration: exp,
          },
        ],
      });
      setPreview("Dual-spender Permit2 readiness: PASS — both required allowances present and unexpired");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
      <h2 className="text-sm font-bold text-app-ink">Safe + Permit2 approvals</h2>
      <p className="mt-1 text-xs text-app-muted">
        Dual bounded spenders: FeeRouter (swap gross) + Executor (deposit − swap). Unlimited blocked.
        EOA legacy only on local/testnet.
      </p>

      <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-app-dim">Environment</dt>
          <dd className="mt-0.5 text-app-ink">{environment}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Account mode</dt>
          <dd className="mt-0.5 text-app-ink">{mode}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold text-app-dim">Canonical Permit2</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">{BASE_PERMIT2.address}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">FeeRouter spender</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">{feeRouter ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Executor spender</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">{executor ?? "—"}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs" htmlFor="sc-permit2-deposit">
          <span className="font-semibold text-app-dim">Deposit amount (raw)</span>
          <input
            id="sc-permit2-deposit"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label className="block text-xs" htmlFor="sc-permit2-swap">
          <span className="font-semibold text-app-dim">Swap amount (raw, FeeRouter only)</span>
          <input
            id="sc-permit2-swap"
            value={swapAmount}
            onChange={(e) => setSwapAmount(e.target.value)}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label className="block text-xs" htmlFor="sc-permit2-expiry">
          <span className="font-semibold text-app-dim">Expiry (hours)</span>
          <input
            id="sc-permit2-expiry"
            value={expiryHours}
            onChange={(e) => setExpiryHours(e.target.value)}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label className="block text-xs" htmlFor="sc-permit2-token">
          <span className="font-semibold text-app-dim">ERC20 token</span>
          <input
            id="sc-permit2-token"
            value={token}
            onChange={(e) => setToken(e.target.value as Address)}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-xs" htmlFor="sc-live-fee">
          <span className="font-semibold text-app-dim">Live FeeRouter allowance</span>
          <input
            id="sc-live-fee"
            value={feeRouterLiveAmt}
            onChange={(e) => setFeeRouterLiveAmt(e.target.value)}
            placeholder="required for gate"
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label className="block text-xs" htmlFor="sc-live-exec">
          <span className="font-semibold text-app-dim">Live Executor allowance</span>
          <input
            id="sc-live-exec"
            value={executorLiveAmt}
            onChange={(e) => setExecutorLiveAmt(e.target.value)}
            placeholder="required for gate"
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label className="block text-xs" htmlFor="sc-live-exp">
          <span className="font-semibold text-app-dim">Live expiration (unix)</span>
          <input
            id="sc-live-exp"
            value={liveExpiry}
            onChange={(e) => setLiveExpiry(e.target.value)}
            placeholder={String(nowSec + 3600)}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={buildFlow}
          className="app-btn-primary h-9 px-3 text-xs font-bold"
        >
          Preview dual-spender Permit2 flow
        </button>
        <button
          type="button"
          onClick={checkReadiness}
          className="app-btn-secondary h-9 px-3 text-xs font-bold"
        >
          Check both spenders ready
        </button>
        <button
          type="button"
          onClick={buildRevoke}
          className="app-btn-secondary h-9 px-3 text-xs font-bold"
        >
          Preview revoke both spenders
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {preview ? (
        <pre className="mt-3 overflow-x-auto rounded-md border border-app-line bg-app-bg p-3 text-[11px] leading-relaxed text-app-ink whitespace-pre-wrap">
          {preview}
        </pre>
      ) : null}
    </section>
  );
}
