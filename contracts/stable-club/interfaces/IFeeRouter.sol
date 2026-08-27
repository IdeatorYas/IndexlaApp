// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stable Club Step 1 — 1% swap fee only; transparent events.
interface IFeeRouter {
    event SwapFeeCharged(
        address indexed user,
        address indexed token,
        uint256 grossAmount,
        uint256 feeAmount,
        uint256 netAmount,
        bytes32 indexed permissionId
    );

    function feeBps() external view returns (uint256);

    function feeRecipient() external view returns (address);

    /// @dev Deduct INDEXLA fee from `grossAmount`, transfer fee to recipient, return net for swap.
    function applySwapFee(
        address token,
        address user,
        uint256 grossAmount,
        bytes32 permissionId
    ) external returns (uint256 netAmount);
}
