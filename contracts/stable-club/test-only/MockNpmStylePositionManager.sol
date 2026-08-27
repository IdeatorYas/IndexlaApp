// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title MockNpmStylePositionManager — TEST ONLY Uniswap-NPM-compatible ERC721.
/// @notice Supports per-token `approve(spender, tokenId)` / `getApproved` / `isApprovedForAll`.
contract MockNpmStylePositionManager is ERC721 {
    uint256 private _nextId = 1;
    address public minter;

    error OnlyMinter();

    constructor() ERC721("INDEXLA Mock NPM", "idxNPM-TEST") {
        minter = msg.sender;
    }

    function setMinter(address minter_) external {
        require(msg.sender == minter, "auth");
        minter = minter_;
    }

    function mint(address to) external returns (uint256 tokenId) {
        if (msg.sender != minter) revert OnlyMinter();
        tokenId = _nextId++;
        _mint(to, tokenId);
    }
}
