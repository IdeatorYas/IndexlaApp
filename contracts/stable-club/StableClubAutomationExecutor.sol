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
import {UserTokenPull} from "./libraries/UserTokenPull.sol";
import {MevGuard} from "./MevGuard.sol";
import {OpenServProposalGate} from "./OpenServProposalGate.sol";
import {SafetyController} from "./SafetyController.sol";

/// @title StableClubAutomationExecutor — Step 2 CL harvest / compound / rebalance operator.
/// @notice Stateless; never retains user funds or position NFTs after execution.
/// @dev Production ERC20 pulls use Permit2. Unset Permit2 is local/test legacy path only;
///      `setPermit2` rejects address(0) so legacy cannot be re-enabled after configuration.
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

    mapping(address => bool) public authorizedKeepers;
    mapping(address => bool) public approvedAdapters;
    mapping(bytes32 => address) public poolAdapters;
    mapping(address => bool) public approvedTokens;
    /// @notice On-chain official catalogue gate (H3). Activation requires catalogue membership.
    mapping(bytes32 => bool) public approvedOfficialPoolIds;
    mapping(bytes32 => bool) public officialPoolsActivated;

    event AdapterApproved(address indexed adapter, bool approved);
    event PoolRegistered(bytes32 indexed poolId, address indexed adapter, bool official);
    event OfficialPoolCatalogueUpdated(bytes32 indexed poolId, bool approved);
    event OfficialPoolActivated(bytes32 indexed poolId);
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

    function activateOfficialPool(bytes32 poolId) external onlyOwner {
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
    /// @dev Rejects address(0). Legacy transferFrom only applies while Permit2 remains unset.
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

    /// @notice Governance-revocable keeper allowlist for automated harvest proposals only.
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

        IConcentratedLiquidityAdapter(adapter).collectFees(perm.user, positionTokenId);
        IConcentratedLiquidityAdapter(adapter).collectRewards(perm.user, positionTokenId);

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

        bytes32 poolId = _requirePoolAdapter(adapter, perm.poolId);
        _requirePositionApproval(adapter, positionTokenId, perm.user);
        _requireBoundTokens(perm, tokenA, tokenB);
        _requirePositionBound(adapter, positionTokenId, perm);

        if ((amountA > 0 && amountAMin == 0) || (amountB > 0 && amountBMin == 0)) {
            revert SlippageMinRequired();
        }
        if (swapAmount > 0 && minAmountOut == 0) revert SlippageMinRequired();

        safetyController.assertAutomationAllowed(poolId);
        safetyController.assertTokenNotDepegged(tokenA);
        safetyController.assertTokenNotDepegged(tokenB);
        if (!oracleGuard.validatePrices(tokenA, tokenB, 0)) revert OracleRejected();

        permissionRegistry.validateExecution(
            permissionId,
            PermissionRegistry.Action.Compound,
            amountA + amountB + swapAmount,
            slippageBps,
            executionNonce
        );
        safetyController.consumeAutomationSlot();

        IConcentratedLiquidityAdapter(adapter).collectFees(perm.user, positionTokenId);
        IConcentratedLiquidityAdapter(adapter).collectRewards(perm.user, positionTokenId);

        uint256 swapOutOnExecutor;
        if (swapAmount > 0) {
            safetyController.assertSwapAllowed(poolId);
            _requireApprovedToken(rewardToken);
            uint256 net = feeRouter.applySwapFee(rewardToken, perm.user, swapAmount, permissionId);
            mevGuard.assertSwapProtections(
                rewardToken, tokenB, net, minAmountOut, quotedAmountOut, slippageBps, deadline
            );
            IERC20(rewardToken).forceApprove(adapter, net);
            swapOutOnExecutor =
                IConcentratedLiquidityAdapter(adapter).swap(perm.user, rewardToken, tokenB, net, minAmountOut);
            _assertZeroBalance(rewardToken);
        }

        uint256 totalB = amountB + swapOutOnExecutor;
        uint256 totalBMin = amountBMin;
        if (swapOutOnExecutor > 0) {
            // Preserve caller floor for user-supplied B; require non-zero floor covering swap out.
            if (totalBMin == 0) totalBMin = minAmountOut;
        }

        if (amountA > 0 || totalB > 0) {
            _requireApprovedToken(tokenA);
            _requireApprovedToken(tokenB);
            if (amountA > 0) {
                UserTokenPull.pull(permit2, tokenA, perm.user, address(this), amountA);
                IERC20(tokenA).forceApprove(adapter, amountA);
            }
            if (amountB > 0) {
                UserTokenPull.pull(permit2, tokenB, perm.user, address(this), amountB);
            }
            // swapOutOnExecutor already on this contract
            if (totalB > 0) {
                IERC20(tokenB).forceApprove(adapter, totalB);
            }
            IConcentratedLiquidityAdapter(adapter).increaseLiquidity(
                perm.user, positionTokenId, tokenA, tokenB, amountA, totalB, amountAMin, totalBMin
            );
            _assertZeroBalance(tokenA);
            _assertZeroBalance(tokenB);
        } else if (swapOutOnExecutor > 0) {
            // Swap without subsequent LP increase would strand funds — fail closed.
            revert FundsRemaining();
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

        bytes32 poolId = _requirePoolAdapter(adapter, perm.poolId);
        _requirePositionApproval(adapter, positionTokenId, perm.user);
        _requireBoundTokens(perm, tokenA, tokenB);
        _requirePositionBound(adapter, positionTokenId, perm);
        // Finding 6: both position / swap legs must be on the token allowlist.
        _requireApprovedToken(tokenA);
        _requireApprovedToken(tokenB);

        if (
            closeAmountAMin == 0 || closeAmountBMin == 0 || mintAmountAMin == 0 || mintAmountBMin == 0
        ) {
            revert SlippageMinRequired();
        }
        if (swapAmount > 0 && minAmountOut == 0) revert SlippageMinRequired();

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

        IConcentratedLiquidityAdapter(adapter).collectFees(perm.user, positionTokenId);
        (uint256 closedA, uint256 closedB) = IConcentratedLiquidityAdapter(adapter).closePosition(
            perm.user, positionTokenId, tokenA, tokenB, closeAmountAMin, closeAmountBMin
        );

        uint256 swapOutOnExecutor;
        if (swapAmount > 0) {
            if (swapAmount > closedA) revert InvalidSwapAmount();
            safetyController.assertSwapAllowed(poolId);
            uint256 net = feeRouter.applySwapFee(tokenA, perm.user, swapAmount, permissionId);
            mevGuard.assertSwapProtections(
                tokenA, tokenB, net, minAmountOut, quotedAmountOut, slippageBps, deadline
            );
            IERC20(tokenA).forceApprove(adapter, net);
            swapOutOnExecutor =
                IConcentratedLiquidityAdapter(adapter).swap(perm.user, tokenA, tokenB, net, minAmountOut);
        }

        uint256 amountA = closedA > swapAmount ? closedA - swapAmount : 0;
        uint256 amountB = closedB + swapOutOnExecutor;

        if (amountA > 0) {
            UserTokenPull.pull(permit2, tokenA, perm.user, address(this), amountA);
            IERC20(tokenA).forceApprove(adapter, amountA);
        }
        if (closedB > 0) {
            UserTokenPull.pull(permit2, tokenB, perm.user, address(this), closedB);
        }
        if (amountB > 0) {
            IERC20(tokenB).forceApprove(adapter, amountB);
        }

        (uint256 newTokenId, ) = IConcentratedLiquidityAdapter(adapter).mintPosition(
            perm.user,
            tokenA,
            tokenB,
            newTickLower,
            newTickUpper,
            amountA,
            amountB,
            mintAmountAMin,
            mintAmountBMin
        );

        if (IConcentratedLiquidityAdapter(adapter).ownerOf(newTokenId) != perm.user) {
            revert NotPositionOwner();
        }

        _assertZeroBalance(tokenA);
        _assertZeroBalance(tokenB);

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

    function _requireApprovedToken(address token) internal view {
        if (!approvedTokens[token]) revert TokenNotApproved();
    }

    function _assertZeroBalance(address token) internal view {
        if (IERC20(token).balanceOf(address(this)) != 0) revert FundsRemaining();
    }
}
