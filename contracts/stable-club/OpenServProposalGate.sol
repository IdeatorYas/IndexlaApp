// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OpenServProposalGate — Step 2 untrusted proposal intake (no keys, no arbitrary calldata).
/// @notice OpenServ may only submit typed proposals that the Executor / keeper may later validate.
contract OpenServProposalGate {
    enum ProposedAction {
        Harvest,
        Compound,
        Rebalance,
        PauseAutomation,
        NotifyOnly
    }

    struct Proposal {
        uint256 chainId;
        address user;
        bytes32 permissionId;
        bytes32 poolId;
        address adapter;
        uint256 positionTokenId;
        ProposedAction action;
        uint256 executionNonce;
        uint256 deadline;
        bytes32 idempotencyKey;
        bytes32 reasonCode;
        uint256 observedValue;
        uint256 submittedAt;
        bool consumed;
        bool rejected;
    }

    /// @notice Publisher calldata — storage-only fields are set by the gate.
    struct ProposalInput {
        uint256 chainId;
        address user;
        bytes32 permissionId;
        bytes32 poolId;
        address adapter;
        uint256 positionTokenId;
        ProposedAction action;
        uint256 executionNonce;
        uint256 deadline;
        bytes32 idempotencyKey;
        bytes32 reasonCode;
        uint256 observedValue;
    }

    address public owner;
    address public openservPublisher;
    address public automationExecutor;
    bool public circuitBroken;
    uint256 public maxProposalsPerMinute = 60;
    uint256 public maxProposalsPerPosition = 20;
    uint256 public windowStart;
    uint256 public windowCount;
    uint256 public failedExecutionStreak;
    uint256 public autoBreakAfterFailures = 10;

    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => uint256) public positionProposalCount;
    mapping(bytes32 => bool) public idempotencyUsed;

    event OwnerTransferred(address indexed previous, address indexed next);
    event PublisherSet(address indexed publisher);
    event AutomationExecutorWired(address indexed executor);
    event ProposalSubmitted(bytes32 indexed proposalId, address indexed user, ProposedAction action);
    event ProposalConsumed(bytes32 indexed proposalId);
    event ProposalRejected(bytes32 indexed proposalId, bytes32 reason);
    event CircuitBroken(bool broken);

    error Unauthorized();
    error CircuitOpen();
    error DuplicateIdempotency();
    error RateLimited();
    error PositionLimit();
    error UnknownProposal();
    error AlreadyHandled();
    error InvalidProposalParams();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyPublisher() {
        if (msg.sender != openservPublisher) revert Unauthorized();
        _;
    }

    modifier onlyAutomationExecutor() {
        if (msg.sender != automationExecutor) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
        openservPublisher = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert Unauthorized();
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    function setPublisher(address publisher) external onlyOwner {
        openservPublisher = publisher;
        emit PublisherSet(publisher);
    }

    function wireAutomationExecutor(address executor_) external onlyOwner {
        if (executor_ == address(0)) revert Unauthorized();
        automationExecutor = executor_;
        emit AutomationExecutorWired(executor_);
    }

    function setCircuitBroken(bool broken) external onlyOwner {
        circuitBroken = broken;
        emit CircuitBroken(broken);
    }

    function setLimits(uint256 perMinute, uint256 perPosition, uint256 autoBreak) external onlyOwner {
        maxProposalsPerMinute = perMinute;
        maxProposalsPerPosition = perPosition;
        autoBreakAfterFailures = autoBreak;
    }

    function submitProposal(ProposalInput calldata p) external onlyPublisher returns (bytes32 proposalId) {
        if (circuitBroken) revert CircuitOpen();
        if (idempotencyUsed[p.idempotencyKey]) revert DuplicateIdempotency();
        if (p.chainId != block.chainid) revert InvalidProposalParams();
        if (p.user == address(0) || p.adapter == address(0)) revert InvalidProposalParams();
        if (p.executionNonce == 0) revert InvalidProposalParams();
        if (p.deadline <= block.timestamp) revert InvalidProposalParams();

        if (block.timestamp >= windowStart + 1 minutes) {
            windowStart = block.timestamp;
            windowCount = 0;
        }
        if (windowCount + 1 > maxProposalsPerMinute) revert RateLimited();

        bytes32 posKey = keccak256(abi.encode(p.user, p.poolId, p.positionTokenId));
        if (positionProposalCount[posKey] + 1 > maxProposalsPerPosition) revert PositionLimit();

        proposalId = keccak256(
            abi.encode(
                p.chainId,
                p.user,
                p.permissionId,
                p.poolId,
                p.adapter,
                p.positionTokenId,
                uint8(p.action),
                p.executionNonce,
                p.deadline,
                p.idempotencyKey
            )
        );

        Proposal storage stored = proposals[proposalId];
        if (stored.user != address(0)) revert DuplicateIdempotency();

        stored.chainId = p.chainId;
        stored.user = p.user;
        stored.permissionId = p.permissionId;
        stored.poolId = p.poolId;
        stored.adapter = p.adapter;
        stored.positionTokenId = p.positionTokenId;
        stored.action = p.action;
        stored.executionNonce = p.executionNonce;
        stored.deadline = p.deadline;
        stored.idempotencyKey = p.idempotencyKey;
        stored.reasonCode = p.reasonCode;
        stored.observedValue = p.observedValue;
        stored.submittedAt = block.timestamp;

        idempotencyUsed[p.idempotencyKey] = true;
        windowCount += 1;
        positionProposalCount[posKey] += 1;

        emit ProposalSubmitted(proposalId, p.user, p.action);
    }

    function markConsumed(bytes32 proposalId) external onlyOwner {
        _markConsumed(proposalId);
    }

    /// @notice Atomic success hook — only wired automation executor after successful harvest.
    function markConsumedByExecutor(bytes32 proposalId) external onlyAutomationExecutor {
        _markConsumed(proposalId);
    }

    function markRejected(bytes32 proposalId, bytes32 reason) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        if (p.user == address(0)) revert UnknownProposal();
        if (p.consumed || p.rejected) revert AlreadyHandled();
        p.rejected = true;
        _decrementPositionCount(p);
        failedExecutionStreak += 1;
        if (failedExecutionStreak >= autoBreakAfterFailures) {
            circuitBroken = true;
            emit CircuitBroken(true);
        }
        emit ProposalRejected(proposalId, reason);
    }

    function _markConsumed(bytes32 proposalId) internal {
        Proposal storage p = proposals[proposalId];
        if (p.user == address(0)) revert UnknownProposal();
        if (p.consumed || p.rejected) revert AlreadyHandled();
        p.consumed = true;
        _decrementPositionCount(p);
        failedExecutionStreak = 0;
        emit ProposalConsumed(proposalId);
    }

    function _decrementPositionCount(Proposal storage p) internal {
        bytes32 posKey = keccak256(abi.encode(p.user, p.poolId, p.positionTokenId));
        uint256 count = positionProposalCount[posKey];
        if (count > 0) {
            positionProposalCount[posKey] = count - 1;
        }
    }

    function getProposal(bytes32 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }
}
