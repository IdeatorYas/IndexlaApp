// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev TEST ONLY — configurable CL pool + factory + NPM surfaces for identity regressions.
contract MockClPoolForValuation {
    address public token0;
    address public token1;
    uint160 public sqrtPriceX96;

    constructor(address token0_, address token1_, uint160 sqrtPriceX96_) {
        token0 = token0_;
        token1 = token1_;
        sqrtPriceX96 = sqrtPriceX96_;
    }

    function slot0()
        external
        view
        returns (uint160, int24, uint16, uint16, uint16, uint8, bool)
    {
        return (sqrtPriceX96, 0, 0, 0, 0, 0, true);
    }
}

contract MockUniV3FactoryForValuation {
    mapping(bytes32 => address) public pools;

    function setPool(address tokenA, address tokenB, uint24 fee, address pool) external {
        pools[keccak256(abi.encodePacked(tokenA, tokenB, fee))] = pool;
        pools[keccak256(abi.encodePacked(tokenB, tokenA, fee))] = pool;
    }

    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encodePacked(tokenA, tokenB, fee))];
    }
}

contract MockAeroFactoryForValuation {
    mapping(bytes32 => address) public pools;

    function setPool(address tokenA, address tokenB, int24 tickSpacing, address pool) external {
        pools[keccak256(abi.encodePacked(tokenA, tokenB, tickSpacing))] = pool;
        pools[keccak256(abi.encodePacked(tokenB, tokenA, tickSpacing))] = pool;
    }

    function getPool(address tokenA, address tokenB, int24 tickSpacing) external view returns (address) {
        return pools[keccak256(abi.encodePacked(tokenA, tokenB, tickSpacing))];
    }
}

/// @dev Minimal Uni-shaped NPM: only `positions` + ERC721 owner for valuation tests.
contract MockUniNpmForValuation {
    struct Pos {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
        address owner;
    }

    mapping(uint256 => Pos) public posOf;

    function setPosition(
        uint256 tokenId,
        address owner,
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint128 owed0,
        uint128 owed1
    ) external {
        posOf[tokenId] = Pos(token0, token1, fee, tickLower, tickUpper, liquidity, owed0, owed1, owner);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return posOf[tokenId].owner;
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96,
            address,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256,
            uint256,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Pos memory p = posOf[tokenId];
        return (0, address(0), p.token0, p.token1, p.fee, p.tickLower, p.tickUpper, p.liquidity, 0, 0, p.tokensOwed0, p.tokensOwed1);
    }
}

contract MockAeroNpmForValuation {
    struct Pos {
        address token0;
        address token1;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
        address owner;
    }

    mapping(uint256 => Pos) public posOf;

    function setPosition(
        uint256 tokenId,
        address owner,
        address token0,
        address token1,
        int24 tickSpacing,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint128 owed0,
        uint128 owed1
    ) external {
        posOf[tokenId] = Pos(token0, token1, tickSpacing, tickLower, tickUpper, liquidity, owed0, owed1, owner);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return posOf[tokenId].owner;
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96,
            address,
            address token0,
            address token1,
            int24 tickSpacing,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256,
            uint256,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Pos memory p = posOf[tokenId];
        return (
            0,
            address(0),
            p.token0,
            p.token1,
            p.tickSpacing,
            p.tickLower,
            p.tickUpper,
            p.liquidity,
            0,
            0,
            p.tokensOwed0,
            p.tokensOwed1
        );
    }
}
