// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {IConcentratedLiquidityAdapter} from "../interfaces/IConcentratedLiquidityAdapter.sol";
import {ClNpmPositionValue} from "../libraries/ClNpmPositionValue.sol";

/// @dev Aerodrome Slipstream NPM is Uniswap-V3-like with tickSpacing instead of fee in mint.
interface IAerodromeSlipstreamNPM {
    struct MintParams {
        address token0;
        address token1;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
        uint160 sqrtPriceX96;
    }

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1);

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function burn(uint256 tokenId) external payable;

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            int24 tickSpacing,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
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

/// @title AerodromeSlipstreamAdapter — Base Aerodrome Slipstream CL adapter (Step 2).
/// @notice Position NFTs are minted to the user. INDEXLA never retains the NFT after execution.
/// @dev User must `npm.approve(adapter, tokenId)` (per-token) before harvest/compound/rebalance.
contract AerodromeSlipstreamAdapter is IConcentratedLiquidityAdapter {
    using SafeERC20 for IERC20;

    bytes32 public immutable override poolId;
    address public immutable executor;
    address public immutable npm;
    address public immutable swapRouter;
    address public immutable pool;
    address public immutable factory;
    int24 public immutable tickSpacing;
    address public gauge; // optional AERO reward gauge; may be address(0)

    error OnlyExecutor();
    error NotOwner();
    error TokenOrder();
    error TokenMismatch();
    error AdapterNotApprovedForPosition();
    error InvalidPool();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert OnlyExecutor();
        _;
    }

    constructor(
        address executor_,
        bytes32 poolId_,
        address npm_,
        address swapRouter_,
        address pool_,
        address factory_,
        int24 tickSpacing_,
        address gauge_
    ) {
        if (pool_ == address(0) || factory_ == address(0)) revert InvalidPool();
        executor = executor_;
        poolId = poolId_;
        npm = npm_;
        swapRouter = swapRouter_;
        pool = pool_;
        factory = factory_;
        tickSpacing = tickSpacing_;
        gauge = gauge_;
    }

    function protocol() external pure returns (string memory) {
        return "aerodrome-slipstream";
    }

    function positionManager() external view returns (address) {
        return npm;
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        return IERC721(npm).ownerOf(tokenId);
    }

    function positionTokens(uint256 tokenId) external view returns (address token0, address token1) {
        (, , token0, token1, , , , , , , , ) = IAerodromeSlipstreamNPM(npm).positions(tokenId);
    }

    function positionAmounts(uint256 tokenId) external view returns (uint256 amount0, uint256 amount1) {
        _requirePoolIdentity(tokenId);
        (
            ,
            ,
            address token0,
            address token1,
            ,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            ,
            ,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        ) = IAerodromeSlipstreamNPM(npm).positions(tokenId);
        return ClNpmPositionValue.amountsFromLiquidity(
            pool, token0, token1, tickLower, tickUpper, liquidity, tokensOwed0, tokensOwed1
        );
    }

    function mintPosition(
        address lpOwner,
        address tokenA,
        address tokenB,
        int24 tickLower,
        int24 tickUpper,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin
    ) external onlyExecutor returns (uint256 tokenId, uint128 liquidity) {
        (address token0, address token1, uint256 amount0, uint256 amount1, uint256 amount0Min, uint256 amount1Min) =
            _sort(tokenA, tokenB, amountA, amountB, amountAMin, amountBMin);

        // SC-03: factory must resolve this adapter's configured pool before any approval/mint.
        ClNpmPositionValue.requireAeroPoolIdentity(
            factory, pool, token0, token1, tickSpacing, tickSpacing
        );

        if (amount0 > 0) IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
        if (amount0 > 0) IERC20(token0).forceApprove(npm, amount0);
        if (amount1 > 0) IERC20(token1).forceApprove(npm, amount1);

        (tokenId, liquidity, , ) = IAerodromeSlipstreamNPM(npm).mint(
            IAerodromeSlipstreamNPM.MintParams({
                token0: token0,
                token1: token1,
                tickSpacing: tickSpacing,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                recipient: lpOwner,
                deadline: block.timestamp,
                sqrtPriceX96: 0
            })
        );
        _refundDust(token0, lpOwner);
        _refundDust(token1, lpOwner);
        _clearApproval(token0, npm);
        _clearApproval(token1, npm);
    }

    function increaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin
    ) external onlyExecutor returns (uint128 liquidity) {
        _requirePoolIdentity(tokenId);
        _requireNpmApproval(tokenId, lpOwner);
        (, , address token0, address token1, , , , , , , , ) = IAerodromeSlipstreamNPM(npm).positions(tokenId);
        (uint256 amount0, uint256 amount1, uint256 amount0Min, uint256 amount1Min) =
            _mapTo01(tokenA, tokenB, token0, token1, amountA, amountB, amountAMin, amountBMin);

        if (amount0 > 0) IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
        if (amount0 > 0) IERC20(token0).forceApprove(npm, amount0);
        if (amount1 > 0) IERC20(token1).forceApprove(npm, amount1);

        (liquidity, , ) = IAerodromeSlipstreamNPM(npm).increaseLiquidity(
            IAerodromeSlipstreamNPM.IncreaseLiquidityParams({
                tokenId: tokenId,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: block.timestamp
            })
        );
        _refundDust(token0, lpOwner);
        _refundDust(token1, lpOwner);
        _clearApproval(token0, npm);
        _clearApproval(token1, npm);
    }

    function decreaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        address tokenA,
        address tokenB,
        uint128 liquidity,
        uint256 amountAMin,
        uint256 amountBMin
    ) external onlyExecutor returns (uint256 amountA, uint256 amountB) {
        _requirePoolIdentity(tokenId);
        _requireNpmApproval(tokenId, lpOwner);
        (, , address token0, address token1, , , , , , , , ) = IAerodromeSlipstreamNPM(npm).positions(tokenId);
        (, , uint256 amount0Min, uint256 amount1Min) =
            _mapTo01(tokenA, tokenB, token0, token1, 0, 0, amountAMin, amountBMin);

        (uint256 amount0, uint256 amount1) = IAerodromeSlipstreamNPM(npm).decreaseLiquidity(
            IAerodromeSlipstreamNPM.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: block.timestamp
            })
        );
        _collectTo(lpOwner, tokenId);
        (amountA, amountB) = _mapFrom01(tokenA, tokenB, token0, token1, amount0, amount1);
    }

    function collectFees(address lpOwner, uint256 tokenId)
        external
        onlyExecutor
        returns (uint256 amountA, uint256 amountB)
    {
        _requirePoolIdentity(tokenId);
        _requireNpmApproval(tokenId, lpOwner);
        (amountA, amountB) = _collectTo(lpOwner, tokenId);
    }

    function collectRewards(address lpOwner, uint256 tokenId) external onlyExecutor returns (uint256 amount) {
        _requirePoolIdentity(tokenId);
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        if (gauge == address(0)) return 0;
        // Gauge claim is protocol-specific; Step 2 wires the address and requires allowlisted calls only.
        // Concrete gauge ABI varies by deployment — leave as no-op until gauge adapter is approved per pool.
        amount = 0;
    }

    function closePosition(
        address lpOwner,
        uint256 tokenId,
        address tokenA,
        address tokenB,
        uint256 amountAMin,
        uint256 amountBMin
    ) external onlyExecutor returns (uint256 amountA, uint256 amountB) {
        _requirePoolIdentity(tokenId);
        _requireNpmApproval(tokenId, lpOwner);
        (, , address token0, address token1, , , , uint128 liquidity, , , , ) =
            IAerodromeSlipstreamNPM(npm).positions(tokenId);
        (, , uint256 amount0Min, uint256 amount1Min) =
            _mapTo01(tokenA, tokenB, token0, token1, 0, 0, amountAMin, amountBMin);

        uint256 amount0;
        uint256 amount1;
        if (liquidity > 0) {
            (amount0, amount1) = IAerodromeSlipstreamNPM(npm).decreaseLiquidity(
                IAerodromeSlipstreamNPM.DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: liquidity,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp
                })
            );
        }
        _collectTo(lpOwner, tokenId);
        IAerodromeSlipstreamNPM(npm).burn(tokenId);
        (amountA, amountB) = _mapFrom01(tokenA, tokenB, token0, token1, amount0, amount1);
    }

    function swap(address, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        external
        onlyExecutor
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(swapRouter, amountIn);
        amountOut = IAerodromeSwapRouter(swapRouter).exactInputSingle(
            IAerodromeSwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                tickSpacing: tickSpacing,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
        _clearApproval(tokenIn, swapRouter);
    }

    /// @dev Shared fail-closed gate: NFT tickSpacing + factory pool must match this adapter before any mutation.
    function _requirePoolIdentity(uint256 tokenId) internal view {
        (, , address token0, address token1, int24 positionTickSpacing, , , , , , , ) =
            IAerodromeSlipstreamNPM(npm).positions(tokenId);
        ClNpmPositionValue.requireAeroPoolIdentity(
            factory, pool, token0, token1, tickSpacing, positionTickSpacing
        );
    }

    function _requireNpmApproval(uint256 tokenId, address lpOwner) internal view {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        // Prefer per-token `npm.approve(adapter, tokenId)`. Do not call setApprovalForAll here.
        if (
            IERC721(npm).getApproved(tokenId) != address(this)
                && !IERC721(npm).isApprovedForAll(lpOwner, address(this))
        ) {
            revert AdapterNotApprovedForPosition();
        }
    }

    function _collectTo(address recipient, uint256 tokenId) internal returns (uint256 amount0, uint256 amount1) {
        return IAerodromeSlipstreamNPM(npm).collect(
            IAerodromeSlipstreamNPM.CollectParams({
                tokenId: tokenId,
                recipient: recipient,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
    }

    function _refundDust(address token, address to) internal {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).safeTransfer(to, bal);
    }

    function _clearApproval(address token, address spender) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            IERC20(token).forceApprove(spender, 0);
        }
    }

    function _mapTo01(
        address tokenA,
        address tokenB,
        address token0,
        address token1,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal pure returns (uint256 amount0, uint256 amount1, uint256 amount0Min, uint256 amount1Min) {
        if (tokenA == token0 && tokenB == token1) {
            return (amountA, amountB, amountAMin, amountBMin);
        }
        if (tokenA == token1 && tokenB == token0) {
            return (amountB, amountA, amountBMin, amountAMin);
        }
        revert TokenMismatch();
    }

    function _mapFrom01(
        address tokenA,
        address tokenB,
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1
    ) internal pure returns (uint256 amountA, uint256 amountB) {
        if (tokenA == token0 && tokenB == token1) return (amount0, amount1);
        if (tokenA == token1 && tokenB == token0) return (amount1, amount0);
        revert TokenMismatch();
    }

    function _sort(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin
    )
        internal
        pure
        returns (
            address token0,
            address token1,
            uint256 amount0,
            uint256 amount1,
            uint256 amount0Min,
            uint256 amount1Min
        )
    {
        if (tokenA == tokenB) revert TokenOrder();
        if (tokenA < tokenB) {
            return (tokenA, tokenB, amountA, amountB, amountAMin, amountBMin);
        }
        return (tokenB, tokenA, amountB, amountA, amountBMin, amountAMin);
    }
}
