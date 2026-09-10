// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {INpmPositionManager} from "../interfaces/INpmPositionManager.sol";

/// @title MockNpmPositionManager — TEST ONLY Uni/Aero-shaped NPM for gateway exit unit tests.
contract MockNpmPositionManager is ERC721, INpmPositionManager {
    using SafeERC20 for IERC20;

    struct Position {
        address token0;
        address token1;
        uint128 liquidity;
        uint256 amount0;
        uint256 amount1;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Position) public pos;
    mapping(uint256 => uint256) private _owed0;
    mapping(uint256 => uint256) private _owed1;

    error NotAuthorized();
    error InsufficientLiquidity();

    constructor() ERC721("Mock NPM", "mNPM") {}

    function mintPosition(
        address to,
        address token0,
        address token1,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    ) external returns (uint256 tokenId) {
        tokenId = _nextId++;
        _mint(to, tokenId);
        pos[tokenId] = Position({
            token0: token0,
            token1: token1,
            liquidity: liquidity,
            amount0: amount0,
            amount1: amount1
        });
        if (amount0 > 0) IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
    }

    function ownerOf(uint256 tokenId)
        public
        view
        override(ERC721, INpmPositionManager)
        returns (address)
    {
        return ERC721.ownerOf(tokenId);
    }

    function getApproved(uint256 tokenId)
        public
        view
        override(ERC721, INpmPositionManager)
        returns (address)
    {
        return ERC721.getApproved(tokenId);
    }

    function isApprovedForAll(address owner, address operator)
        public
        view
        override(ERC721, INpmPositionManager)
        returns (bool)
    {
        return ERC721.isApprovedForAll(owner, operator);
    }

    function _isOperatorOrOwner(address owner, uint256 tokenId) internal view returns (bool) {
        return msg.sender == owner || getApproved(tokenId) == msg.sender
            || isApprovedForAll(owner, msg.sender);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        address owner = ownerOf(params.tokenId);
        if (!_isOperatorOrOwner(owner, params.tokenId)) revert NotAuthorized();
        Position storage p = pos[params.tokenId];
        if (params.liquidity > p.liquidity) revert InsufficientLiquidity();
        amount0 = params.liquidity == p.liquidity
            ? p.amount0
            : (p.amount0 * params.liquidity) / p.liquidity;
        amount1 = params.liquidity == p.liquidity
            ? p.amount1
            : (p.amount1 * params.liquidity) / p.liquidity;
        p.liquidity -= params.liquidity;
        p.amount0 -= amount0;
        p.amount1 -= amount1;
        _owed0[params.tokenId] += amount0;
        _owed1[params.tokenId] += amount1;
    }

    function collect(CollectParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        address owner = ownerOf(params.tokenId);
        if (!_isOperatorOrOwner(owner, params.tokenId)) revert NotAuthorized();
        amount0 = _owed0[params.tokenId];
        amount1 = _owed1[params.tokenId];
        if (amount0 > params.amount0Max) amount0 = params.amount0Max;
        if (amount1 > params.amount1Max) amount1 = params.amount1Max;
        _owed0[params.tokenId] -= amount0;
        _owed1[params.tokenId] -= amount1;
        Position storage p = pos[params.tokenId];
        if (amount0 > 0) IERC20(p.token0).safeTransfer(params.recipient, amount0);
        if (amount1 > 0) IERC20(p.token1).safeTransfer(params.recipient, amount1);
    }

    function burn(uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        if (!_isOperatorOrOwner(owner, tokenId)) revert NotAuthorized();
        require(pos[tokenId].liquidity == 0, "liq");
        require(_owed0[tokenId] == 0 && _owed1[tokenId] == 0, "owed");
        delete pos[tokenId];
        _burn(tokenId);
    }
}
