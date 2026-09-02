// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StableClubSwapRouter — governance-allowlisted single-hop USDC swap routes (Phase 2a).
/// @notice Separates swap routing from CL liquidity adapters. No arbitrary calldata or targets.
contract StableClubSwapRouter {
    using SafeERC20 for IERC20;

    enum RouteKind {
        UniswapV3,
        AerodromeSlipstream
    }

    struct RouteConfig {
        RouteKind kind;
        address router;
        address factory;
        address pool;
        address tokenIn;
        address tokenOut;
        uint24 feeOrTickSpacing;
        bool enabled;
    }

    address public owner;
    mapping(address => bool) public approvedExecutors;
    mapping(bytes32 => RouteConfig) public routes;

    event OwnerTransferred(address indexed previous, address indexed next);
    event ExecutorApprovalUpdated(address indexed executor, bool approved);
    event RouteConfigured(bytes32 indexed routeId, address pool, address tokenOut, bool enabled);

    error Unauthorized();
    error ExecutorNotApproved();
    error RouteNotFound();
    error RouteDisabled();
    error InvalidRoute();
    error InvalidTokenIn();
    error PoolMismatch();
    error DeadlineExpired();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyApprovedExecutor() {
        if (!approvedExecutors[msg.sender]) revert ExecutorNotApproved();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert Unauthorized();
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    function setExecutorApproved(address executor, bool approved) external onlyOwner {
        if (executor == address(0)) revert Unauthorized();
        approvedExecutors[executor] = approved;
        emit ExecutorApprovalUpdated(executor, approved);
    }

    /// @notice Register or update a verified single-hop route (USDC → output token).
    function configureRoute(bytes32 routeId, RouteConfig calldata config) external onlyOwner {
        if (config.router == address(0) || config.factory == address(0) || config.pool == address(0)) {
            revert InvalidRoute();
        }
        if (config.tokenIn == address(0) || config.tokenOut == address(0)) revert InvalidRoute();
        if (config.tokenIn == config.tokenOut) revert InvalidRoute();
        _verifyFactoryPool(config);
        routes[routeId] = config;
        emit RouteConfigured(routeId, config.pool, config.tokenOut, config.enabled);
    }

    function setRouteEnabled(bytes32 routeId, bool enabled) external onlyOwner {
        RouteConfig storage route = routes[routeId];
        if (route.pool == address(0)) revert RouteNotFound();
        route.enabled = enabled;
        emit RouteConfigured(routeId, route.pool, route.tokenOut, enabled);
    }

    /// @dev Execute allowlisted exact-input single-hop swap; tokens must already be on the executor.
    function executeExactInput(
        bytes32 routeId,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external onlyApprovedExecutor returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (amountIn == 0 || minAmountOut == 0) revert InvalidRoute();

        RouteConfig memory route = routes[routeId];
        if (route.pool == address(0)) revert RouteNotFound();
        if (!route.enabled) revert RouteDisabled();
        _verifyFactoryPool(route);

        IERC20(route.tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(route.tokenIn).forceApprove(route.router, amountIn);

        if (route.kind == RouteKind.UniswapV3) {
            amountOut = _swapUni(route, amountIn, minAmountOut);
        } else {
            amountOut = _swapAero(route, amountIn, minAmountOut, deadline);
        }

        IERC20(route.tokenOut).safeTransfer(msg.sender, amountOut);
        _clearApproval(route.tokenIn, route.router);
        if (IERC20(route.tokenIn).balanceOf(address(this)) != 0) revert InvalidRoute();
        if (IERC20(route.tokenOut).balanceOf(address(this)) != 0) revert InvalidRoute();
    }

    function getRoute(bytes32 routeId) external view returns (RouteConfig memory) {
        return routes[routeId];
    }

    function _verifyFactoryPool(RouteConfig memory route) internal view {
        address resolved;
        if (route.kind == RouteKind.UniswapV3) {
            resolved = IUniswapV3Factory(route.factory).getPool(
                route.tokenIn, route.tokenOut, route.feeOrTickSpacing
            );
        } else {
            resolved = IAerodromeFactory(route.factory).getPool(
                route.tokenIn, route.tokenOut, int24(uint24(route.feeOrTickSpacing))
            );
        }
        if (resolved != route.pool) revert PoolMismatch();
    }

    function _swapUni(RouteConfig memory route, uint256 amountIn, uint256 minAmountOut)
        internal
        returns (uint256 amountOut)
    {
        amountOut = IUniswapV3SwapRouter(route.router).exactInputSingle(
            IUniswapV3SwapRouter.ExactInputSingleParams({
                tokenIn: route.tokenIn,
                tokenOut: route.tokenOut,
                fee: route.feeOrTickSpacing,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _swapAero(RouteConfig memory route, uint256 amountIn, uint256 minAmountOut, uint256 deadline)
        internal
        returns (uint256 amountOut)
    {
        amountOut = IAerodromeSwapRouter(route.router).exactInputSingle(
            IAerodromeSwapRouter.ExactInputSingleParams({
                tokenIn: route.tokenIn,
                tokenOut: route.tokenOut,
                tickSpacing: int24(uint24(route.feeOrTickSpacing)),
                recipient: address(this),
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _clearApproval(address token, address spender) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            IERC20(token).forceApprove(spender, 0);
        }
    }
}

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IAerodromeFactory {
    function getPool(address tokenA, address tokenB, int24 tickSpacing) external view returns (address pool);
}

interface IUniswapV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IAerodromeSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        int24 tickSpacing;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
