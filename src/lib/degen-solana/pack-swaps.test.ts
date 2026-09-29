import { describe, expect, it } from "vitest";
import { BUY_CONFIRM_MAX, SELL_CONFIRM_MAX } from "@/lib/degen-solana/constants";
import {
  PACK_LEGS_HARD_MAX,
  PACK_LEGS_HINT_MAX,
  PACK_PROMPT_MAX,
  PACK_SAFE_BYTES,
} from "@/lib/degen-solana/pack-swaps";

describe("degen solana packing constants", () => {
  it("caps wallet confirms at 4 for buy and sell", () => {
    expect(BUY_CONFIRM_MAX).toBe(4);
    expect(SELL_CONFIRM_MAX).toBe(4);
  });

  it("keeps packer budget at ≤4 packs with 3-prefer / 4-hard legs", () => {
    expect(PACK_PROMPT_MAX).toBe(BUY_CONFIRM_MAX);
    expect(PACK_LEGS_HINT_MAX).toBe(3);
    expect(PACK_LEGS_HARD_MAX).toBe(4);
    expect(PACK_SAFE_BYTES).toBe(1100);
  });
});
