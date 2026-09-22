import { describe, expect, it } from "vitest";
import { classifyBinaryMatrix } from "./phantom-mobile-diag";
import type { DiagSendResult } from "./phantom-mobile-diag";

const fail = (partial?: Partial<DiagSendResult>): DiagSendResult => ({
  ok: false,
  hash: null,
  code: 4001,
  message: "User rejected the request.",
  nested: "code=4001",
  elapsedMs: 10,
  providerKind: "appkit",
  txSummary: "test",
  ...partial,
});

const ok = (partial?: Partial<DiagSendResult>): DiagSendResult => ({
  ok: true,
  hash: "0xabc",
  code: null,
  message: "broadcast ok",
  nested: "",
  elapsedMs: 10,
  providerKind: "appkit",
  txSummary: "test",
  ...partial,
});

describe("classifyBinaryMatrix", () => {
  it("flags session when self-transfer fails", () => {
    expect(
      classifyBinaryMatrix({
        selfTransfer: fail(),
        simpleContract: null,
        gatewayAppkit: null,
        gatewayInjected: null,
        injectedAvailable: false,
      }),
    ).toMatch(/SESSION/);
  });

  it("flags WC transport when injected gateway works", () => {
    expect(
      classifyBinaryMatrix({
        selfTransfer: ok(),
        simpleContract: ok({ providerKind: "appkit" }),
        gatewayAppkit: fail(),
        gatewayInjected: ok({ providerKind: "injected-phantom", hash: "0xdef" }),
        injectedAvailable: true,
      }),
    ).toMatch(/TRANSPORT/);
  });

  it("flags gateway calldata when both providers reject", () => {
    expect(
      classifyBinaryMatrix({
        selfTransfer: ok(),
        simpleContract: ok(),
        gatewayAppkit: fail(),
        gatewayInjected: fail({ providerKind: "injected-phantom" }),
        injectedAvailable: true,
      }),
    ).toMatch(/calldata|private-sim|contract-risk/);
  });

  it("flags proven path when AppKit gateway broadcasts", () => {
    expect(
      classifyBinaryMatrix({
        selfTransfer: ok(),
        simpleContract: ok(),
        gatewayAppkit: ok({ hash: "0x111" }),
        gatewayInjected: null,
        injectedAvailable: false,
      }),
    ).toMatch(/PROVEN PATH/);
  });
});
