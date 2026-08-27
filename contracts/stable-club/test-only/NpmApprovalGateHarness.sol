// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title NpmApprovalGateHarness — TEST ONLY mirror of Uni/Aero adapter NPM approval gate.
/// @dev Does not call setApprovalForAll; requires per-token approve or preexisting operator approval.
contract NpmApprovalGateHarness {
    address public immutable npm;

    error AdapterNotApprovedForPosition();
    error NotOwner();

    constructor(address npm_) {
        npm = npm_;
    }

    function requireNpmApproval(uint256 tokenId, address lpOwner) external view {
        if (IERC721(npm).ownerOf(tokenId) != lpOwner) revert NotOwner();
        if (
            IERC721(npm).getApproved(tokenId) != address(this)
                && !IERC721(npm).isApprovedForAll(lpOwner, address(this))
        ) {
            revert AdapterNotApprovedForPosition();
        }
    }
}
