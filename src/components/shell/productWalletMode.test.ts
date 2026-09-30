import { describe, expect, it } from "vitest";
import { productWalletMode } from "@/components/shell/AppHeader";

describe("productWalletMode", () => {
  it("routes Solana / Base / Robinhood by path", () => {
    expect(productWalletMode("/app/degen-club")).toBe("solana");
    expect(
      productWalletMode("/app/degen-club/product/solana-memecoin-index"),
    ).toBe("solana");
    expect(productWalletMode("/app/stable-club")).toBe("base");
    expect(productWalletMode("/app/utility-index")).toBe("robinhood");
    expect(productWalletMode("/app")).toBe("evm");
  });
});
