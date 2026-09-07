/**
 * Registration control-flow helpers for five-pool deposits.
 * registerStrategy must rethrow on hard failure and never let deposit continue
 * after an error; StrategyAlreadyExists is a silent success.
 */

export function isStrategyAlreadyExistsError(message: string): boolean {
  return /StrategyAlreadyExists/i.test(message);
}

/**
 * After a registration attempt returns without throwing, deposit may proceed
 * only when on-chain strategy state is registered.
 */
export function assertRegistrationAllowsDeposit(strategyRegistered: boolean): void {
  if (!strategyRegistered) {
    throw new Error(
      "Strategy registration did not complete. Confirm the wallet prompt, then try Deposit again.",
    );
  }
}
