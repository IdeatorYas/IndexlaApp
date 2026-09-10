// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Uniswap Permit2 AllowanceTransfer surface used by Stable Club.
/// @dev Full Permit2 lives at the canonical CREATE2 address; do not redeploy.
interface IAllowanceTransfer {
    struct PermitDetails {
        address token;
        uint160 amount;
        uint48 expiration;
        uint48 nonce;
    }

    struct PermitSingle {
        PermitDetails details;
        address spender;
        uint256 sigDeadline;
    }

    /// @notice Transfer tokens using Permit2 allowance from `from` to `to`.
    function transferFrom(address from, address to, uint160 amount, address token) external;

    /// @notice Packed allowance: amount (160) | expiration (48) | nonce (48).
    function allowance(
        address user,
        address token,
        address spender
    ) external view returns (uint160 amount, uint48 expiration, uint48 nonce);

    /// @notice Set Permit2 allowance for a spender (bounded amount + expiration).
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;

    /// @notice Set allowance via EIP-712 PermitSingle signature (spender typically = CL executor).
    function permit(address owner, PermitSingle memory permitSingle, bytes calldata signature) external;
}
