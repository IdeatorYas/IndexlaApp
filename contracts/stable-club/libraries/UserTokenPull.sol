// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAllowanceTransfer} from "../interfaces/IAllowanceTransfer.sol";

/// @title UserTokenPull — ERC20 pull via Permit2 when configured; legacy transferFrom only if permit2 == 0.
/// @dev Production must set Permit2. Legacy path is for local/unit tests only.
library UserTokenPull {
    using SafeERC20 for IERC20;

    error AmountExceedsUint160();

    function pull(
        IAllowanceTransfer permit2,
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        if (amount == 0) return;
        if (address(permit2) == address(0)) {
            IERC20(token).safeTransferFrom(from, to, amount);
            return;
        }
        if (amount > type(uint160).max) revert AmountExceedsUint160();
        permit2.transferFrom(from, to, uint160(amount), token);
    }
}
