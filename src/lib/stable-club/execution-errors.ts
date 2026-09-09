/**
 * Decode Stable Club deposit execution reverts into readable user messages.
 * Includes Aerodrome NPM `PSC` (price slippage check) and Uniswap's long form.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeAbiParameters,
  parseAbiParameters,
  type Hex,
} from "viem";
import { formatPermit2UserError } from "@/lib/stable-club/permit2";

function extractRevertData(err: unknown): Hex | null {
  if (!err || typeof err !== "object") return null;
  const walk = (value: unknown): Hex | null => {
    if (!value || typeof value !== "object") return null;
    const rec = value as Record<string, unknown>;
    if (typeof rec.data === "string" && rec.data.startsWith("0x") && rec.data.length >= 10) {
      return rec.data as Hex;
    }
    if (rec.data && typeof rec.data === "object") {
      const nested = rec.data as Record<string, unknown>;
      if (typeof nested.data === "string" && nested.data.startsWith("0x")) {
        return nested.data as Hex;
      }
    }
    return null;
  };
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const data = walk(reverted) ?? walk(reverted.data);
      if (data) return data;
    }
    const direct = walk(err);
    if (direct) return direct;
  }
  return walk(err);
}

function decodeErrorString(data: Hex): string | null {
  if (!data.startsWith("0x08c379a0")) return null;
  try {
    const [msg] = decodeAbiParameters(parseAbiParameters("string"), `0x${data.slice(10)}` as Hex);
    return msg;
  } catch {
    return null;
  }
}

function formatPscMessage(): string {
  return (
    "CL mint price slippage check failed (PSC): the pool would deposit less of one token " +
    "than amountAMin/amountBMin. Refresh quotes so LP mins match the live pool ratio, then retry."
  );
}

/**
 * Map depositFivePoolStrategy / adapter / NPM reverts to a clear UI message.
 * Returns null when the error is not a recognized Stable Club execution revert.
 */
export function formatStableClubExecutionError(err: unknown): string | null {
  if (!err) return null;

  const permit2Msg = formatPermit2UserError(err);
  if (permit2Msg) return permit2Msg;

  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const reason =
        typeof reverted.reason === "string"
          ? reverted.reason
          : typeof (reverted as { shortMessage?: string }).shortMessage === "string"
            ? (reverted as { shortMessage: string }).shortMessage
            : "";
      if (/\bPSC\b/i.test(reason) || /Price slippage check/i.test(reason)) {
        return formatPscMessage();
      }
      const data = reverted.data;
      if (data && typeof data === "object" && "errorName" in data) {
        const named = data as { errorName: string };
        if (named.errorName === "MinOutRequired") {
          return "Deposit rejected: amountAMin and amountBMin cannot both be zero.";
        }
        if (named.errorName === "StrategyUserMismatch") {
          return "Deposit rejected: wallet does not own the registered five-pool strategy.";
        }
        if (named.errorName === "CanonicalLegMismatch") {
          return "Deposit rejected: leg adapter/token binding does not match the registered strategy.";
        }
        if (named.errorName === "ExcessiveSlippage") {
          return (
            "Deposit swap guard rejected minOut as too tight vs the live oracle (ExcessiveSlippage). " +
            "Quotes were stale — refresh and retry deposit."
          );
        }
      }
    }
  }

  const data = extractRevertData(err);
  if (data) {
    if (data.slice(0, 10).toLowerCase() === "0x97c7f537") {
      return (
        "Deposit swap guard rejected minOut as too tight vs the live oracle (ExcessiveSlippage). " +
        "Refresh quotes and retry deposit."
      );
    }
    const msg = decodeErrorString(data);
    if (msg === "PSC" || msg === "Price slippage check") {
      return formatPscMessage();
    }
  }

  const text = err instanceof Error ? err.message : String(err);
  if (/out of gas|ran out of gas/i.test(text)) {
    return (
      "Deposit ran out of gas. Retry the deposit — the app buffers gas above eth_estimateGas for five-pool deposits."
    );
  }
  if (/\bPSC\b/.test(text) || /Price slippage check/i.test(text)) {
    return formatPscMessage();
  }
  return null;
}
