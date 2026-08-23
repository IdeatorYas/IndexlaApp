import { describe, expect, it } from "vitest";
import { formatProductAttribution } from "@/lib/product/attribution";

describe("formatProductAttribution", () => {
  it("formats INDEXLA products without verified label", () => {
    expect(
      formatProductAttribution({
        creatorName: "INDEXLA",
        creatorHandle: "indexla",
        verified: true,
      }),
    ).toBe("INDEXLA");
  });

  it("formats creator products with display name only", () => {
    expect(
      formatProductAttribution({
        creatorName: "Quant Desk",
        creatorHandle: "quantdesk",
        verified: true,
      }),
    ).toBe("Quant Desk");
  });
});
