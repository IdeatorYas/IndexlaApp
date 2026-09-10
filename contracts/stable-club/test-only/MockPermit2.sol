// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAllowanceTransfer} from "../interfaces/IAllowanceTransfer.sol";

/// @title MockPermit2 — TEST ONLY AllowanceTransfer stand-in.
/// @dev Rejects unlimited (uint160.max) allowances to mirror INDEXLA policy in tests.
///      `permit` skips ECDSA and applies the signed PermitSingle (unit-test convenience).
contract MockPermit2 is IAllowanceTransfer {
    using SafeERC20 for IERC20;

    struct PackedAllowance {
        uint160 amount;
        uint48 expiration;
        uint48 nonce;
    }

    mapping(address => mapping(address => mapping(address => PackedAllowance))) private _allowances;

    error AllowanceExpired();
    error InsufficientAllowance();
    error UnlimitedAllowanceForbidden();
    error ZeroSpender();
    error PermitDeadlineExpired();
    error InvalidNonce();

    function allowance(
        address user,
        address token,
        address spender
    ) external view returns (uint160 amount, uint48 expiration, uint48 nonce) {
        PackedAllowance memory a = _allowances[user][token][spender];
        return (a.amount, a.expiration, a.nonce);
    }

    function approve(address token, address spender, uint160 amount, uint48 expiration) external {
        if (spender == address(0)) revert ZeroSpender();
        if (amount == type(uint160).max) revert UnlimitedAllowanceForbidden();
        PackedAllowance storage a = _allowances[msg.sender][token][spender];
        a.amount = amount;
        a.expiration = expiration;
    }

    function permit(address owner, PermitSingle memory permitSingle, bytes calldata) external {
        if (block.timestamp > permitSingle.sigDeadline) revert PermitDeadlineExpired();
        if (permitSingle.spender == address(0)) revert ZeroSpender();
        if (permitSingle.details.amount == type(uint160).max) revert UnlimitedAllowanceForbidden();

        PackedAllowance storage a =
            _allowances[owner][permitSingle.details.token][permitSingle.spender];
        if (a.nonce != permitSingle.details.nonce) revert InvalidNonce();
        a.amount = permitSingle.details.amount;
        a.expiration = permitSingle.details.expiration;
        unchecked {
            ++a.nonce;
        }
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        PackedAllowance storage a = _allowances[from][token][msg.sender];
        if (block.timestamp > a.expiration) revert AllowanceExpired();
        if (a.amount < amount) revert InsufficientAllowance();
        unchecked {
            a.amount = uint160(a.amount - amount);
        }
        IERC20(token).safeTransferFrom(from, to, amount);
    }
}
