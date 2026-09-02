// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {StableClubSwapRouter} from "../StableClubSwapRouter.sol";

/// @title MockSwapRouter — TEST ONLY fixed-rate USDC swaps for Phase 2a unit tests.
contract MockSwapRouter {
    using SafeERC20 for IERC20;

    address public owner;
    mapping(address => bool) public approvedExecutors;
    mapping(bytes32 => StableClubSwapRouter.RouteConfig) public routes;
    mapping(bytes32 => uint256) public rateE18;

    error Unauthorized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setExecutorApproved(address executor, bool approved) external onlyOwner {
        approvedExecutors[executor] = approved;
    }

    function configureRoute(bytes32 routeId, StableClubSwapRouter.RouteConfig calldata config) external onlyOwner {
        routes[routeId] = config;
    }

    function setRate(bytes32 routeId, uint256 rateE18_) external onlyOwner {
        rateE18[routeId] = rateE18_;
    }

    function getRoute(bytes32 routeId) external view returns (StableClubSwapRouter.RouteConfig memory) {
        return routes[routeId];
    }

    function executeExactInput(
        bytes32 routeId,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256
    ) external returns (uint256 amountOut) {
        require(approvedExecutors[msg.sender], "executor");
        StableClubSwapRouter.RouteConfig memory route = routes[routeId];
        require(route.enabled, "disabled");
        uint256 rate = rateE18[routeId];
        require(rate > 0, "rate");
        amountOut = (amountIn * rate) / 1e18;
        require(amountOut >= minAmountOut, "slip");
        IERC20(route.tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(route.tokenOut).safeTransfer(msg.sender, amountOut);
    }
}
