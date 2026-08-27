// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FeeRouter — charges 1% INDEXLA fee only on swap amounts.
contract FeeRouter {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BPS = 100; // 1%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public immutable feeRecipient;
    address public executor;

    event ExecutorWired(address indexed executor);
    event SwapFeeCharged(
        address indexed user,
        address indexed token,
        uint256 grossAmount,
        uint256 feeAmount,
        uint256 netAmount,
        bytes32 indexed permissionId
    );

    error OnlyExecutor();
    error ZeroAmount();
    error InvalidRecipient();
    error ExecutorAlreadyWired();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert OnlyExecutor();
        _;
    }

    constructor(address feeRecipient_) {
        if (feeRecipient_ == address(0)) revert InvalidRecipient();
        feeRecipient = feeRecipient_;
    }

    function wireExecutor(address executor_) external {
        if (executor != address(0) || executor_ == address(0)) revert ExecutorAlreadyWired();
        executor = executor_;
        emit ExecutorWired(executor_);
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

        IERC20(token).safeTransferFrom(user, address(this), grossAmount);
        if (feeAmount > 0) {
            IERC20(token).safeTransfer(feeRecipient, feeAmount);
        }
        IERC20(token).safeTransfer(executor, netAmount);

        emit SwapFeeCharged(user, token, grossAmount, feeAmount, netAmount, permissionId);
    }
}
