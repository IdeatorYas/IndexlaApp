import { describe, expect, it } from "vitest";
import {
  findDiscoveryAdapterMeta,
  listDiscoveryAdapters,
  resolveClStackForAdapters,
  resolveDepositStack,
} from "@/lib/stable-club/cl-stack-resolve";
import { TRUSTED_PHASE2A_BASE_DEPLOYMENTS } from "@/lib/stable-club/trusted-phase2a-base-manifest";

describe("cl-stack-resolve", () => {
  const d = TRUSTED_PHASE2A_BASE_DEPLOYMENTS;

  it("lists primary + legacy adapters for discovery", () => {
    expect(listDiscoveryAdapters(d)).toHaveLength(10);
  });

  it("resolves primary stack with percent exit", () => {
    const stack = resolveClStackForAdapters(
      d,
      d.adapters.map((a) => a.adapter),
    );
    expect(stack.kind).toBe("primary");
    expect(stack.clExecutor.toLowerCase()).toBe(d.clExecutor.toLowerCase());
    expect(stack.percentExitAllowed).toBe(true);
  });

  it("resolves legacy stack as 100%-only", () => {
    const legacy = d.legacyExitStack!;
    const stack = resolveClStackForAdapters(
      d,
      legacy.adapters.map((a) => a.adapter),
    );
    expect(stack.kind).toBe("legacy");
    expect(stack.clExecutor.toLowerCase()).toBe(legacy.clExecutor.toLowerCase());
    expect(stack.percentExitAllowed).toBe(false);
  });

  it("finds legacy adapter meta for discovery", () => {
    const legacyAdapter = d.legacyExitStack!.adapters[0]!.adapter;
    expect(findDiscoveryAdapterMeta(d, legacyAdapter)?.adapter.toLowerCase()).toBe(
      legacyAdapter.toLowerCase(),
    );
  });

  it("resolves legacy deposit stack adapters", () => {
    const legacy = d.legacyExitStack!;
    const stack = resolveDepositStack(
      d,
      legacy.adapters.map((a) => a.adapter),
    );
    expect(stack.kind).toBe("legacy");
    expect(stack.adapters).toHaveLength(5);
    expect(stack.adapters[0]!.adapter.toLowerCase()).toBe(
      legacy.adapters[0]!.adapter.toLowerCase(),
    );
  });

  it("defaults empty legs to primary deposit stack", () => {
    const stack = resolveDepositStack(d, []);
    expect(stack.kind).toBe("primary");
    expect(stack.adapters[0]!.adapter.toLowerCase()).toBe(
      d.adapters[0]!.adapter.toLowerCase(),
    );
  });
});
