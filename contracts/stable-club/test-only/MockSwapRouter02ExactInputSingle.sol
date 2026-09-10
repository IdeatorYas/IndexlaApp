// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MockSwapRouter02ExactInputSingle — TEST ONLY 1:1 USDC out router for gateway exits.
contract MockSwapRouter02ExactInputSingle {
    using SafeERC20 for IERC20;

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    error Slippage();

    /// @dev Pays `amountIn` of tokenOut from this contract's balance (minted in tests).
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountIn;
        if (amountOut < params.amountOutMinimum) revert Slippage();
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }
}
