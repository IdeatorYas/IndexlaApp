// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockTwoOfThreeSafe — TEST ONLY threshold wallet for governance unit tests.
/// @dev Models Safe-style N-of-M confirmations without importing Safe contracts.
///      Never used in production deploy scripts.
contract MockTwoOfThreeSafe {
    address[] public owners;
    uint256 public threshold;
    mapping(address => bool) public isOwner;
    mapping(bytes32 => mapping(address => bool)) public confirmed;
    mapping(bytes32 => uint256) public confirmationCount;
    mapping(bytes32 => bool) public executed;

    error NotOwner();
    error AlreadyConfirmed();
    error AlreadyExecuted();
    error ThresholdNotMet();
    error CallFailed();
    error InvalidSetup();

    event Confirmed(bytes32 indexed txHash, address indexed owner);
    event Executed(bytes32 indexed txHash, address to, uint256 value, bytes data);

    constructor(address[] memory owners_, uint256 threshold_) {
        if (owners_.length == 0 || threshold_ == 0 || threshold_ > owners_.length) {
            revert InvalidSetup();
        }
        threshold = threshold_;
        for (uint256 i = 0; i < owners_.length; i++) {
            address o = owners_[i];
            if (o == address(0) || isOwner[o]) revert InvalidSetup();
            isOwner[o] = true;
            owners.push(o);
        }
    }

    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function getThreshold() external view returns (uint256) {
        return threshold;
    }

    function txHash(address to, uint256 value, bytes memory data, uint256 nonce)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(to, value, data, nonce));
    }

    function confirm(bytes32 hash) external {
        if (!isOwner[msg.sender]) revert NotOwner();
        if (executed[hash]) revert AlreadyExecuted();
        if (confirmed[hash][msg.sender]) revert AlreadyConfirmed();
        confirmed[hash][msg.sender] = true;
        confirmationCount[hash] += 1;
        emit Confirmed(hash, msg.sender);
    }

    function execute(address to, uint256 value, bytes memory data, uint256 nonce) external {
        bytes32 hash = txHash(to, value, data, nonce);
        if (executed[hash]) revert AlreadyExecuted();
        if (confirmationCount[hash] < threshold) revert ThresholdNotMet();
        executed[hash] = true;
        (bool ok, ) = to.call{value: value}(data);
        if (!ok) revert CallFailed();
        emit Executed(hash, to, value, data);
    }
}
