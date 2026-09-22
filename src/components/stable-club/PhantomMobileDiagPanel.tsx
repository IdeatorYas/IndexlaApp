"use client";

/**
 * TEMPORARY mobile diagnostic — binary Phantom provider tests.
 * Gate: ?phantomDiag=1  →  https://app.indexla.tech/app/stable-club?phantomDiag=1
 * Does not change withdraw/deposit production paths.
 */
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPublicClient, getAddress, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { usePhase2aBootstrap } from "@/components/stable-club/usePhase2aBootstrap";
import { createStableClubBaseReadTransport } from "@/lib/stable-club/base-rpc-transport";
import {
  classifyBinaryMatrix,
  diagProviderSnapshot,
  diagSelfTransfer,
  diagSendGatewayExit,
  diagUsdcApproveZero,
  prepareGatewayExitChunk1,
  resolveInjectedPhantomProvider,
  type DiagSendResult,
  type GatewayExitDiagPrepared,
} from "@/lib/stable-club/phantom-mobile-diag";

function ResultBlock({
  title,
  result,
  extra,
}: {
  title: string;
  result: DiagSendResult | null;
  extra?: string | null;
}) {
  if (!result) {
    return (
      <div className="rounded-lg border border-[var(--color-panel-border)] p-3 text-xs text-[var(--color-ink-muted)]">
        <div className="font-bold text-[var(--color-ink)]">{title}</div>
        <div className="mt-1">Not run</div>
      </div>
    );
  }
  return (
    <div
      className={`rounded-lg border p-3 text-xs ${
        result.ok
          ? "border-emerald-500/50 bg-emerald-500/10"
          : "border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10"
      }`}
    >
      <div className="font-bold text-[var(--color-ink)]">
        {title} — {result.ok ? "BROADCAST OK" : "FAIL"}
      </div>
      {result.hash ? (
        <a
          className="mt-1 block break-all text-emerald-400 underline"
          href={`https://basescan.org/tx/${result.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          {result.hash}
        </a>
      ) : null}
      <div className="mt-1 break-all text-[var(--color-ink-muted)]">
        kind={result.providerKind} · {result.elapsedMs}ms · code={String(result.code)}
      </div>
      <div className="mt-1 break-all text-[var(--color-ink-muted)]">{result.txSummary}</div>
      <div className="mt-1 break-all text-[var(--color-danger)]">{result.message}</div>
      {result.nested ? (
        <div className="mt-1 break-all text-[var(--color-ink-muted)]">{result.nested}</div>
      ) : null}
      {extra ? (
        <div className="mt-1 break-all text-[var(--color-ink-muted)]">{extra}</div>
      ) : null}
    </div>
  );
}

export function PhantomMobileDiagPanel() {
  const search = useSearchParams();
  const enabled = search.get("phantomDiag") === "1";
  const wallet = useStableClubWallet();
  const bootstrap = usePhase2aBootstrap();

  const [busy, setBusy] = useState<string | null>(null);
  const [appkitSnap, setAppkitSnap] = useState<string>("");
  const [injectedSnap, setInjectedSnap] = useState<string>("");
  const [prepared, setPrepared] = useState<GatewayExitDiagPrepared | null>(null);
  const [selfRes, setSelfRes] = useState<DiagSendResult | null>(null);
  const [simpleRes, setSimpleRes] = useState<(DiagSendResult & { httpCallOk?: boolean; httpCallErr?: string | null }) | null>(null);
  const [gwAppkit, setGwAppkit] = useState<DiagSendResult | null>(null);
  const [gwInjected, setGwInjected] = useState<DiagSendResult | null>(null);
  const [log, setLog] = useState<string>("");

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: base,
        transport: createStableClubBaseReadTransport(),
      }),
    [],
  );

  const injected = useMemo(() => resolveInjectedPhantomProvider(), []);

  const verdict = useMemo(
    () =>
      classifyBinaryMatrix({
        selfTransfer: selfRes,
        simpleContract: simpleRes,
        gatewayAppkit: gwAppkit,
        gatewayInjected: gwInjected,
        injectedAvailable: injected.provider != null,
      }),
    [selfRes, simpleRes, gwAppkit, gwInjected, injected.provider],
  );

  const append = useCallback((line: string) => {
    setLog((prev) => `${prev}${prev ? "\n" : ""}${line}`);
  }, []);

  const refreshSnaps = useCallback(async () => {
    const appkit = (await wallet.refreshProvider()) ?? wallet.provider;
    setAppkitSnap(
      `AppKit/WC connector=${wallet.connectorId}/${wallet.connectorName} · ${await diagProviderSnapshot(appkit)}`,
    );
    setInjectedSnap(
      `Injected ${injected.label} · ${await diagProviderSnapshot(injected.provider)}`,
    );
  }, [wallet, injected]);

  const run1 = useCallback(async () => {
    if (!wallet.address) return;
    setBusy("1");
    try {
      const p = (await wallet.refreshProvider()) ?? wallet.provider;
      if (!p) throw new Error("AppKit provider missing");
      await refreshSnaps();
      const r = await diagSelfTransfer({
        provider: p,
        kind: "appkit",
        account: wallet.address,
      });
      setSelfRes(r);
      append(`T1 self-transfer ok=${r.ok} hash=${r.hash ?? "-"} code=${r.code}`);
    } catch (e) {
      append(`T1 error ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [wallet, refreshSnaps, append]);

  const run2 = useCallback(async () => {
    if (!wallet.address || !bootstrap.deployments?.usdc || !bootstrap.deployments?.opsGateway) {
      append("T2 need deployments + address");
      return;
    }
    setBusy("2");
    try {
      const p = (await wallet.refreshProvider()) ?? wallet.provider;
      if (!p) throw new Error("AppKit provider missing");
      const r = await diagUsdcApproveZero({
        provider: p,
        kind: "appkit",
        account: wallet.address,
        usdc: getAddress(bootstrap.deployments.usdc),
        spender: getAddress(bootstrap.deployments.opsGateway),
        publicClient: publicClient as never,
      });
      setSimpleRes(r);
      append(
        `T2 approve0 ok=${r.ok} httpCall=${r.httpCallOk} hash=${r.hash ?? "-"} code=${r.code}`,
      );
    } catch (e) {
      append(`T2 error ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [wallet, bootstrap.deployments, publicClient, append]);

  const prepareExit = useCallback(async () => {
    if (!wallet.address || !bootstrap.deployments?.opsGateway) {
      append("Prepare need deployments + address");
      return;
    }
    setBusy("prep");
    try {
      const d = bootstrap.deployments;
      const prep = await prepareGatewayExitChunk1({
        publicClient: publicClient as never,
        account: wallet.address,
        gateway: getAddress(d.opsGateway as Address),
        cbbtc: getAddress(d.cbbtc),
        weth: getAddress(d.weth),
      });
      setPrepared(prep);
      append(
        `PREP tokenId=${prep.tokenId} npm=${prep.npm} gas=${prep.gas} dataLen=${prep.dataLen} httpCall=${prep.httpCallOk} estErr=${prep.estimateErr ?? "-"} callErr=${prep.httpCallErr ?? "-"}`,
      );
    } catch (e) {
      append(`PREP error ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [wallet.address, bootstrap.deployments, publicClient, append]);

  const run3 = useCallback(async () => {
    if (!wallet.address || !prepared) {
      append("T3 run Prepare first");
      return;
    }
    setBusy("3");
    try {
      const p = (await wallet.refreshProvider()) ?? wallet.provider;
      if (!p) throw new Error("AppKit provider missing");
      const r = await diagSendGatewayExit({
        provider: p,
        kind: "appkit",
        account: wallet.address,
        prepared,
        injectChainId: true,
      });
      setGwAppkit(r);
      append(`T3 gateway@AppKit ok=${r.ok} hash=${r.hash ?? "-"} code=${r.code}`);
    } catch (e) {
      append(`T3 error ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [wallet, prepared, append]);

  const run4 = useCallback(async () => {
    if (!wallet.address || !prepared) {
      append("T4 run Prepare first");
      return;
    }
    setBusy("4");
    try {
      const inj = resolveInjectedPhantomProvider();
      if (!inj.provider) {
        append("T4 SKIP — no injected Phantom (open inside Phantom browser or install)");
        setGwInjected({
          ok: false,
          hash: null,
          code: null,
          message: `No injected provider (${inj.label})`,
          nested: "",
          elapsedMs: 0,
          providerKind: "none",
          txSummary: "skipped",
        });
        return;
      }
      // Ensure accounts on injected
      try {
        await inj.provider.request({ method: "eth_requestAccounts" });
      } catch {
        /* may already be authorized */
      }
      const chainHex = (await inj.provider.request({
        method: "eth_chainId",
      })) as string;
      if (chainHex !== "0x2105") {
        try {
          await inj.provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x2105" }],
          });
        } catch (e) {
          append(
            `T4 switch Base warn: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      const r = await diagSendGatewayExit({
        provider: inj.provider,
        kind: inj.kind,
        account: wallet.address,
        prepared,
        injectChainId: true,
      });
      setGwInjected(r);
      append(
        `T4 gateway@${inj.label} ok=${r.ok} hash=${r.hash ?? "-"} code=${r.code}`,
      );
    } catch (e) {
      append(`T4 error ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [wallet.address, prepared, append]);

  if (!enabled) return null;

  return (
    <section
      className="md:hidden rounded-2xl border-2 border-amber-500/60 bg-[var(--color-panel)] p-4"
      data-testid="phantom-mobile-diag"
    >
      <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-amber-400">
        TEMP · Phantom Mobile binary diag
      </h2>
      <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
        Does not change Withdraw. Tests isolate session vs WC vs gateway sim.
        Tests 3–4 will close LP #1 and swap to USDC if Phantom confirms — only tap
        Confirm when ready.
      </p>

      <div className="mt-3 space-y-1 text-[11px] text-[var(--color-ink-muted)] break-all">
        <div>
          wallet={wallet.address ?? "—"} · chain={wallet.chainId ?? "—"} · status=
          {wallet.status}
        </div>
        <div>{appkitSnap || "AppKit snapshot: tap Refresh"}</div>
        <div>{injectedSnap || `Injected: ${injected.label}`}</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void refreshSnaps()}
          className="h-9 rounded-lg bg-[var(--color-panel-border)] px-3 text-[10px] font-bold uppercase"
        >
          Refresh providers
        </button>
        <button
          type="button"
          disabled={!!busy || !wallet.address}
          onClick={() => void run1()}
          className="h-9 rounded-lg bg-[var(--color-brand)] px-3 text-[10px] font-bold uppercase text-white"
        >
          1 · Self-transfer 1 wei
        </button>
        <button
          type="button"
          disabled={!!busy || !wallet.address}
          onClick={() => void run2()}
          className="h-9 rounded-lg bg-[var(--color-brand)] px-3 text-[10px] font-bold uppercase text-white"
        >
          2 · USDC approve(0)
        </button>
        <button
          type="button"
          disabled={!!busy || !wallet.address}
          onClick={() => void prepareExit()}
          className="h-9 rounded-lg bg-amber-600 px-3 text-[10px] font-bold uppercase text-white"
        >
          Prepare exit 1/5
        </button>
        <button
          type="button"
          disabled={!!busy || !prepared}
          onClick={() => void run3()}
          className="h-9 rounded-lg bg-[var(--color-danger)] px-3 text-[10px] font-bold uppercase text-white"
        >
          3 · Gateway @ AppKit/WC
        </button>
        <button
          type="button"
          disabled={!!busy || !prepared}
          onClick={() => void run4()}
          className="h-9 rounded-lg bg-[var(--color-danger)] px-3 text-[10px] font-bold uppercase text-white"
        >
          4 · Gateway @ injected Phantom
        </button>
      </div>

      {busy ? (
        <p className="mt-2 text-xs text-amber-300">Running test {busy}… confirm in Phantom if prompted.</p>
      ) : null}

      <div className="mt-3 space-y-2">
        <ResultBlock title="1 · Self-transfer" result={selfRes} />
        <ResultBlock
          title="2 · Simple contract (USDC approve 0)"
          result={simpleRes}
          extra={
            simpleRes
              ? `httpCallOk=${String(simpleRes.httpCallOk)} ${simpleRes.httpCallErr ?? ""}`
              : null
          }
        />
        {prepared ? (
          <div className="rounded-lg border border-amber-500/40 p-3 text-[11px] text-[var(--color-ink-muted)] break-all">
            Prepared exit: tokenId={prepared.tokenId} gas={prepared.gas.toString()}{" "}
            sel={prepared.data.slice(0, 10)} httpCall={String(prepared.httpCallOk)}
          </div>
        ) : null}
        <ResultBlock title="3 · Gateway exit via AppKit/WC" result={gwAppkit} />
        <ResultBlock title="4 · Gateway exit via injected Phantom" result={gwInjected} />
      </div>

      <div className="mt-3 rounded-lg border border-amber-400/50 bg-amber-400/10 p-3 text-xs font-semibold text-amber-100">
        {verdict}
      </div>

      {log ? (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 p-2 text-[10px] text-[var(--color-ink-muted)]">
          {log}
        </pre>
      ) : null}

      {(gwAppkit?.hash || gwInjected?.hash) && (
        <p className="mt-2 text-xs text-emerald-400">
          Proven hash:{" "}
          {([gwAppkit?.hash, gwInjected?.hash].filter(Boolean) as Hex[]).join(" · ")}
        </p>
      )}
    </section>
  );
}
