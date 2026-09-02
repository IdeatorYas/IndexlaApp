// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev TEST ONLY — fixed-rate Uniswap V3-style exactInputSingle for StableClubSwapRouter regressions.
contract MockUniV3ExactInputRouter {
    using SafeERC20 for IERC20;

    uint256 public rateE18;

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function setRateE18(uint256 rateE18_) external {
        rateE18 = rateE18_;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external returns (uint256 amountOut) {
        amountOut = (params.amountIn * rateE18) / 1e18;
        require(amountOut >= params.amountOutMinimum, "slip");
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }
}
