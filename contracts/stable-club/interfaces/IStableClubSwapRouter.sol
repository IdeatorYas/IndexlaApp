// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StableClubSwapRouter} from "../StableClubSwapRouter.sol";

interface IStableClubSwapRouter {
    function executeExactInput(
        bytes32 routeId,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external returns (uint256 amountOut);

    function getRoute(bytes32 routeId) external view returns (StableClubSwapRouter.RouteConfig memory);
}
