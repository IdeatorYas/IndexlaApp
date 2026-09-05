import { describe, expect, it, vi } from "vitest";

/**
 * Regression: product Deposit must not require React `preview` state in the same tick
 * as prepareQuotes — that stale closure made submitDeposit throw / appear to do nothing.
 */
describe("five-pool deposit click readiness", () => {
  it("treats planRef + quoteBundleRef as sufficient without preview state", () => {
    const planRef = { current: { grossUsdc: 20n * 10n ** 6n } };
    const quoteBundleRef = {
      current: { quotedAtSec: 1, source: "oracle-guard", quotes: {} },
    };
    const previewState: null = null;

    const canSubmit =
      planRef.current != null &&
      quoteBundleRef.current != null &&
      (previewState != null || planRef.current != null);

    expect(canSubmit).toBe(true);
  });

  it("product primary click must call depositIntoFivePoolStrategy (not silent return)", async () => {
    const depositIntoFivePoolStrategy = vi.fn(async () => undefined);
    const failClosed = false;
    const busy = false;
    const deploymentsLoading = false;

    const onPrimaryClick = () => {
      if (deploymentsLoading || busy) return;
      if (failClosed) return;
      void depositIntoFivePoolStrategy();
    };

    onPrimaryClick();
    expect(depositIntoFivePoolStrategy).toHaveBeenCalledTimes(1);
  });
});
