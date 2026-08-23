import { describe, expect, it } from "vitest";
import {
  RISK_DISCLOSURE_ACKNOWLEDGMENT,
  RISK_DISCLOSURE_PARAGRAPHS,
  RISK_DISCLOSURE_TITLE,
} from "@/components/product/RiskDisclosure";

describe("RiskDisclosure copy", () => {
  it("preserves approved wording exactly", () => {
    expect(RISK_DISCLOSURE_TITLE).toBe("Risk Disclosure");
    expect(RISK_DISCLOSURE_PARAGRAPHS).toEqual([
      "INDEXLA is non-custodial. Your assets remain in your wallet at all times, and automation operates only within the limited, revocable permissions you approve.",
      "Investing involves significant risk. You may lose some or all of your capital. Strategies may underperform and can incur fees, slippage and execution losses.",
      "INDEXLA does not provide financial, investment, tax or legal advice and does not guarantee returns or capital protection. Past performance is not indicative of future results.",
      "You are solely responsible for your investment decisions, due diligence and compliance with applicable laws.",
    ]);
    expect(RISK_DISCLOSURE_ACKNOWLEDGMENT).toBe(
      "By confirming this investment, you acknowledge and accept these risks.",
    );
  });
});
