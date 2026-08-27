// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {IConcentratedLiquidityAdapter} from "../interfaces/IConcentratedLiquidityAdapter.sol";

/// @title MockConcentratedLiquidityAdapter — TEST ONLY concentrated-LP NFT fixture for Step 2.
contract MockConcentratedLiquidityAdapter is IConcentratedLiquidityAdapter, ERC721 {
    using SafeERC20 for IERC20;

    /// @dev Simulated NPM/spender used to prove approvals are cleared after mint/increase (H4).
    address public constant SIMULATED_NPM = address(0xBEeF);

    bytes32 public immutable override poolId;
    string private _protocol;
    address public immutable executor;
    uint256 private _nextId = 1;
    /// @notice Fraction of pulled tokens left as residual then refunded to LP owner (bps).
    uint256 public dustLeaveBps;

    mapping(uint256 => uint128) public liquidityOf;
    mapping(uint256 => address) public token0Of;
    mapping(uint256 => address) public token1Of;

    error OnlyExecutor();
    error NotOwner();

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

    function ownerOf(uint256 tokenId) public view override(ERC721, IConcentratedLiquidityAdapter) returns (address) {
        return ERC721.ownerOf(tokenId);
    }

    function positionTokens(uint256 tokenId) external view returns (address token0, address token1) {
        token0 = token0Of[tokenId];
        token1 = token1Of[tokenId];
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
        if (amountA > 0) IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        if (amountB > 0) IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);
        if (amountA > 0) IERC20(tokenA).forceApprove(SIMULATED_NPM, amountA);
        if (amountB > 0) IERC20(tokenB).forceApprove(SIMULATED_NPM, amountB);

        uint256 dustA = (amountA * dustLeaveBps) / 10_000;
        uint256 dustB = (amountB * dustLeaveBps) / 10_000;
        uint256 usedA = amountA - dustA;
        uint256 usedB = amountB - dustB;

        tokenId = _nextId++;
        liquidity = uint128(usedA + usedB);
        liquidityOf[tokenId] = liquidity;
        token0Of[tokenId] = tokenA;
        token1Of[tokenId] = tokenB;
        _mint(lpOwner, tokenId);

        if (dustA > 0) IERC20(tokenA).safeTransfer(lpOwner, dustA);
        if (dustB > 0) IERC20(tokenB).safeTransfer(lpOwner, dustB);
        _clearApproval(tokenA, SIMULATED_NPM);
        _clearApproval(tokenB, SIMULATED_NPM);
    }

    function increaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        uint256 amountA,
        uint256 amountB,
        uint256,
        uint256
    ) external onlyExecutor returns (uint128 liquidity) {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        address tokenA_ = token0Of[tokenId];
        address tokenB_ = token1Of[tokenId];
        if (amountA > 0) IERC20(tokenA_).safeTransferFrom(msg.sender, address(this), amountA);
        if (amountB > 0) IERC20(tokenB_).safeTransferFrom(msg.sender, address(this), amountB);
        if (amountA > 0) IERC20(tokenA_).forceApprove(SIMULATED_NPM, amountA);
        if (amountB > 0) IERC20(tokenB_).forceApprove(SIMULATED_NPM, amountB);

        uint256 dustA = (amountA * dustLeaveBps) / 10_000;
        uint256 dustB = (amountB * dustLeaveBps) / 10_000;
        uint256 usedA = amountA - dustA;
        uint256 usedB = amountB - dustB;
        liquidity = uint128(usedA + usedB);
        liquidityOf[tokenId] += liquidity;

        if (dustA > 0) IERC20(tokenA_).safeTransfer(lpOwner, dustA);
        if (dustB > 0) IERC20(tokenB_).safeTransfer(lpOwner, dustB);
        _clearApproval(tokenA_, SIMULATED_NPM);
        _clearApproval(tokenB_, SIMULATED_NPM);
    }

    function decreaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        uint128 liquidity,
        uint256,
        uint256
    ) external onlyExecutor returns (uint256 amountA, uint256 amountB) {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        require(liquidityOf[tokenId] >= liquidity, "liq");
        liquidityOf[tokenId] -= liquidity;
        amountA = uint256(liquidity) / 2;
        amountB = uint256(liquidity) - amountA;
        IERC20(token0Of[tokenId]).safeTransfer(lpOwner, amountA);
        IERC20(token1Of[tokenId]).safeTransfer(lpOwner, amountB);
    }

    function collectFees(address lpOwner, uint256 tokenId)
        external
        onlyExecutor
        returns (uint256 amountA, uint256 amountB)
    {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
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

    function closePosition(address lpOwner, uint256 tokenId, uint256, uint256)
        external
        onlyExecutor
        returns (uint256 amountA, uint256 amountB)
    {
        if (ownerOf(tokenId) != lpOwner) revert NotOwner();
        uint128 liq = liquidityOf[tokenId];
        liquidityOf[tokenId] = 0;
        amountA = uint256(liq) / 2;
        amountB = uint256(liq) - amountA;
        IERC20(token0Of[tokenId]).safeTransfer(lpOwner, amountA);
        IERC20(token1Of[tokenId]).safeTransfer(lpOwner, amountB);
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

    function _clearApproval(address token, address spender) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            IERC20(token).forceApprove(spender, 0);
        }
    }
}
