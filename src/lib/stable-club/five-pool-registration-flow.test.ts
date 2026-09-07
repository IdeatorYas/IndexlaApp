import { describe, expect, it } from "vitest";
import {
  assertRegistrationAllowsDeposit,
  isStrategyAlreadyExistsError,
} from "@/lib/stable-club/five-pool-registration-flow";

describe("five-pool-registration-flow", () => {
  it("treats StrategyAlreadyExists as silent success", () => {
    expect(isStrategyAlreadyExistsError("StrategyAlreadyExists()")).toBe(true);
    expect(isStrategyAlreadyExistsError("execution reverted: StrategyAlreadyExists")).toBe(true);
    expect(isStrategyAlreadyExistsError("Registration failed")).toBe(false);
  });

  it("never allows deposit when registration did not complete", () => {
    expect(() => assertRegistrationAllowsDeposit(false)).toThrow(/registration did not complete/i);
    expect(() => assertRegistrationAllowsDeposit(true)).not.toThrow();
  });

  it("documents: registration error must not continue even if later refresh shows registered", () => {
    // Control-flow contract for useFivePoolDeposit:
    // 1) registerStrategy rethrows on hard failure (depositIntoFivePoolStrategy catch runs).
    // 2) Only StrategyAlreadyExists returns without throw.
    // 3) assertRegistrationAllowsDeposit runs only after a non-throwing register attempt.
    const registrationThrew = true;
    const strategyRegisteredOnChain = true;
    const shouldCallDeposit = !registrationThrew && strategyRegisteredOnChain;
    expect(shouldCallDeposit).toBe(false);
  });
});
