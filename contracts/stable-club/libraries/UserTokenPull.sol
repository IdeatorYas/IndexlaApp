// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAllowanceTransfer} from "../interfaces/IAllowanceTransfer.sol";

/// @title UserTokenPull — ERC20 pull via Permit2 only (fail-closed).
/// @dev No legacy IERC20.transferFrom path. Callers must wire a non-zero Permit2.
library UserTokenPull {
    error AmountExceedsUint160();
    error Permit2Required();

    function pull(
        IAllowanceTransfer permit2,
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        if (amount == 0) return;
        if (address(permit2) == address(0)) revert Permit2Required();
        if (amount > type(uint160).max) revert AmountExceedsUint160();
        permit2.transferFrom(from, to, uint160(amount), token);
    }
}
