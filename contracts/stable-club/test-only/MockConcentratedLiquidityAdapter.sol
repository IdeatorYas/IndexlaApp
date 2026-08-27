// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {IConcentratedLiquidityAdapter} from "../interfaces/IConcentratedLiquidityAdapter.sol";

/// @title MockConcentratedLiquidityAdapter — TEST ONLY concentrated-LP NFT fixture for Step 2.
/// @dev This contract is both the position NFT and the adapter. User must `approve(adapter, tokenId)`
///      (per-token) before harvest/compound/rebalance. Never uses setApprovalForAll internally.
contract MockConcentratedLiquidityAdapter is IConcentratedLiquidityAdapter, ERC721 {
    using SafeERC20 for IERC20;

    address public constant SIMULATED_NPM = address(0xBEeF);

    bytes32 public immutable override poolId;
    string private _protocol;
    address public immutable executor;
    uint256 private _nextId = 1;
    uint256 public dustLeaveBps;

    mapping(uint256 => uint128) public liquidityOf;
    mapping(uint256 => address) public token0Of;
    mapping(uint256 => address) public token1Of;
    mapping(uint256 => uint256) public amount0Of;
    mapping(uint256 => uint256) public amount1Of;

    error OnlyExecutor();
    error NotOwner();
    error TokenMismatch();
    error AdapterNotApprovedForPosition();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert OnlyExecutor();
        _;
    }

    constructor(address executor_, bytes32 poolId_, string memory protocol_)
        ERC721("INDEXLA Mock CL Position", "idxCL-TEST")
    {
        executor = executor_;
        poolId = poolId_;
        _protocol = protocol_;
    }

    function setDustLeaveBps(uint256 bps) external {
        require(bps <= 5_000, "dust");
        dustLeaveBps = bps;
    }

    function protocol() external view returns (string memory) {
        return _protocol;
    }

    function positionManager() external view returns (address) {
        return address(this);
    }

    function ownerOf(uint256 tokenId) public view override(ERC721, IConcentratedLiquidityAdapter) returns (address) {
        return ERC721.ownerOf(tokenId);
    }

    function positionTokens(uint256 tokenId) external view returns (address token0, address token1) {
        token0 = token0Of[tokenId];
        token1 = token1Of[tokenId];
    }

    function positionAmounts(uint256 tokenId) external view returns (uint256 amount0, uint256 amount1) {
        return (amount0Of[tokenId], amount1Of[tokenId]);
    }

    function mintPosition(
        address lpOwner,
        address tokenA,
        address tokenB,
        int24,
        int24,
        uint256 amountA,
        uint256 amountB,
        uint256,
        uint256
    ) external onlyExecutor returns (uint256 tokenId, uint128 liquidity) {
        (address token0, address token1, uint256 amount0, uint256 amount1) = _sort(tokenA, tokenB, amountA, amountB);

        if (amount0 > 0) IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
        if (amount0 > 0) IERC20(token0).forceApprove(SIMULATED_NPM, amount0);
        if (amount1 > 0) IERC20(token1).forceApprove(SIMULATED_NPM, amount1);

        uint256 dust0 = (amount0 * dustLeaveBps) / 10_000;
        uint256 dust1 = (amount1 * dustLeaveBps) / 10_000;
        uint256 used0 = amount0 - dust0;
        uint256 used1 = amount1 - dust1;

        tokenId = _nextId++;
        liquidity = uint128(used0 + used1);
        liquidityOf[tokenId] = liquidity;
        token0Of[tokenId] = token0;
        token1Of[tokenId] = token1;
        amount0Of[tokenId] = used0;
        amount1Of[tokenId] = used1;
        _mint(lpOwner, tokenId);

        if (dust0 > 0) IERC20(token0).safeTransfer(lpOwner, dust0);
        if (dust1 > 0) IERC20(token1).safeTransfer(lpOwner, dust1);
        _clearApproval(token0, SIMULATED_NPM);
        _clearApproval(token1, SIMULATED_NPM);
    }

    function increaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256,
        uint256
    ) external onlyExecutor returns (uint128 liquidity) {
        _requireAdapterApproval(tokenId, lpOwner);
        address token0 = token0Of[tokenId];
        address token1 = token1Of[tokenId];
        (uint256 amount0, uint256 amount1) = _mapTo01(tokenA, tokenB, token0, token1, amountA, amountB);

        if (amount0 > 0) IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
        if (amount0 > 0) IERC20(token0).forceApprove(SIMULATED_NPM, amount0);
        if (amount1 > 0) IERC20(token1).forceApprove(SIMULATED_NPM, amount1);

        uint256 dust0 = (amount0 * dustLeaveBps) / 10_000;
        uint256 dust1 = (amount1 * dustLeaveBps) / 10_000;
        uint256 used0 = amount0 - dust0;
        uint256 used1 = amount1 - dust1;
        liquidity = uint128(used0 + used1);
        liquidityOf[tokenId] += liquidity;
        amount0Of[tokenId] += used0;
        amount1Of[tokenId] += used1;

        if (dust0 > 0) IERC20(token0).safeTransfer(lpOwner, dust0);
        if (dust1 > 0) IERC20(token1).safeTransfer(lpOwner, dust1);
        _clearApproval(token0, SIMULATED_NPM);
        _clearApproval(token1, SIMULATED_NPM);
    }

    function decreaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        address tokenA,
        address tokenB,
        uint128 liquidity,
        uint256,
        uint256
    ) external onlyExecutor returns (uint256 amountA, uint256 amountB) {
        _requireAdapterApproval(tokenId, lpOwner);
        require(liquidityOf[tokenId] >= liquidity, "liq");
        liquidityOf[tokenId] -= liquidity;
        uint256 amount0 = uint256(liquidity) / 2;
        uint256 amount1 = uint256(liquidity) - amount0;
        if (amount0Of[tokenId] >= amount0) amount0Of[tokenId] -= amount0;
        else amount0Of[tokenId] = 0;
        if (amount1Of[tokenId] >= amount1) amount1Of[tokenId] -= amount1;
        else amount1Of[tokenId] = 0;
        IERC20(token0Of[tokenId]).safeTransfer(lpOwner, amount0);
        IERC20(token1Of[tokenId]).safeTransfer(lpOwner, amount1);
        (amountA, amountB) = _mapFrom01(tokenA, tokenB, token0Of[tokenId], token1Of[tokenId], amount0, amount1);
    }

    function collectFees(address lpOwner, uint256 tokenId)
        external
        onlyExecutor
        returns (uint256 amountA, uint256 amountB)
    {
        _requireAdapterApproval(tokenId, lpOwner);
        amountA = 1e6;
        amountB = 1e6;
        if (IERC20(token0Of[tokenId]).balanceOf(address(this)) >= amountA) {
            IERC20(token0Of[tokenId]).safeTransfer(lpOwner, amountA);
        } else {
            amountA = 0;
        }
        if (IERC20(token1Of[tokenId]).balanceOf(address(this)) >= amountB) {
            IERC20(token1Of[tokenId]).safeTransfer(lpOwner, amountB);
        } else {
            amountB = 0;
        }
    }

    function collectRewards(address, uint256) external pure returns (uint256 amount) {
        return 0;
    }

    function closePosition(
        address lpOwner,
        uint256 tokenId,
        address tokenA,
        address tokenB,
        uint256,
        uint256
    ) external onlyExecutor returns (uint256 amountA, uint256 amountB) {
        _requireAdapterApproval(tokenId, lpOwner);
        uint256 amount0 = amount0Of[tokenId];
        uint256 amount1 = amount1Of[tokenId];
        liquidityOf[tokenId] = 0;
        amount0Of[tokenId] = 0;
        amount1Of[tokenId] = 0;
        IERC20(token0Of[tokenId]).safeTransfer(lpOwner, amount0);
        IERC20(token1Of[tokenId]).safeTransfer(lpOwner, amount1);
        (amountA, amountB) = _mapFrom01(tokenA, tokenB, token0Of[tokenId], token1Of[tokenId], amount0, amount1);
        _burn(tokenId);
    }

    function swap(address, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut)
        external
        onlyExecutor
        returns (uint256 amountOut)
    {
        amountOut = amountIn;
        require(amountOut >= minAmountOut, "slip");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(SIMULATED_NPM, amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
        _clearApproval(tokenIn, SIMULATED_NPM);
    }

    function _requireAdapterApproval(uint256 tokenId, address lpOwner) internal view {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        // Per-token approve(adapter, tokenId) required. Do not call setApprovalForAll.
        if (getApproved(tokenId) != address(this) && !isApprovedForAll(lpOwner, address(this))) {
            revert AdapterNotApprovedForPosition();
        }
    }

    function _sort(address tokenA, address tokenB, uint256 amountA, uint256 amountB)
        internal
        pure
        returns (address token0, address token1, uint256 amount0, uint256 amount1)
    {
        if (tokenA == tokenB) revert TokenMismatch();
        if (tokenA < tokenB) return (tokenA, tokenB, amountA, amountB);
        return (tokenB, tokenA, amountB, amountA);
    }

    function _mapTo01(
        address tokenA,
        address tokenB,
        address token0,
        address token1,
        uint256 amountA,
        uint256 amountB
    ) internal pure returns (uint256 amount0, uint256 amount1) {
        if (tokenA == token0 && tokenB == token1) return (amountA, amountB);
        if (tokenA == token1 && tokenB == token0) return (amountB, amountA);
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

    function _clearApproval(address token, address spender) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            IERC20(token).forceApprove(spender, 0);
        }
    }
}
