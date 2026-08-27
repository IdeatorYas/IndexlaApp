// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {IConcentratedLiquidityAdapter} from "../interfaces/IConcentratedLiquidityAdapter.sol";

/// @dev Minimal Uniswap V3 NonfungiblePositionManager surface used by INDEXLA.
interface IUniswapV3NPM {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
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
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
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

/// @title UniswapV3Adapter — Base Uniswap V3 concentrated liquidity adapter (Step 2).
/// @notice Position NFTs are minted to the user. INDEXLA never retains the NFT after execution.
contract UniswapV3Adapter is IConcentratedLiquidityAdapter {
    using SafeERC20 for IERC20;

    bytes32 public immutable override poolId;
    address public immutable executor;
    address public immutable npm;
    address public immutable swapRouter;
    uint24 public immutable fee;

    error OnlyExecutor();
    error NotOwner();
    error TokenOrder();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert OnlyExecutor();
        _;
    }

    constructor(
        address executor_,
        bytes32 poolId_,
        address npm_,
        address swapRouter_,
        uint24 fee_
    ) {
        executor = executor_;
        poolId = poolId_;
        npm = npm_;
        swapRouter = swapRouter_;
        fee = fee_;
    }

    function protocol() external pure returns (string memory) {
        return "uniswap-v3";
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        return IERC721(npm).ownerOf(tokenId);
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

        if (amount0 > 0) IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
        if (amount0 > 0) IERC20(token0).forceApprove(npm, amount0);
        if (amount1 > 0) IERC20(token1).forceApprove(npm, amount1);

        (tokenId, liquidity, , ) = IUniswapV3NPM(npm).mint(
            IUniswapV3NPM.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                recipient: lpOwner,
                deadline: block.timestamp
            })
        );
    }

    function increaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin
    ) external onlyExecutor returns (uint128 liquidity) {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        (, , address token0, address token1, , , , , , , , ) = IUniswapV3NPM(npm).positions(tokenId);
        ( , , uint256 amount0, uint256 amount1, uint256 amount0Min, uint256 amount1Min) =
            _sort(token0, token1, amountA, amountB, amountAMin, amountBMin);

        if (amount0 > 0) IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
        if (amount0 > 0) IERC20(token0).forceApprove(npm, amount0);
        if (amount1 > 0) IERC20(token1).forceApprove(npm, amount1);

        (liquidity, , ) = IUniswapV3NPM(npm).increaseLiquidity(
            IUniswapV3NPM.IncreaseLiquidityParams({
                tokenId: tokenId,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: block.timestamp
            })
        );
    }

    function decreaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        uint128 liquidity,
        uint256 amountAMin,
        uint256 amountBMin
    ) external onlyExecutor returns (uint256 amountA, uint256 amountB) {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        (amountA, amountB) = IUniswapV3NPM(npm).decreaseLiquidity(
            IUniswapV3NPM.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: amountAMin,
                amount1Min: amountBMin,
                deadline: block.timestamp
            })
        );
        _collectTo(lpOwner, tokenId);
    }

    function collectFees(address lpOwner, uint256 tokenId)
        external
        onlyExecutor
        returns (uint256 amountA, uint256 amountB)
    {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        return _collectTo(lpOwner, tokenId);
    }

    function collectRewards(address, uint256) external pure returns (uint256) {
        return 0; // Uniswap V3 has no separate AERO-style reward claim on the NPM.
    }

    function closePosition(address lpOwner, uint256 tokenId, uint256 amountAMin, uint256 amountBMin)
        external
        onlyExecutor
        returns (uint256 amountA, uint256 amountB)
    {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        (, , , , , , , uint128 liquidity, , , , ) = IUniswapV3NPM(npm).positions(tokenId);
        if (liquidity > 0) {
            (amountA, amountB) = IUniswapV3NPM(npm).decreaseLiquidity(
                IUniswapV3NPM.DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: liquidity,
                    amount0Min: amountAMin,
                    amount1Min: amountBMin,
                    deadline: block.timestamp
                })
            );
        }
        _collectTo(lpOwner, tokenId);
        IUniswapV3NPM(npm).burn(tokenId);
    }

    function swap(address, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        external
        onlyExecutor
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(swapRouter, amountIn);
        amountOut = IUniswapV3SwapRouter(swapRouter).exactInputSingle(
            IUniswapV3SwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: msg.sender,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _collectTo(address recipient, uint256 tokenId) internal returns (uint256 amount0, uint256 amount1) {
        return IUniswapV3NPM(npm).collect(
            IUniswapV3NPM.CollectParams({
                tokenId: tokenId,
                recipient: recipient,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
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
