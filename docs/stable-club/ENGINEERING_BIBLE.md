# **INDEXLA Stable Club — Engineering Bible**

## **1. Product Objective**

Stable Club lets users:

1. Connect their wallet.
2. Deposit an approved stablecoin.
3. Select an approved liquidity pool.
4. Choose a strategy.
5. Authorize limited automation.
6. Let INDEXLA add and manage liquidity.
7. Harvest, compound, rebalance or withdraw.

INDEXLA does not custody funds or issue a vault token. The user owns the underlying LP token or position NFT.



---



## **2. Non-Negotiable Architecture**

- No INDEXLA vault.
- No pooled user capital.
- No wrapper token.
- No internal user-balance ledger.
- The user wallet or user-owned Safe owns the LP position.
- INDEXLA acts only as an authorized operator.
- Permissions must be limited, expiring and revocable.
- OpenServ never holds funds or signing keys.
- OpenServ cannot generate unrestricted transaction calldata.
- Users can always pause automation and exit.
- The 1% INDEXLA fee applies only when a trade executes.



---



## **3. Initial Scope**

### **Networks**

- Base
- Ethereum

Add Arbitrum and BNB Chain only after Base and Ethereum are stable.

### **Protocols**

- Curve
- Uniswap V3
- Aerodrome Slipstream

Convex requires a separate adapter and security review. It is not included automatically just because a Curve pool can use Convex rewards.

### **Excluded From V1**

- Solana
- Orca
- Lending
- Borrowing
- Leverage
- Rehypothecation
- Permissionless pool listings
- Creator-managed Stable Club strategies



---



## **4. Product Strategies**

### **Passive Liquidity**

INDEXLA opens the position using a predetermined range. No automatic movement unless the user changes it.

### **Auto-Harvest**

INDEXLA collects trading fees and rewards when their value exceeds the required gas and execution threshold.

### **Harvest to Wallet**

Fees and rewards are sent directly to the user.

No 1% INDEXLA fee applies if no trade occurs.

### **Auto-Compound**

INDEXLA:

1. Harvests fees and rewards.
2. Swaps the necessary assets.
3. Adds them back to the position.

The 1% fee applies only to the value actually swapped.

### **Auto-Rebalance**

When the position leaves its approved range:

1. Confirm the range breach.
2. Confirm prices through approved oracles.
3. Remove liquidity.
4. Collect fees and rewards.
5. Perform any required swap.
6. Open a new approved range.
7. Return ownership of the position to the user.

Rebalancing must have a cooldown and maximum frequency.



---



## **5. User Deposit Flow**

1. User connects an EVM wallet.
2. User chooses an approved pool.
3. User chooses a stablecoin and deposit amount.
4. User selects a strategy.
5. INDEXLA shows:
  - Current APY
  - 30-day APY range
  - Fee APY
  - Reward APY
  - TVL
  - Pool fee
  - Estimated gas
  - Price impact
  - INDEXLA execution fee
  - Risk level
6. User signs a limited permission.
7. INDEXLA receives a live execution quote.
8. The Executor swaps only the required portion of the deposit.
9. The DEX adapter adds liquidity.
10. The LP token or position NFT remains owned by the user.
11. INDEXLA verifies the position on-chain.
12. The position appears in the Stable Club dashboard.



---



## **6. System Architecture**

### **User Wallet or User-Owned Safe**

The wallet:

- Owns the deposited assets.
- Owns the LP token or NFT.
- Grants limited automation permissions.
- Can revoke permissions.
- Can initiate withdrawal or emergency exit.

### **Stable Club Frontend**

The frontend:

- Displays approved pools.
- Builds quotes.
- Displays fees and risks.
- Collects strategy settings.
- Creates typed permissions.
- Shows positions and execution history.

Frontend data is not authoritative. On-chain state is authoritative.

### **INDEXLA Stateless Executor**

The Executor:

- Validates permissions.
- Validates pool and token allowlists.
- Checks amount limits.
- Checks daily limits.
- Checks expiry.
- Checks nonces.
- Checks slippage.
- Checks oracle prices.
- Calls only approved adapter functions.

The Executor must not retain user tokens or LP NFTs after execution.

### **Permission Registry**

Stores or validates:

- User address
- Chain
- Pool
- Tokens
- Approved actions
- Maximum amount per transaction
- Maximum amount per day
- Maximum slippage
- Minimum time between executions
- Maximum executions per day
- Expiration
- Nonce
- Revocation status

### **DEX Adapters**

Separate adapters are required for:

- Curve
- Uniswap V3
- Aerodrome Slipstream

Each adapter exposes only the exact functions INDEXLA requires.

### **Fee Router**

The Fee Router:

- Calculates the 1% execution fee on swaps.
- Sends the correct amount to the approved allocation destinations.
- Emits transparent fee events.
- Cannot charge deposits or withdrawals without a trade.

### **Oracle Guard**

The Oracle Guard:

- Checks reference prices.
- Checks pool TWAP.
- Rejects stale prices.
- Rejects excessive deviation.
- Blocks unsafe execution.
- Fails closed when reliable pricing is unavailable.

### **OpenServ**

OpenServ:

- Monitors positions.
- Detects range status.
- Monitors APY and rewards.
- Detects harvest or rebalance conditions.
- Produces structured action proposals.

OpenServ cannot:

- Hold private keys.
- Move assets.
- Change permissions.
- Select arbitrary contracts.
- Override on-chain rules.
- Bypass the Executor.

### **Keeper and Relayer**

The keeper:

- Receives approved action proposals.
- Simulates transactions.
- Submits valid transactions.
- Manages gas and transaction nonces.
- Replaces stuck transactions.
- Stops when safety conditions fail.

### **Indexer and Database**

The backend tracks:

- LP ownership
- Deposits
- Withdrawals
- Liquidity
- Position range
- Fees earned
- Rewards earned
- APY history
- Rebalances
- Compounds
- Execution fees
- Transaction history

The indexer must regularly reconcile its data with on-chain state.



---



## **7. Smart Contracts**

### **7.1 Stateless Executor**

Responsibilities:

- Validate user authorization.
- Validate the requested action.
- Validate the adapter and pool.
- Validate oracle conditions.
- Validate execution limits.
- Execute the approved adapter call.
- Route applicable fees.
- Return all assets and position ownership to the user.

Forbidden capabilities:

- Arbitrary external calls
- Arbitrary delegatecall
- Unlimited asset transfers
- Generic approvals
- Holding user capital after execution
- Changing user strategy permissions

### **7.2 Permission Registry**

Every permission must specify:

- Exact user
- Exact chain
- Exact pool
- Exact tokens
- Exact approved functions
- Maximum transaction value
- Maximum daily value
- Maximum slippage
- Execution frequency
- Expiration
- Nonce

The user must be able to revoke authorization immediately.

### **7.3 Curve Adapter**

Must support:

- Add liquidity
- Remove liquidity
- Collect LP proceeds
- Validate minimum LP received
- Validate pool coins
- Deliver LP tokens to the user

Gauge staking or Convex integration requires separate implementation and review.

### **7.4 Uniswap V3 Adapter**

Must support:

- Mint position
- Increase liquidity
- Decrease liquidity
- Collect fees
- Close position
- Validate tick boundaries
- Validate minimum token amounts
- Ensure the user owns the position NFT

### **7.5 Aerodrome Slipstream Adapter**

Must support:

- Open position
- Add liquidity
- Remove liquidity
- Collect fees
- Collect AERO rewards
- Close position
- Validate tick spacing
- Validate dynamic pool fee
- Ensure the user owns the position NFT

### **7.6 Fee Router**

The Fee Router must record:

- Gross swap amount
- INDEXLA fee
- Net swap amount
- Allocation recipients
- Transaction identifier
- User address
- Position address

### **7.7 Oracle Guard**

Must support:

- Chainlink feeds where available
- DEX TWAP comparison
- Price-deviation limits
- Stale-price detection
- Invalid-round detection
- Minimum liquidity requirements
- Emergency pool suspension

### **7.8 Safety Controller**

Must support:

- Global pause
- Chain-specific pause
- Protocol-specific pause
- Pool-specific pause
- Adapter-specific pause
- Automation pause
- New-deposit pause

Emergency withdrawal must remain available whenever technically possible.



---



## **8. Permission Technology**

Engineering must evaluate:

- Permit2
- Safe modules
- ERC-4337 smart accounts and session keys
- EIP-7702 after wallet and audit support mature

Preferred approach:

- Permit2 for bounded token authorization.
- User-owned Safe or audited smart account for durable automation.
- Typed session permissions for specific automated functions.

Forbidden:

- Unlimited EOA approval to a generic INDEXLA executor.
- INDEXLA-controlled wallets holding user LP positions.



---



## **9. Fee Rules**

INDEXLA charges **1% only when a trade executes**.


|                                           |                     |
| ----------------------------------------- | ------------------- |
| **Action**                                | **1% Fee**          |
| Deposit using a zap swap                  | Yes, on swap amount |
| Deposit both required assets without swap | No                  |
| Rebalance requiring a swap                | Yes, on swap amount |
| Compound requiring a swap                 | Yes, on swap amount |
| Harvest directly to wallet                | No                  |
| Claim rewards without swapping            | No                  |
| Add liquidity without swapping            | No                  |
| Remove liquidity                          | No                  |
| Emergency exit                            | No                  |
| Pause automation                          | No                  |
| Revoke permissions                        | No                  |


The frontend must show the fee before the user signs.



---



## **10. Oracle Architecture**

### **Primary Price Source**

Use Chainlink where a reliable feed exists.

### **Secondary Price Source**

Use a manipulation-resistant DEX TWAP.

### **Validation**

Before executing:

1. Confirm the reference feed is current.
2. Confirm the TWAP has enough observation history.
3. Compare spot price against TWAP.
4. Compare TWAP against the reference oracle.
5. Reject execution if deviation exceeds the approved threshold.

### **Failure Behaviour**

- Stale oracle: block execution.
- Missing oracle: block execution.
- Excessive price deviation: block execution.
- Insufficient liquidity: block execution.
- Abnormal pool movement: pause the pool.

The system must fail closed.



---



## **11. Stablecoin Depeg Protection**

For every stablecoin, define:

- Warning threshold
- Deposit-pause threshold
- Compound-pause threshold
- Emergency threshold
- Recovery conditions

When a stablecoin moves outside the approved range:

1. Pause new deposits.
2. Pause compounding.
3. Block new exposure.
4. Notify users.
5. Evaluate an approved exit strategy.
6. Never let OpenServ independently decide to sell.



---



## **12. MEV Protection**

The deposit swap, compound swap and rebalance swap are MEV targets.

Required protections:

- CoW execution where compatible
- Private transaction routing on Ethereum
- MEV-aware relay for unsupported transactions
- On-chain minimum-output enforcement
- Maximum price-impact enforcement
- Transaction deadline
- Oracle validation
- No silent fallback to the public mempool

Slippage protection alone is not sufficient.



---



## **13. OpenServ Security**

OpenServ outputs must use a strict structured format:

- User
- Position
- Strategy
- Proposed action
- Reason
- Observed values
- Timestamp
- Idempotency key

Required protection:

- Maximum proposals per position
- Maximum proposals per minute
- Global proposal limit
- Duplicate proposal rejection
- Circuit breaker
- Cooldown after failed executions
- Automatic shutdown after abnormal proposal volume
- No arbitrary calldata
- No signing key access

OpenServ is treated as untrusted input.



---



## **14. Executor and Relayer Operations**

The executor infrastructure requires:

- Dedicated relayer wallets
- Secure key management
- Wallet-balance monitoring
- Automatic gas refill alerts
- Nonce tail
- Stuck-transaction replacement
- Execution timeout
- Gas-price ceiling
- Maximum execution frequency
- Idempotency protection
- Failed-transaction alerts

A failed or repeated proposal must not create an execution loop.



---



## **15. Gas Economics**

Before every automated action, calculate:

- Expected fees or rewards
- Estimated gas
- INDEXLA fee
- Expected net benefit

Do not harvest or compound when the expected benefit is below gas plus the required safety margin.

Define separate minimum position sizes for:

- Base
- Ethereum

Ethereum positions may require a larger minimum size because of gas costs.

The 1% execution fee must not automatically be assumed to cover gas.



---



## **16. Cross-Chain Architecture**

Stable Club remains EVM-only, but users may enter pools across supported EVM chains.

### **Initial Rule**

Same-chain execution launches first.

### **Later Cross-Chain Flow**

1. User selects a destination-chain pool.
2. INDEXLA obtains a bridge and destination execution quote.
3. User approves:
  - Source chain
  - Destination chain
  - Source token
  - Destination token
  - Amount
  - Bridge
  - Minimum received
  - Deadline
4. [LI.FI](http://LI.FI) routes the transaction.
5. Across may be used as an independently tested fallback.
6. The destination Executor opens the LP position.
7. The user owns the destination LP token or NFT.

Cross-chain transactions are not assumed to be atomic.

If destination execution fails, assets must remain recoverable by the user. INDEXLA must not custody stranded funds.



---



## **17. Data and Reconciliation**

On-chain state is the source of truth.

The backend must:

- Reconcile after every transaction.
- Periodically recheck every active position.
- Detect chain reorganizations.
- Detect incorrect ownership.
- Detect missing LP NFTs.
- Detect stale pool data.
- Detect incorrect indexer balances.
- Use redundant RPC providers.

If data is stale, the dashboard must show:

**Data Pending Verification**

It must not show unverified data as confirmed.



---



## **18. APY Display**

For every pool, show:

- Current APY
- 7-day average
- 30-day average
- 30-day minimum
- 30-day maximum
- Fee APY
- Reward APY
- Total APY
- TVL
- Volume
- Pool fee
- Range status
- Last updated time

High APY from temporary token emissions must not be presented as stable fee yield.



---



## **19. Governance**

No production contract should be controlled by one EOA.

Minimum governance:

- 3-of-5 multisig
- Separate emergency-pause role
- Separate proposal and execution roles
- Timelock for:
  - New pools
  - New tokens
  - New adapters
  - Fee changes
  - Contract upgrades
  - Risk-limit changes

Emergency pause may be immediate but must be narrowly scoped.



---



## **20. Upgradeability**

Engineering must decide contract-by-contract whether to use:

- Immutable deployment
- Upgradeable proxy
- Replaceable adapter registry

Do not automatically use UUPS proxies everywhere.

If a contract is upgradeable:

- Multisig approval required
- Timelock required
- Storage-layout checks required
- Upgrade tests required
- Audit must cover the upgrade mechanism
- User exit must not depend on accepting an upgrade



---



## **21. Security Controls**


|                         |                                                |
| ----------------------- | ---------------------------------------------- |
| **Threat**              | **Required Control**                           |
| OpenServ compromised    | No keys, typed proposals, circuit breaker      |
| Executor compromised    | Limited permissions, caps, expiry, rate limits |
| Oracle manipulation     | Chainlink + TWAP + deviation checks            |
| Sandwich attack         | CoW/private execution                          |
| Stablecoin depeg        | Deposit and automation circuit breakers        |
| DEX exploit             | Protocol/pool-specific pause                   |
| Approval abuse          | Permit2/session limits                         |
| Replay attack           | Nonce and idempotency                          |
| Reentrancy              | Reentrancy protection and safe call order      |
| Malicious token         | Token allowlist                                |
| Indexer failure         | On-chain reconciliation                        |
| DNS/frontend compromise | Verified addresses and transaction preview     |
| Relayer failure         | Multiple relayers and user-controlled exit     |




---



## **22. Frontend Security**

Required:

- Content Security Policy
- Dependency pinning
- Verified contract-address registry
- Chain validation
- Transaction simulation
- Human-readable transaction preview
- Visible pool and token addresses
- No blind signature requests
- No hidden approvals
- Wallet warning for unexpected spender
- Production monitoring
- Signed release process

Publish canonical production contract addresses publicly.



---



## **23. Testing Requirements**

### **Unit Tests**

Cover:

- Permissions
- Fees
- Expiry
- Nuns
- Daily caps
- Slippage
- Pausing
- Oracle validation
- Rate limiting

### **Integration Tests**

Test every supported action against real forked:

- Curve contracts
- Uniswap V3 contracts
- Aerodrome contracts

### **Invariant and Fuzz Tests**

Prove:

- Executor does not retain user funds.
- User ownership cannot be changed.
- Unauthorized pools cannot execute.
- Unauthorized assets cannot execute.
- Unauthorized functions cannot execute.
- Fees cannot exceed the defined amount.
- The same action cannot execute twice.
- Withdrawals preserve fund accounting.

### **Adversarial Tests**

Test:

- Reentrancy
- Malicious tokens
- Oracle manipulation
- Stablecoin depeg
- Pool liquidity collapse
- Executor compromise
- OpenServ spam
- Front-running
- Sandwich attacks
- Gas spikes
- RPC failure
- Indexer team
- Stuck transactions
- Nonce conflicts

### **End-to-End Tests**

Test the complete flow:

1. Deposit.
2. Swap.
3. Open LP position.
4. Verify user ownership.
5. Harvest.
6. Compound.
7. Rebalance.
8. Withdraw.
9. Revoke.
10. Emergency exit.

Use internal deployments and mainnet-fork testing even if there is no public testnet campaign.



---



## **24. Independent Audit**

Before public deposits:

1. Complete internal threat modelling.
2. Complete static analysis.
3. Complete fuzz and invariant testing.
4. Complete mainnet-fork integration testing.
5. Hire at least one reputable independent smart-contract auditor.
6. Audit:
  - Executor
  - Permission Registry
  - Fee Router
  - Oracle Guard
  - Safety Controller
  - All active DEX adapters
7. Fix every critical and high issue.
8. Obtain auditor verification of fixes.
9. Publish the audit report.
10. Verify production contract source code.

One audit is the minimum launch gate, not proof that risk is eliminated.

A second independent audit is strongly recommended before:

- Raising deposit caps
- Enabling auto-rebalance
- Enabling auto-compound
- Expanding to more chains

Launch a bug bounty alongside the capped public release.



---



## **25. Mainnet Launch Order**

### **Stage 0 — Internal Mainnet Validation**

- Team wallets
- Very small amounts
- Fork tests completed
- Full deposit and exit verified
- Reconciliation verified

### **Stage 1 — Private Passive Beta**

Pools:

- RLUSD/USDC
- PYUSD/USDC

Features:

- Deposit
- Passive liquidity
- Harvest
- Withdrawal
- Emergency exit

Controls:

- Low global cap
- Low per-user cap
- No automatic rebalance
- No automatic compound

### **Stage 2 — Stable-to-Bitcoin**

Add:

- USDC/cbBTC on Uniswap or Aerodrome

Verify:

- Zap swap
- MEV protection
- Fee charging
- Volatile position accounting

### **Stage 3 — Bitcoin-to-ETH**

Add:

- cbBTC/WETH on one approved venue

Use tighter deposit and automation caps.

### **Stage 4 — Automated Harvest**

Enable harvesting only after keeper reliability and gas economics are proven.

### **Stage 5 — Auto-Rebalance**

Enable separately with:

- Cooldowns
- Execution limits
- Oracle confirmation
- Rate limits
- Low caps

### **Stage 6 — Auto-Compound**

Enable after harvest and rebalance have operated safely.

### **Stage 7 — Full Approved Catalogue**

Activate remaining pools individually after each passes the onboarding standard.



---



## **26. Pool Onboarding Standard**

Every pool must pass:

- Approved assets
- Verified pool contract
- Verified protocol deployment
- Protocol audit review
- Minimum TVL
- Minimum trading volume
- Sustainable fee yield
- Reward dependency analysis
- Pool-fee verification
- Range behaviour testing
- Oracle availability
- Manipulation-cost assessment
- Withdrawal test
- Emergency-exit test
- Adapter integration test
- Governance approval
- Timelock

Automatically suspend a pool when:

- TVL falls below threshold
- Oracle data fails
- Stablecoin depegs
- Pool contract pauses
- Protocol health deteriorates
- Abnormal withdrawals occur



---



## **27. Incident Response**

Prepare a written runbook for:

- Smart-contract exploit
- Oracle failure
- Stablecoin depeg
- DEX exploit
- OpenServ compromise
- Relayer-key compromise
- Frontend/DNS compromise
- RPC outage
- Incorrect indexer data

Incident actions:

1. Pause the affected pool or adapter.
2. Disable automation.
3. Preserve user emergency exit.
4. Revoke the affected relayer.
5. Notify users.
6. Publish the affected contracts and positions.
7. Coordinate recovery.
8. Publish a post-mortem.



---



## **28. Engineering Workstreams**

### **Smart Contracts**

- Stateless Executor
- Permission Registry
- Fee Router
- Oracle Guard
- Safety Controller
- Curve adapter
- Uniswap V3 adapter
- Aerodrome adapter

### **Automation**

- OpenServ workflow
- Strategy policy engine
- Transaction simulator
- Keeper
- Relay
- Nonce manager
- Gas manager
- Circuit breaker

### **Backend**

- Blockchain indexer
- Position database
- On-chain reconciliation
- APY service
- Price-feed service
- Notifications
- Risk dashboard

### **Frontend**

- Pool catalogue
- Deposit flow
- Strategy selection
- Permission review
- Position dashboard
- Harvest
- Compound
- Rebalance
- Withdraw
- Revoke
- Emergency exit

### **Security and Operations**

- Threat model
- Testing
- Audit
- Multisig
- Timelock
- Monitoring
- Incident response
- Bug bounty



---



## **29. Required Architecture Decisions**

Before engineering begins, lock:

1. User wallet versus user-owned Safe default.
2. Permit2, Safe module or smart-account permission model.
3. Immutable versus upgradeable contracts.
4. Oracle feed for every asset.
5. MEV route for every supported chain and action.
6. Gas-payer and reimbursement model.
7. Minimum position size per chain.
8. LP NFT operator model for Uniswap and Aerodrome.
9. Exact 1% fee calculation and rounding.
10. Cross-chain recovery workflow.
11. Global and per-pool deposit caps.
12. Stablecoin depeg thresholds.



---



## **30. Final Definition of Done**

Stable Club is ready only when:

- Users own every LP token or position NFT.
- INDEXLA contracts retain no user capital.
- Automation permissions are limited, expiring and revocable.
- OpenServ cannot control funds.
- Every swap uses MEV-aware routing.
- Every execution passes oracle validation.
- The 1% fee applies only to executed trades.
- Emergency exit works without OpenServ or the indexer.
- Dashboard data is reconciled on-chain.
- All contracts and adapters pass testing.
- At least one independent audit is completed and remediated.
- Production contracts are verified.
- Multisig and timelock are active.
- Monitoring and incident proced

  


