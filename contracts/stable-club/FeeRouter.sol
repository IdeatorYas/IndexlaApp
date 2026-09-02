// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAllowanceTransfer} from "./interfaces/IAllowanceTransfer.sol";
import {UserTokenPull} from "./libraries/UserTokenPull.sol";

/// @title FeeRouter — charges 1% INDEXLA fee only on swap amounts.
/// @dev Must wire Permit2 via `setPermit2` before any user pull. Unset Permit2 fails closed
///      in UserTokenPull (no IERC20.transferFrom fallback). `setPermit2` rejects address(0).
contract FeeRouter {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BPS = 100; // 1%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public owner;
    address public immutable feeRecipient;
    address public executor;
    mapping(address => bool) public approvedExecutors;
    IAllowanceTransfer public permit2;

    event OwnerTransferred(address indexed previous, address indexed next);
    event ExecutorWired(address indexed executor);
    event ExecutorApprovalUpdated(address indexed executor, bool approved);
    event PrimaryExecutorCleared(address indexed previous);
    event Permit2Updated(address indexed permit2);
    event SwapFeeCharged(
        address indexed user,
        address indexed token,
        uint256 grossAmount,
        uint256 feeAmount,
        uint256 netAmount,
        bytes32 indexed permissionId
    );

    error OnlyExecutor();
    error Unauthorized();
    error ZeroAmount();
    error InvalidRecipient();
    error InvalidExecutor();
    error InvalidPermit2();
    error ExecutorAlreadyWired();
    /// @dev Same selector as UserTokenPull.Permit2Required — declared for ABI/test matching.
    error Permit2Required();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyApprovedExecutor() {
        if (!approvedExecutors[msg.sender]) revert OnlyExecutor();
        _;
    }

    constructor(address feeRecipient_) {
        if (feeRecipient_ == address(0)) revert InvalidRecipient();
        feeRecipient = feeRecipient_;
        owner = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert Unauthorized();
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    /// @notice One-shot primary executor wiring — owner/governance only (Step 1 compatibility).
    function wireExecutor(address executor_) external onlyOwner {
        if (executor_ == address(0) || executor_ == feeRecipient) revert InvalidExecutor();
        if (executor != address(0)) revert ExecutorAlreadyWired();
        executor = executor_;
        approvedExecutors[executor_] = true;
        emit ExecutorWired(executor_);
        emit ExecutorApprovalUpdated(executor_, true);
    }

    /// @notice Explicit approved-executor allowlist for multi-executor Phase 2+.
    /// @dev Owner/governance only (Safe/Timelock-ready). De-approving the primary `executor`
    ///      clears the legacy pointer so tooling cannot assume a de-approved address remains
    ///      authoritative. Fee recipient can never be an approved executor.
    function setExecutorApproved(address executor_, bool approved) external onlyOwner {
        if (executor_ == address(0) || executor_ == feeRecipient) revert InvalidExecutor();
        approvedExecutors[executor_] = approved;
        if (approved && executor == address(0)) {
            executor = executor_;
            emit ExecutorWired(executor_);
        }
        if (!approved && executor == executor_) {
            emit PrimaryExecutorCleared(executor_);
            executor = address(0);
        }
        emit ExecutorApprovalUpdated(executor_, approved);
    }

    /// @notice Wire Permit2 for ERC20 pulls. Production must set the verified Base Permit2.
    /// @dev Rejects address(0). Pulls fail closed until a non-zero Permit2 is wired.
    function setPermit2(address permit2_) external onlyOwner {
        if (permit2_ == address(0)) revert InvalidPermit2();
        permit2 = IAllowanceTransfer(permit2_);
        emit Permit2Updated(permit2_);
    }

    function feeBps() external pure returns (uint256) {
        return FEE_BPS;
    }

    function isApprovedExecutor(address executor_) external view returns (bool) {
        return approvedExecutors[executor_];
    }

    /// @dev Deduct INDEXLA fee from `grossAmount`, transfer fee to recipient, return net to caller.
    function applySwapFee(
        address token,
        address user,
        uint256 grossAmount,
        bytes32 permissionId
    ) external onlyApprovedExecutor returns (uint256 netAmount) {
        if (grossAmount == 0) revert ZeroAmount();

        uint256 feeAmount = (grossAmount * FEE_BPS) / BPS_DENOMINATOR;
        netAmount = grossAmount - feeAmount;

        UserTokenPull.pull(permit2, token, user, address(this), grossAmount);
        if (feeAmount > 0) {
            IERC20(token).safeTransfer(feeRecipient, feeAmount);
        }
        IERC20(token).safeTransfer(msg.sender, netAmount);

        emit SwapFeeCharged(user, token, grossAmount, feeAmount, netAmount, permissionId);
    }

    /// @dev Charge fee on tokens already held by the approved executor (Phase 2a single USDC pull).
    /// @notice Net amount remains on `msg.sender` (executor). Does not pull from user.
    function applySwapFeeOnHeld(
        address token,
        address user,
        uint256 grossAmount,
        bytes32 permissionId
    ) external onlyApprovedExecutor returns (uint256 netAmount) {
        if (grossAmount == 0) revert ZeroAmount();

        uint256 feeAmount = (grossAmount * FEE_BPS) / BPS_DENOMINATOR;
        netAmount = grossAmount - feeAmount;

        if (feeAmount > 0) {
            IERC20(token).safeTransferFrom(msg.sender, feeRecipient, feeAmount);
        }

        emit SwapFeeCharged(user, token, grossAmount, feeAmount, netAmount, permissionId);
    }
}
