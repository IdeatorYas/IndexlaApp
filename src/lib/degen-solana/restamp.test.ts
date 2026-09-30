import { describe, expect, it } from "vitest";
import {
  isBlockhashNotFoundError,
  isRetryableSimError,
} from "@/lib/degen-solana/restamp";

describe("blockhash sim error detection", () => {
  it("detects BlockhashNotFound variants", () => {
    expect(isBlockhashNotFoundError("BlockhashNotFound")).toBe(true);
    expect(isBlockhashNotFoundError('{"BlockhashNotFound":null}')).toBe(true);
    expect(isBlockhashNotFoundError("blockhash not found")).toBe(true);
    expect(isBlockhashNotFoundError("InstructionError")).toBe(false);
  });

  it("treats BlockhashNotFound as retryable", () => {
    expect(isRetryableSimError("BlockhashNotFound")).toBe(true);
    expect(isRetryableSimError("429 Too Many Requests")).toBe(true);
    expect(isRetryableSimError("custom program error")).toBe(false);
  });
});
