"use client";

import { useMemo, useState } from "react";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  BASE_PERMIT2,
} from "@/lib/stable-club/verified-base-addresses";
import {
  PERMIT2_UNLIMITED_AMOUNT,
  buildBoundedErc20ApproveToPermit2,
  buildBoundedPermit2ApproveTx,
  buildPermit2ZeroAllowanceRevokeTx,
  describePermit2Allowance,
  isForbiddenUnlimitedApproval,
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
 * Safe + Permit2 approvals UX (local/dev surface).
 * Blocks unlimited approvals; keeps NFT per-token path separate.
 */
export function StableClubApprovalsPanel({
  environment = "local",
  feeRouterAddress,
  preferSafe = true,
  connectedIsContract = false,
}: {
  environment?: DeploymentEnvironment;
  feeRouterAddress?: Address | null;
  preferSafe?: boolean;
  connectedIsContract?: boolean;
}) {
  const wallet = useStableClubWallet();
  const [amount, setAmount] = useState("1000000");
  const [expiryHours, setExpiryHours] = useState(String(DEFAULT_EXPIRY_HOURS));
  const [token, setToken] = useState<Address>("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mode: StableClubAccountMode = useMemo(
    () =>
      resolveAccountMode({
        environment,
        preferSafe,
        connectedAddressIsContract: connectedIsContract,
      }),
    [environment, preferSafe, connectedIsContract],
  );

  const spender = feeRouterAddress ?? null;
  const nowSec = Math.floor(Date.now() / 1000);

  function buildFlow() {
    setError(null);
    setPreview(null);
    try {
      if (!wallet.address) throw new Error("Connect wallet first");
      if (environment === "mainnet" && mode !== "safe") {
        throw new Error("Mainnet requires Safe as perm.user");
      }
      if (!spender) throw new Error("FeeRouter / spender not configured");
      const amt = BigInt(amount);
      if (isForbiddenUnlimitedApproval(amt) || amt >= PERMIT2_UNLIMITED_AMOUNT) {
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
      const erc20Tx = buildBoundedErc20ApproveToPermit2({ token, amount: amt });
      const permit2Tx = buildBoundedPermit2ApproveTx({
        token,
        spender,
        amount: amt,
        expiration,
        nowSec,
      });
      const status = describePermit2Allowance({ amount: amt, expiration, nowSec });
      setPreview(
        [
          `Account mode: ${formatPermissionUserLabel(mode, wallet.address as Address)}`,
          `perm.user: ${wallet.address}`,
          `1) ERC20.approve(Permit2=${BASE_PERMIT2.address}, ${amt})`,
          `2) Permit2.approve(token, spender=${spender}, ${amt}, exp=${expiration})`,
          `Status preview: ${status.label}`,
          `NFT: use per-token approve(adapter, tokenId) only — never setApprovalForAll`,
        ].join("\n"),
      );
      void erc20Tx;
      void permit2Tx;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function buildRevoke() {
    setError(null);
    setPreview(null);
    try {
      if (!spender) throw new Error("Spender required to revoke");
      const tx = buildPermit2ZeroAllowanceRevokeTx({ token, spender, nowSec });
      setPreview(
        `Revoke Permit2 allowance\nPermit2.approve(${token}, ${spender}, 0, ${tx.args[3]})\n${describePermit2Allowance({ amount: BigInt(0), expiration: Number(tx.args[3]), nowSec }).label}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
      <h2 className="text-sm font-bold text-app-ink">Safe + Permit2 approvals</h2>
      <p className="mt-1 text-xs text-app-muted">
        Bounded, expiring ERC20 via Permit2 · per-token NFT approve elsewhere · unlimited blocked ·
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
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs" htmlFor="sc-permit2-amount">
          <span className="font-semibold text-app-dim">Bounded amount (raw)</span>
          <input
            id="sc-permit2-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
        <label className="block text-xs sm:col-span-2" htmlFor="sc-permit2-token">
          <span className="font-semibold text-app-dim">ERC20 token</span>
          <input
            id="sc-permit2-token"
            value={token}
            onChange={(e) => setToken(e.target.value as Address)}
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
          Preview bounded Permit2 flow
        </button>
        <button
          type="button"
          onClick={buildRevoke}
          className="app-btn-secondary h-9 px-3 text-xs font-bold"
        >
          Preview revoke / zero allowance
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
