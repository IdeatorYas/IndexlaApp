// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PermissionRegistry} from "./PermissionRegistry.sol";
import {FeeRouter} from "./FeeRouter.sol";
import {IConcentratedLiquidityAdapter} from "./interfaces/IConcentratedLiquidityAdapter.sol";
import {IOracleGuard} from "./interfaces/IOracleGuard.sol";
import {IAllowanceTransfer} from "./interfaces/IAllowanceTransfer.sol";
import {MevGuard} from "./MevGuard.sol";
import {OpenServProposalGate} from "./OpenServProposalGate.sol";
import {SafetyController} from "./SafetyController.sol";
import {GovernanceActivationGuard} from "./libraries/GovernanceActivationGuard.sol";

/// @title StableClubAutomationExecutor — Step 2 CL harvest / compound / rebalance operator.
/// @notice Stateless; never retains user funds or position NFTs after execution.
/// @dev Production ERC20 pulls use Permit2 only where explicitly required (none on atomic compound/rebalance).
///      NFT remains per-token approve.
contract StableClubAutomationExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    PermissionRegistry public immutable permissionRegistry;
    FeeRouter public immutable feeRouter;
    IOracleGuard public immutable oracleGuard;
    SafetyController public immutable safetyController;
    MevGuard public immutable mevGuard;
    address public owner;
    IAllowanceTransfer public permit2;
    OpenServProposalGate public proposalGate;

    /// @notice Wired once; required before `activateOfficialPool` (fail-closed governance).
    address public governanceTimelock;
    address public governanceSafe;
    address public governanceStep1Executor;
    address public governanceOpenServGate;
    bool public governanceActivationWired;

    mapping(address => bool) public authorizedKeepers;
    mapping(address => bool) public approvedAdapters;
    mapping(bytes32 => address) public poolAdapters;
    mapping(address => bool) public approvedTokens;
    /// @notice On-chain official catalogue gate (H3). Activation requires catalogue membership.
    mapping(bytes32 => bool) public approvedOfficialPoolIds;
    mapping(bytes32 => bool) public officialPoolsActivated;

    struct CompoundParams {
        bytes32 permissionId;
        uint256 executionNonce;
        address adapter;
        uint256 positionTokenId;
        address rewardToken;
        address tokenA;
        address tokenB;
        uint256 swapAmount;
        uint256 minAmountOut;
        uint256 amountA;
        uint256 amountB;
        uint256 amountAMin;
        uint256 amountBMin;
        uint256 slippageBps;
        uint256 swapDeadline;
        uint256 quotedAmountOut;
    }

    struct RebalanceParams {
        bytes32 permissionId;
        uint256 executionNonce;
        address adapter;
        uint256 positionTokenId;
        address tokenA;
        address tokenB;
        int24 newTickLower;
        int24 newTickUpper;
        uint256 swapAmount;
        uint256 minAmountOut;
        uint256 closeAmountAMin;
        uint256 closeAmountBMin;
        uint256 mintAmountAMin;
        uint256 mintAmountBMin;
        uint256 slippageBps;
        uint256 swapDeadline;
        uint256 quotedAmountOut;
    }

    event AdapterApproved(address indexed adapter, bool approved);
    event PoolRegistered(bytes32 indexed poolId, address indexed adapter, bool official);
    event OfficialPoolCatalogueUpdated(bytes32 indexed poolId, bool approved);
    event OfficialPoolActivated(bytes32 indexed poolId);
    event GovernanceActivationWired(
        address indexed timelock,
        address indexed governanceSafe,
        address indexed step1Executor,
        address openServGate
    );
    event TokenApproved(address indexed token, bool approved);
    event Permit2Updated(address indexed permit2);
    event OwnerTransferred(address indexed previous, address indexed next);
    event ProposalGateSet(address indexed gate);
    event KeeperAuthorized(address indexed keeper, bool authorized);
    event AutomationExecuted(
        bytes32 indexed permissionId,
        PermissionRegistry.Action indexed action,
        bytes32 poolId,
        address indexed user,
        uint256 positionTokenId,
        uint256 executionNonce
    );

    error AdapterNotApproved();
    error PoolNotApproved();
    error TokenNotApproved();
    error PoolMismatch();
    error FundsRemaining();
    error OfficialPoolNotActivated();
    error OfficialPoolNotInCatalogue();
    error OracleRejected();
    error NotPositionOwner();
    error Unauthorized();
    error TokenNotBound();
    error SlippageMinRequired();
    error InvalidSwapAmount();
    error PositionApprovalRequired();
    error PositionValueUnavailable();
    error InvalidPermit2();
    error KeeperNotAuthorized();
    error ProposalGateNotSet();
    error ProposalInvalid();
    error ProposalExpired();
    error ProposalAlreadyHandled();
    error ProposalBindingMismatch();
    error ProposalActionMismatch();
    error ProposalAdapterMismatch();
    error ExceedsCollectedFees();
    error NoOpCompound();
    error SameTokenSwap();
    error NoOpRebalance();
    error GovernanceAlreadyWired();
    error GovernanceActivationNotWired();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(
        address permissionRegistry_,
        address feeRouter_,
        address oracleGuard_,
        address safetyController_,
        address mevGuard_
    ) {
        permissionRegistry = PermissionRegistry(permissionRegistry_);
        feeRouter = FeeRouter(feeRouter_);
        oracleGuard = IOracleGuard(oracleGuard_);
        safetyController = SafetyController(safetyController_);
        mevGuard = MevGuard(mevGuard_);
        owner = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert Unauthorized();
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    function setAdapterApproval(address adapter, bool approved) external onlyOwner {
        approvedAdapters[adapter] = approved;
        emit AdapterApproved(adapter, approved);
    }

    function registerPool(bytes32 poolId, address adapter, bool official) external onlyOwner {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        if (IConcentratedLiquidityAdapter(adapter).poolId() != poolId) revert PoolMismatch();
        poolAdapters[poolId] = adapter;
        emit PoolRegistered(poolId, adapter, official);
    }

    function setOfficialPoolCatalogue(bytes32 poolId, bool approved) external onlyOwner {
        approvedOfficialPoolIds[poolId] = approved;
        emit OfficialPoolCatalogueUpdated(poolId, approved);
    }

    /// @notice One-time governance wiring for on-chain activation preflight.
    /// @dev Callable only by the Timelock after it owns this contract and the step1 executor.
    function wireGovernanceActivation(
        address timelock,
        address governanceSafe_,
        address step1Executor,
        address openServGate
    ) external {
        if (governanceActivationWired) revert GovernanceAlreadyWired();
        if (governanceSafe_ == address(0) || openServGate == address(0)) revert Unauthorized();
        GovernanceActivationGuard.assertWireReady(timelock, owner, address(this), step1Executor);
        if (governanceSafe_.code.length == 0) revert GovernanceActivationGuard.SafeHasNoCode();
        governanceTimelock = timelock;
        governanceSafe = governanceSafe_;
        governanceStep1Executor = step1Executor;
        governanceOpenServGate = openServGate;
        governanceActivationWired = true;
        emit GovernanceActivationWired(timelock, governanceSafe_, step1Executor, openServGate);
    }

    function activateOfficialPool(bytes32 poolId) external onlyOwner {
        if (!governanceActivationWired) revert GovernanceActivationNotWired();
        GovernanceActivationGuard.assertActivationReady(
            governanceTimelock,
            governanceSafe,
            _criticalOwnables()
        );
        if (!approvedOfficialPoolIds[poolId]) revert OfficialPoolNotInCatalogue();
        if (poolAdapters[poolId] == address(0)) revert PoolNotApproved();
        officialPoolsActivated[poolId] = true;
        emit OfficialPoolActivated(poolId);
    }

    function setTokenApproval(address token, bool approved) external onlyOwner {
        approvedTokens[token] = approved;
        emit TokenApproved(token, approved);
    }

    /// @notice Wire Permit2 for user ERC20 pulls. Production must use verified Base Permit2.
    /// @dev Rejects address(0). Pulls fail closed until a non-zero Permit2 is wired.
    function setPermit2(address permit2_) external onlyOwner {
        if (permit2_ == address(0)) revert InvalidPermit2();
        permit2 = IAllowanceTransfer(permit2_);
        emit Permit2Updated(permit2_);
    }

    function setProposalGate(address gate) external onlyOwner {
        if (gate == address(0)) revert Unauthorized();
        proposalGate = OpenServProposalGate(gate);
        emit ProposalGateSet(gate);
    }

    /// @notice Governance-revocable keeper allowlist for automated harvest/compound proposals.
    function setAuthorizedKeeper(address keeper, bool authorized) external onlyOwner {
        if (keeper == address(0)) revert Unauthorized();
        authorizedKeepers[keeper] = authorized;
        emit KeeperAuthorized(keeper, authorized);
    }

    /// @notice Manual harvest — permission owner must call directly.
    function harvest(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        uint256 positionTokenId
    ) external nonReentrant {
        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(permissionId);
        if (perm.user != msg.sender) revert PermissionRegistry.UnauthorizedUser();
        _executeHarvest(permissionId, executionNonce, adapter, positionTokenId, perm);
    }

    /// @notice Keeper-only automated harvest — caller supplies proposalId only; all fields come from gate storage.
    function executeHarvestProposal(bytes32 proposalId) external nonReentrant {
        if (!authorizedKeepers[msg.sender]) revert KeeperNotAuthorized();
        if (address(proposalGate) == address(0)) revert ProposalGateNotSet();

        OpenServProposalGate.Proposal memory proposal = proposalGate.getProposal(proposalId);
        if (proposal.user == address(0)) revert ProposalInvalid();
        if (proposal.consumed || proposal.rejected) revert ProposalAlreadyHandled();
        if (block.timestamp > proposal.deadline) revert ProposalExpired();
        if (proposal.action != OpenServProposalGate.ProposedAction.Harvest) revert ProposalActionMismatch();
        if (proposal.chainId != block.chainid) revert ProposalBindingMismatch();

        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(proposal.permissionId);
        if (perm.user != proposal.user) revert ProposalBindingMismatch();
        if (perm.poolId != proposal.poolId) revert ProposalBindingMismatch();

        address derivedAdapter = poolAdapters[proposal.poolId];
        if (derivedAdapter == address(0) || derivedAdapter != proposal.adapter) {
            revert ProposalAdapterMismatch();
        }

        _executeHarvest(
            proposal.permissionId,
            proposal.executionNonce,
            proposal.adapter,
            proposal.positionTokenId,
            perm
        );

        proposalGate.markConsumedByExecutor(proposalId);
    }

    /// @notice Keeper-only automated compound — caller supplies proposalId only; all fields come from gate storage.
    function executeCompoundProposal(bytes32 proposalId) external nonReentrant {
        if (!authorizedKeepers[msg.sender]) revert KeeperNotAuthorized();
        if (address(proposalGate) == address(0)) revert ProposalGateNotSet();

        OpenServProposalGate.CompoundProposal memory proposal = proposalGate.getCompoundProposal(proposalId);
        if (proposal.user == address(0)) revert ProposalInvalid();
        if (proposal.consumed || proposal.rejected) revert ProposalAlreadyHandled();
        if (block.timestamp > proposal.deadline) revert ProposalExpired();
        if (proposal.chainId != block.chainid) revert ProposalBindingMismatch();

        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(proposal.permissionId);
        if (perm.user != proposal.user) revert ProposalBindingMismatch();
        if (perm.poolId != proposal.poolId) revert ProposalBindingMismatch();
        if (!permissionRegistry.isActionAllowed(proposal.permissionId, PermissionRegistry.Action.Compound)) {
            revert PermissionRegistry.ActionNotAllowed();
        }

        address derivedAdapter = poolAdapters[proposal.poolId];
        if (derivedAdapter == address(0) || derivedAdapter != proposal.adapter) {
            revert ProposalAdapterMismatch();
        }

        _executeCompound(
            CompoundParams({
                permissionId: proposal.permissionId,
                executionNonce: proposal.executionNonce,
                adapter: derivedAdapter,
                positionTokenId: proposal.positionTokenId,
                rewardToken: proposal.rewardToken,
                tokenA: proposal.tokenA,
                tokenB: proposal.tokenB,
                swapAmount: proposal.swapAmount,
                minAmountOut: proposal.minAmountOut,
                amountA: proposal.amountA,
                amountB: proposal.amountB,
                amountAMin: proposal.amountAMin,
                amountBMin: proposal.amountBMin,
                slippageBps: proposal.slippageBps,
                swapDeadline: proposal.swapDeadline,
                quotedAmountOut: proposal.quotedAmountOut
            }),
            perm
        );

        proposalGate.markCompoundConsumedByExecutor(proposalId);
    }

    /// @notice Keeper-only automated rebalance — caller supplies proposalId only; fields from gate storage.
    function executeRebalanceProposal(bytes32 proposalId) external nonReentrant {
        if (!authorizedKeepers[msg.sender]) revert KeeperNotAuthorized();
        if (address(proposalGate) == address(0)) revert ProposalGateNotSet();

        OpenServProposalGate.RebalanceProposal memory proposal = proposalGate.getRebalanceProposal(proposalId);
        if (proposal.user == address(0)) revert ProposalInvalid();
        if (proposal.consumed || proposal.rejected) revert ProposalAlreadyHandled();
        if (block.timestamp > proposal.deadline) revert ProposalExpired();
        if (proposal.chainId != block.chainid) revert ProposalBindingMismatch();

        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(proposal.permissionId);
        if (perm.user != proposal.user) revert ProposalBindingMismatch();
        if (perm.poolId != proposal.poolId) revert ProposalBindingMismatch();
        if (!permissionRegistry.isActionAllowed(proposal.permissionId, PermissionRegistry.Action.Rebalance)) {
            revert PermissionRegistry.ActionNotAllowed();
        }

        address derivedAdapter = poolAdapters[proposal.poolId];
        if (derivedAdapter == address(0) || derivedAdapter != proposal.adapter) {
            revert ProposalAdapterMismatch();
        }

        _executeRebalance(
            RebalanceParams({
                permissionId: proposal.permissionId,
                executionNonce: proposal.executionNonce,
                adapter: derivedAdapter,
                positionTokenId: proposal.positionTokenId,
                tokenA: proposal.tokenA,
                tokenB: proposal.tokenB,
                newTickLower: proposal.newTickLower,
                newTickUpper: proposal.newTickUpper,
                swapAmount: proposal.swapAmount,
                minAmountOut: proposal.minAmountOut,
                closeAmountAMin: proposal.closeAmountAMin,
                closeAmountBMin: proposal.closeAmountBMin,
                mintAmountAMin: proposal.mintAmountAMin,
                mintAmountBMin: proposal.mintAmountBMin,
                slippageBps: proposal.slippageBps,
                swapDeadline: proposal.swapDeadline,
                quotedAmountOut: proposal.quotedAmountOut
            }),
            perm
        );

        proposalGate.markRebalanceConsumedByExecutor(proposalId);
    }

    function _executeHarvest(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        uint256 positionTokenId,
        PermissionRegistry.Permission memory perm
    ) internal {
        bytes32 poolId = _requirePoolAdapter(adapter, perm.poolId);
        _requirePositionApproval(adapter, positionTokenId, perm.user);
        _requirePositionBound(adapter, positionTokenId, perm);

        safetyController.assertAutomationAllowed(poolId);
        safetyController.assertTokenNotDepegged(perm.tokenA);
        safetyController.assertTokenNotDepegged(perm.tokenB);
        if (!oracleGuard.validatePrices(perm.tokenA, perm.tokenB, 0)) revert OracleRejected();

        permissionRegistry.validateExecution(
            permissionId, PermissionRegistry.Action.Harvest, 0, 0, executionNonce
        );
        safetyController.consumeAutomationSlot();

        IConcentratedLiquidityAdapter(adapter).collectFees(perm.user, positionTokenId, perm.user);
        IConcentratedLiquidityAdapter(adapter).collectRewards(perm.user, positionTokenId, perm.user);

        emit AutomationExecuted(
            permissionId,
            PermissionRegistry.Action.Harvest,
            poolId,
            perm.user,
            positionTokenId,
            executionNonce
        );
    }

    function compound(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        uint256 positionTokenId,
        address rewardToken,
        address tokenA,
        address tokenB,
        uint256 swapAmount,
        uint256 minAmountOut,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 slippageBps,
        uint256 deadline,
        uint256 quotedAmountOut
    ) external nonReentrant {
        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(permissionId);
        if (perm.user != msg.sender) revert PermissionRegistry.UnauthorizedUser();

        _executeCompound(
            CompoundParams({
                permissionId: permissionId,
                executionNonce: executionNonce,
                adapter: adapter,
                positionTokenId: positionTokenId,
                rewardToken: rewardToken,
                tokenA: tokenA,
                tokenB: tokenB,
                swapAmount: swapAmount,
                minAmountOut: minAmountOut,
                amountA: amountA,
                amountB: amountB,
                amountAMin: amountAMin,
                amountBMin: amountBMin,
                slippageBps: slippageBps,
                swapDeadline: deadline,
                quotedAmountOut: quotedAmountOut
            }),
            perm
        );
    }

    function _executeCompound(
        CompoundParams memory params,
        PermissionRegistry.Permission memory perm
    ) internal {
        bytes32 permissionId = params.permissionId;
        uint256 executionNonce = params.executionNonce;
        address adapter = params.adapter;
        uint256 positionTokenId = params.positionTokenId;
        address rewardToken = params.rewardToken;
        address tokenA = params.tokenA;
        address tokenB = params.tokenB;
        uint256 swapAmount = params.swapAmount;
        uint256 minAmountOut = params.minAmountOut;
        uint256 amountA = params.amountA;
        uint256 amountB = params.amountB;
        uint256 amountAMin = params.amountAMin;
        uint256 amountBMin = params.amountBMin;
        uint256 slippageBps = params.slippageBps;
        uint256 swapDeadline = params.swapDeadline;
        uint256 quotedAmountOut = params.quotedAmountOut;

        bytes32 poolId = _requirePoolAdapter(adapter, perm.poolId);
        _requirePositionApproval(adapter, positionTokenId, perm.user);
        _requireBoundTokens(perm, tokenA, tokenB);
        _requirePositionBound(adapter, positionTokenId, perm);

        bool rewardIsA = rewardToken == tokenA;
        bool rewardIsB = rewardToken == tokenB;
        bool rewardDistinct = !rewardIsA && !rewardIsB;

        if (swapAmount > 0) {
            if (rewardIsB) revert SameTokenSwap();
            _requireApprovedToken(rewardToken);
        }
        if (rewardDistinct) {
            _requireApprovedToken(rewardToken);
        }

        if ((amountA > 0 && amountAMin == 0) || (amountB > 0 && amountBMin == 0)) {
            revert SlippageMinRequired();
        }
        if (swapAmount > 0 && minAmountOut == 0) revert SlippageMinRequired();
        if (swapAmount == 0 && amountA == 0 && amountB == 0) revert NoOpCompound();

        safetyController.assertAutomationAllowed(poolId);
        safetyController.assertTokenNotDepegged(tokenA);
        safetyController.assertTokenNotDepegged(tokenB);
        if (swapAmount > 0 || rewardDistinct) {
            safetyController.assertTokenNotDepegged(rewardToken);
        }
        if (!oracleGuard.validatePrices(tokenA, tokenB, 0)) revert OracleRejected();

        uint256 preBalA = IERC20(tokenA).balanceOf(address(this));
        uint256 preBalB = tokenB == tokenA ? preBalA : IERC20(tokenB).balanceOf(address(this));
        uint256 preBalReward;
        if (rewardDistinct) {
            preBalReward = IERC20(rewardToken).balanceOf(address(this));
        }

        IConcentratedLiquidityAdapter(adapter).collectFees(perm.user, positionTokenId, address(this));
        IConcentratedLiquidityAdapter(adapter).collectRewards(perm.user, positionTokenId, address(this));

        uint256 availA = IERC20(tokenA).balanceOf(address(this)) - preBalA;
        uint256 availB = tokenB == tokenA ? availA : IERC20(tokenB).balanceOf(address(this)) - preBalB;

        if (rewardDistinct && swapAmount > 0) {
            uint256 availReward = IERC20(rewardToken).balanceOf(address(this)) - preBalReward;
            if (swapAmount > availReward) revert ExceedsCollectedFees();
        }

        uint256 totalSpendA = amountA + (rewardIsA ? swapAmount : 0);
        uint256 totalSpendB = amountB + (rewardIsB ? swapAmount : 0);
        if (totalSpendA > availA || totalSpendB > availB) revert ExceedsCollectedFees();

        uint256 notional = _compoundNotional(
            perm.tokenA, perm.tokenB, tokenA, tokenB, rewardToken, amountA, amountB, swapAmount
        );
        permissionRegistry.validateExecution(
            permissionId,
            PermissionRegistry.Action.Compound,
            notional,
            slippageBps,
            executionNonce
        );
        safetyController.consumeAutomationSlot();

        uint256 swapOutOnExecutor;
        if (swapAmount > 0) {
            safetyController.assertSwapAllowed(poolId);
            _requireApprovedToken(rewardToken);
            IERC20(rewardToken).forceApprove(address(feeRouter), swapAmount);
            uint256 net = feeRouter.applySwapFeeOnHeld(rewardToken, perm.user, swapAmount, permissionId);
            _clearApproval(rewardToken, address(feeRouter));
            mevGuard.assertSwapProtections(
                rewardToken, tokenB, net, minAmountOut, quotedAmountOut, slippageBps, swapDeadline
            );
            IERC20(rewardToken).forceApprove(adapter, net);
            swapOutOnExecutor =
                IConcentratedLiquidityAdapter(adapter).swap(perm.user, rewardToken, tokenB, net, minAmountOut);
            _clearApproval(rewardToken, adapter);
        }

        uint256 totalB = amountB + swapOutOnExecutor;
        uint256 totalBMin = amountBMin;
        if (swapOutOnExecutor > 0) {
            if (totalBMin == 0) totalBMin = minAmountOut;
        }

        if (amountA > 0 || totalB > 0) {
            _requireApprovedToken(tokenA);
            _requireApprovedToken(tokenB);
            if (amountA > 0) IERC20(tokenA).forceApprove(adapter, amountA);
            if (totalB > 0) IERC20(tokenB).forceApprove(adapter, totalB);
            IConcentratedLiquidityAdapter(adapter).increaseLiquidity(
                perm.user, positionTokenId, tokenA, tokenB, amountA, totalB, amountAMin, totalBMin
            );
            _clearApproval(tokenA, adapter);
            _clearApproval(tokenB, adapter);
        } else if (swapOutOnExecutor > 0) {
            revert FundsRemaining();
        }

        _refundExcess(perm.user, tokenA, preBalA);
        if (tokenB != tokenA) _refundExcess(perm.user, tokenB, preBalB);
        if (rewardDistinct) {
            _refundExcess(perm.user, rewardToken, preBalReward);
        }

        _assertBalanceRestored(tokenA, preBalA);
        if (tokenB != tokenA) _assertBalanceRestored(tokenB, preBalB);
        if (rewardDistinct) {
            _assertBalanceRestored(rewardToken, preBalReward);
        }

        emit AutomationExecuted(
            permissionId,
            PermissionRegistry.Action.Compound,
            poolId,
            perm.user,
            positionTokenId,
            executionNonce
        );
    }

    function rebalance(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        uint256 positionTokenId,
        address tokenA,
        address tokenB,
        int24 newTickLower,
        int24 newTickUpper,
        uint256 swapAmount,
        uint256 minAmountOut,
        uint256 closeAmountAMin,
        uint256 closeAmountBMin,
        uint256 mintAmountAMin,
        uint256 mintAmountBMin,
        uint256 slippageBps,
        uint256 deadline,
        uint256 quotedAmountOut
    ) external nonReentrant {
        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(permissionId);
        if (perm.user != msg.sender) revert PermissionRegistry.UnauthorizedUser();

        _executeRebalance(
            RebalanceParams({
                permissionId: permissionId,
                executionNonce: executionNonce,
                adapter: adapter,
                positionTokenId: positionTokenId,
                tokenA: tokenA,
                tokenB: tokenB,
                newTickLower: newTickLower,
                newTickUpper: newTickUpper,
                swapAmount: swapAmount,
                minAmountOut: minAmountOut,
                closeAmountAMin: closeAmountAMin,
                closeAmountBMin: closeAmountBMin,
                mintAmountAMin: mintAmountAMin,
                mintAmountBMin: mintAmountBMin,
                slippageBps: slippageBps,
                swapDeadline: deadline,
                quotedAmountOut: quotedAmountOut
            }),
            perm
        );
    }

    /// @notice Atomic rebalance: collect+close to executor → optional held swap → mint → refund; no user pulls.
    function _executeRebalance(
        RebalanceParams memory params,
        PermissionRegistry.Permission memory perm
    ) internal {
        bytes32 permissionId = params.permissionId;
        uint256 executionNonce = params.executionNonce;
        address adapter = params.adapter;
        uint256 positionTokenId = params.positionTokenId;
        address tokenA = params.tokenA;
        address tokenB = params.tokenB;
        uint256 swapAmount = params.swapAmount;
        uint256 minAmountOut = params.minAmountOut;
        uint256 closeAmountAMin = params.closeAmountAMin;
        uint256 closeAmountBMin = params.closeAmountBMin;
        uint256 mintAmountAMin = params.mintAmountAMin;
        uint256 mintAmountBMin = params.mintAmountBMin;
        uint256 slippageBps = params.slippageBps;
        uint256 swapDeadline = params.swapDeadline;
        uint256 quotedAmountOut = params.quotedAmountOut;

        bytes32 poolId = _requirePoolAdapter(adapter, perm.poolId);
        _requirePositionApproval(adapter, positionTokenId, perm.user);
        _requireBoundTokens(perm, tokenA, tokenB);
        _requirePositionBound(adapter, positionTokenId, perm);
        _requireApprovedToken(tokenA);
        _requireApprovedToken(tokenB);

        if (closeAmountAMin == 0 || closeAmountBMin == 0) revert SlippageMinRequired();
        if (swapAmount > 0 && minAmountOut == 0) revert SlippageMinRequired();
        if (params.newTickLower >= params.newTickUpper) revert NoOpRebalance();

        safetyController.assertAutomationAllowed(poolId);
        safetyController.assertTokenNotDepegged(tokenA);
        safetyController.assertTokenNotDepegged(tokenB);
        if (!oracleGuard.validatePrices(tokenA, tokenB, 0)) revert OracleRejected();

        // Caps always denominated in permission.tokenA units (not caller-swapped order).
        uint256 positionValue = _livePositionValue(adapter, positionTokenId, perm.tokenA, perm.tokenB);
        permissionRegistry.validateExecution(
            permissionId, PermissionRegistry.Action.Rebalance, positionValue, slippageBps, executionNonce
        );
        safetyController.consumeAutomationSlot();

        uint256 preBalA = IERC20(tokenA).balanceOf(address(this));
        uint256 preBalB = tokenB == tokenA ? preBalA : IERC20(tokenB).balanceOf(address(this));

        IConcentratedLiquidityAdapter(adapter).collectFees(perm.user, positionTokenId, address(this));
        IConcentratedLiquidityAdapter(adapter).closePosition(
            perm.user,
            positionTokenId,
            address(this),
            tokenA,
            tokenB,
            closeAmountAMin,
            closeAmountBMin
        );

        uint256 availA = IERC20(tokenA).balanceOf(address(this)) - preBalA;
        uint256 availB = tokenB == tokenA ? availA : IERC20(tokenB).balanceOf(address(this)) - preBalB;
        if (availA == 0 && availB == 0) revert NoOpRebalance();
        if (swapAmount > availA) revert ExceedsCollectedFees();

        uint256 swapOutOnExecutor;
        if (swapAmount > 0) {
            safetyController.assertSwapAllowed(poolId);
            IERC20(tokenA).forceApprove(address(feeRouter), swapAmount);
            uint256 net = feeRouter.applySwapFeeOnHeld(tokenA, perm.user, swapAmount, permissionId);
            _clearApproval(tokenA, address(feeRouter));
            mevGuard.assertSwapProtections(
                tokenA, tokenB, net, minAmountOut, quotedAmountOut, slippageBps, swapDeadline
            );
            IERC20(tokenA).forceApprove(adapter, net);
            swapOutOnExecutor =
                IConcentratedLiquidityAdapter(adapter).swap(perm.user, tokenA, tokenB, net, minAmountOut);
            _clearApproval(tokenA, adapter);
        }

        uint256 amountA = availA - swapAmount;
        uint256 amountB = availB + swapOutOnExecutor;
        if (amountA == 0 && amountB == 0) revert NoOpRebalance();
        if ((amountA > 0 && mintAmountAMin == 0) || (amountB > 0 && mintAmountBMin == 0)) {
            revert SlippageMinRequired();
        }

        if (amountA > 0) IERC20(tokenA).forceApprove(adapter, amountA);
        if (amountB > 0) IERC20(tokenB).forceApprove(adapter, amountB);
        (uint256 newTokenId, ) = IConcentratedLiquidityAdapter(adapter).mintPosition(
            perm.user,
            tokenA,
            tokenB,
            params.newTickLower,
            params.newTickUpper,
            amountA,
            amountB,
            mintAmountAMin,
            mintAmountBMin
        );
        _clearApproval(tokenA, adapter);
        _clearApproval(tokenB, adapter);

        if (IConcentratedLiquidityAdapter(adapter).ownerOf(newTokenId) != perm.user) {
            revert NotPositionOwner();
        }

        _refundExcess(perm.user, tokenA, preBalA);
        if (tokenB != tokenA) _refundExcess(perm.user, tokenB, preBalB);
        _assertBalanceRestored(tokenA, preBalA);
        if (tokenB != tokenA) _assertBalanceRestored(tokenB, preBalB);

        emit AutomationExecuted(
            permissionId,
            PermissionRegistry.Action.Rebalance,
            poolId,
            perm.user,
            newTokenId,
            executionNonce
        );
    }

    function _requirePoolAdapter(address adapter, bytes32 expectedPoolId) internal view returns (bytes32 poolId) {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        poolId = IConcentratedLiquidityAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();
        if (poolId != expectedPoolId) revert PoolMismatch();
        if (!officialPoolsActivated[poolId]) revert OfficialPoolNotActivated();
    }

    function _requireBoundTokens(
        PermissionRegistry.Permission memory perm,
        address tokenA,
        address tokenB
    ) internal pure {
        bool matchExact = tokenA == perm.tokenA && tokenB == perm.tokenB;
        bool matchSwap = tokenA == perm.tokenB && tokenB == perm.tokenA;
        if (!(matchExact || matchSwap)) revert TokenNotBound();
    }

    function _requirePositionBound(
        address adapter,
        uint256 positionTokenId,
        PermissionRegistry.Permission memory perm
    ) internal view {
        (address t0, address t1) = IConcentratedLiquidityAdapter(adapter).positionTokens(positionTokenId);
        _requireBoundTokens(perm, t0, t1);
    }

    /// @notice Least-privilege ERC721 gate: per-token approve preferred; setApprovalForAll accepted if already set by user.
    function _requirePositionApproval(address adapter, uint256 tokenId, address lpOwner) internal view {
        if (IConcentratedLiquidityAdapter(adapter).ownerOf(tokenId) != lpOwner) {
            revert NotPositionOwner();
        }
        address npm = IConcentratedLiquidityAdapter(adapter).positionManager();
        if (
            IERC721(npm).getApproved(tokenId) != adapter
                && !IERC721(npm).isApprovedForAll(lpOwner, adapter)
        ) {
            revert PositionApprovalRequired();
        }
    }

    /// @notice Oracle-normalized position value in `permTokenA` units (never caller-swapped order).
    function _livePositionValue(
        address adapter,
        uint256 tokenId,
        address permTokenA,
        address permTokenB
    ) internal view returns (uint256) {
        (address t0, address t1) = IConcentratedLiquidityAdapter(adapter).positionTokens(tokenId);
        (uint256 a0, uint256 a1) = IConcentratedLiquidityAdapter(adapter).positionAmounts(tokenId);
        uint256 amountPermA;
        uint256 amountPermB;
        if (permTokenA == t0 && permTokenB == t1) {
            amountPermA = a0;
            amountPermB = a1;
        } else if (permTokenA == t1 && permTokenB == t0) {
            amountPermA = a1;
            amountPermB = a0;
        } else {
            revert TokenNotBound();
        }
        // Fail closed: cannot rebalance a position whose live value cannot be determined.
        if (amountPermA == 0 && amountPermB == 0) revert PositionValueUnavailable();

        uint256 value = amountPermA;
        if (amountPermB > 0) {
            uint8 dA = IERC20Metadata(permTokenA).decimals();
            uint8 dB = IERC20Metadata(permTokenB).decimals();
            value += oracleGuard.expectedAmountOut(permTokenB, permTokenA, amountPermB, dB, dA);
        }
        if (value == 0) revert PositionValueUnavailable();
        return value;
    }

    function _compoundNotional(
        address permTokenA,
        address permTokenB,
        address tokenA,
        address tokenB,
        address rewardToken,
        uint256 amountA,
        uint256 amountB,
        uint256 swapAmount
    ) internal view returns (uint256 value) {
        uint256 spendA = amountA;
        uint256 spendB = amountB;
        if (rewardToken == tokenA) {
            spendA += swapAmount;
        } else if (rewardToken == tokenB) {
            spendB += swapAmount;
        }

        value = _tokenValueInPermA(permTokenA, permTokenB, tokenA, spendA);
        if (tokenB != tokenA) {
            value += _tokenValueInPermA(permTokenA, permTokenB, tokenB, spendB);
        }
        if (swapAmount > 0 && rewardToken != tokenA && rewardToken != tokenB) {
            value += _tokenValueInPermA(permTokenA, permTokenB, rewardToken, swapAmount);
        }
    }

    function _tokenValueInPermA(
        address permTokenA,
        address permTokenB,
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        if (amount == 0) return 0;
        if (token == permTokenA) return amount;
        uint8 dPermA = IERC20Metadata(permTokenA).decimals();
        if (token == permTokenB) {
            uint8 dPermB = IERC20Metadata(permTokenB).decimals();
            return oracleGuard.expectedAmountOut(permTokenB, permTokenA, amount, dPermB, dPermA);
        }
        uint8 dToken = IERC20Metadata(token).decimals();
        return oracleGuard.expectedAmountOut(token, permTokenA, amount, dToken, dPermA);
    }

    function _refundExcess(address user, address token, uint256 preBalance) internal {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > preBalance) {
            IERC20(token).safeTransfer(user, bal - preBalance);
        }
    }

    function _clearApproval(address token, address spender) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            IERC20(token).forceApprove(spender, 0);
        }
    }

    function _assertBalanceRestored(address token, uint256 preBalance) internal view {
        if (IERC20(token).balanceOf(address(this)) != preBalance) revert FundsRemaining();
    }

    function _requireApprovedToken(address token) internal view {
        if (!approvedTokens[token]) revert TokenNotApproved();
    }

    function _criticalOwnables() internal view returns (address[8] memory critical) {
        critical[0] = address(permissionRegistry);
        critical[1] = address(feeRouter);
        critical[2] = governanceStep1Executor;
        critical[3] = address(oracleGuard);
        critical[4] = address(mevGuard);
        critical[5] = address(safetyController);
        critical[6] = governanceOpenServGate;
        critical[7] = address(this);
    }
}
