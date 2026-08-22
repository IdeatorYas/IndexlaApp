import { describe, expect, it } from "vitest";
import { formatProductAttribution } from "@/lib/product/attribution";

describe("formatProductAttribution", () => {
  it("formats INDEXLA products as INDEXLA · Verified", () => {
    expect(
      formatProductAttribution({
        creatorName: "INDEXLA",
        creatorHandle: "indexla",
        verified: true,
      }),
    ).toBe("INDEXLA · Verified");
  });

  it("formats creator portfolios with name, verified and handle", () => {
    expect(
      formatProductAttribution({
        creatorName: "Meme Builder",
        creatorHandle: "memebuilder",
        verified: true,
      }),
    ).toBe("Meme Builder · Verified · @memebuilder");
  });
});
