// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAllowanceTransfer} from "./interfaces/IAllowanceTransfer.sol";
import {UserTokenPull} from "./libraries/UserTokenPull.sol";

/// @title FeeRouter — charges 1% INDEXLA fee only on swap amounts.
/// @dev Production must wire Permit2; address(0) Permit2 is local/test legacy ERC20 path only.
contract FeeRouter {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BPS = 100; // 1%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public owner;
    address public immutable feeRecipient;
    address public executor;
    IAllowanceTransfer public permit2;

    event OwnerTransferred(address indexed previous, address indexed next);
    event ExecutorWired(address indexed executor);
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
    error ExecutorAlreadyWired();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyExecutor() {
        if (msg.sender != executor) revert OnlyExecutor();
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

    /// @notice One-shot executor wiring — owner/governance only.
    function wireExecutor(address executor_) external onlyOwner {
        if (executor_ == address(0)) revert InvalidExecutor();
        if (executor != address(0)) revert ExecutorAlreadyWired();
        executor = executor_;
        emit ExecutorWired(executor_);
    }

    /// @notice Wire Permit2 for ERC20 pulls. Production must set the verified Base Permit2.
    /// @dev Setting address(0) re-enables legacy IERC20.transferFrom (local/test only).
    function setPermit2(address permit2_) external onlyOwner {
        permit2 = IAllowanceTransfer(permit2_);
        emit Permit2Updated(permit2_);
    }

    function feeBps() external pure returns (uint256) {
        return FEE_BPS;
    }

    /// @dev Deduct INDEXLA fee from `grossAmount`, transfer fee to recipient, return net for swap.
    function applySwapFee(
        address token,
        address user,
        uint256 grossAmount,
        bytes32 permissionId
    ) external onlyExecutor returns (uint256 netAmount) {
        if (grossAmount == 0) revert ZeroAmount();

        uint256 feeAmount = (grossAmount * FEE_BPS) / BPS_DENOMINATOR;
        netAmount = grossAmount - feeAmount;

        UserTokenPull.pull(permit2, token, user, address(this), grossAmount);
        if (feeAmount > 0) {
            IERC20(token).safeTransfer(feeRecipient, feeAmount);
        }
        IERC20(token).safeTransfer(executor, netAmount);

        emit SwapFeeCharged(user, token, grossAmount, feeAmount, netAmount, permissionId);
    }
}
