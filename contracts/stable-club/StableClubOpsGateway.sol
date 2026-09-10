// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {IAllowanceTransfer} from "./interfaces/IAllowanceTransfer.sol";
import {INpmPositionManager} from "./interfaces/INpmPositionManager.sol";
import {StrategyPermissionRegistry} from "./StrategyPermissionRegistry.sol";
import {PermissionRegistry} from "./PermissionRegistry.sol";
import {StableClubConcentratedLiquidityExecutor} from "./StableClubConcentratedLiquidityExecutor.sol";
import {ClFivePoolDepositLib} from "./libraries/ClFivePoolDepositLib.sol";
import {ClFivePoolExitLib} from "./libraries/ClFivePoolExitLib.sol";
import {SafetyController} from "./SafetyController.sol";

/// @dev Minimal SwapRouter02 exactInputSingle surface (Base Uni V3 router).
interface ISwapRouter02ExactInputSingle {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @title StableClubOpsGateway — non-custodial deposit/withdraw orchestration (≤3 wallet prompts).
/// @notice LP NFTs stay user-owned. Gateway never retains residual non-dust balances after a call.
/// @dev Owned by Safe/Timelock. EIP-5792 batching is an app-layer progressive enhancement only.
contract StableClubOpsGateway is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    uint256 public constant MAX_PERMIT2_TTL = 30 minutes;
    uint128 public constant MAX_UINT128 = type(uint128).max;
    /// @dev Dust threshold for residual non-USDC fail-closed checks (raw token units).
    uint256 public constant RESIDUAL_DUST = 1;

    bytes32 public constant REGISTER_CONSENT_TYPEHASH = keccak256(
        "RegisterConsent(address user,bytes32 strategyId,uint256 chainId,uint256 nonce,uint256 deadline)"
    );

    StrategyPermissionRegistry public immutable strategyRegistry;
    StableClubConcentratedLiquidityExecutor public immutable clExecutor;
    SafetyController public immutable safetyController;
    IAllowanceTransfer public immutable permit2;
    address public immutable usdc;
    address public owner;

    address public swapRouter02;
    mapping(address => bool) public allowedNpm;
    mapping(address => bool) public trackedExitToken;
    address[] public trackedExitTokenList;
    mapping(address => uint256) public registerConsentNonce;
    bool public paused;

    struct NpmExitLeg {
        address npm;
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        bool burnIfEmpty;
    }

    struct ExitSwap {
        address tokenIn;
        uint24 fee;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    event OwnerTransferred(address indexed previous, address indexed next);
    event Paused(bool paused);
    event SwapRouter02Updated(address indexed router);
    event AllowedNpmUpdated(address indexed npm, bool allowed);
    event TrackedExitTokenUpdated(address indexed token, bool tracked);
    event GatewayDeposit(
        address indexed user, bytes32 indexed strategyId, uint256 grossUsdc, bool registered
    );
    event GatewayExitToUsdc(address indexed user, uint256 usdcOut, uint256 legCount);

    error Unauthorized();
    error GatewayPaused();
    error InvalidPermit2Ttl();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidSignature();
    error InvalidNpm();
    error NotPositionOwner();
    error GatewayNotOperator();
    error ResidualNonUsdc();
    error MinOutRequired();
    error InvalidSwapRouter();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert GatewayPaused();
        _;
    }

    constructor(
        address strategyRegistry_,
        address clExecutor_,
        address safetyController_,
        address permit2_,
        address usdc_,
        address swapRouter02_
    ) EIP712("StableClubOpsGateway", "1") {
        if (
            strategyRegistry_ == address(0) || clExecutor_ == address(0)
                || safetyController_ == address(0) || permit2_ == address(0)
                || usdc_ == address(0)
        ) {
            revert ZeroAddress();
        }
        strategyRegistry = StrategyPermissionRegistry(strategyRegistry_);
        clExecutor = StableClubConcentratedLiquidityExecutor(clExecutor_);
        safetyController = SafetyController(safetyController_);
        permit2 = IAllowanceTransfer(permit2_);
        usdc = usdc_;
        swapRouter02 = swapRouter02_;
        owner = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    function setSwapRouter02(address router_) external onlyOwner {
        swapRouter02 = router_;
        emit SwapRouter02Updated(router_);
    }

    function setAllowedNpm(address npm_, bool allowed) external onlyOwner {
        if (npm_ == address(0)) revert ZeroAddress();
        allowedNpm[npm_] = allowed;
        emit AllowedNpmUpdated(npm_, allowed);
    }

    function setTrackedExitToken(address token_, bool tracked) external onlyOwner {
        if (token_ == address(0) || token_ == usdc) revert ZeroAddress();
        if (tracked && !trackedExitToken[token_]) {
            trackedExitToken[token_] = true;
            trackedExitTokenList.push(token_);
        } else if (!tracked && trackedExitToken[token_]) {
            trackedExitToken[token_] = false;
            for (uint256 i = 0; i < trackedExitTokenList.length; i++) {
                if (trackedExitTokenList[i] == token_) {
                    trackedExitTokenList[i] = trackedExitTokenList[trackedExitTokenList.length - 1];
                    trackedExitTokenList.pop();
                    break;
                }
            }
        }
        emit TrackedExitTokenUpdated(token_, tracked);
    }

    /// @notice One-time ERC20 approve of tracked tokens to SwapRouter02 (gateway-owned).
    function approveRouterForToken(address token_) external onlyOwner {
        if (swapRouter02 == address(0)) revert InvalidSwapRouter();
        IERC20(token_).forceApprove(swapRouter02, type(uint256).max);
    }

    function registerConsentHash(
        address user,
        bytes32 strategyId,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REGISTER_CONSENT_TYPEHASH, user, strategyId, block.chainid, nonce, deadline
                )
            )
        );
    }

    /**
     * @notice First deposit: optional EIP-712 register consent + Permit2 permit + depositFor.
     * @dev Permit2 spender must be the CL executor. Exact amount only; TTL ≤ 30 minutes.
     */
    function depositFirst(
        StrategyPermissionRegistry.StrategyPermission calldata strategy,
        PermissionRegistry.Permission[5] calldata legPermissions,
        StrategyPermissionRegistry.PoolLegBinding[5] calldata legs,
        bytes calldata registerSignature,
        IAllowanceTransfer.PermitSingle calldata permitSingle,
        bytes calldata permitSignature,
        bytes32 strategyId,
        uint256 executionNonce,
        uint256 grossUsdc,
        bytes32[5] calldata poolIds,
        uint256 depositDeadline,
        ClFivePoolDepositLib.DepositLegParams[5] calldata depositLegs
    ) external nonReentrant whenNotPaused {
        if (strategy.user != msg.sender) revert Unauthorized();
        bytes32 expectedId =
            strategyRegistry.strategyIdFor(strategy.user, strategy.chainId, strategy.depositToken);
        if (strategyId != expectedId) revert InvalidAmount();
        safetyController.assertDepositAllowed(poolIds[0]);
        _assertPermitBounds(permitSingle, grossUsdc);

        if (registerSignature.length > 0) {
            _consumeRegisterConsent(msg.sender, strategyId, registerSignature, depositDeadline);
            strategyRegistry.registerFivePoolStrategy(strategy, legPermissions, legs);
        }

        permit2.permit(msg.sender, permitSingle, permitSignature);
        clExecutor.depositFivePoolStrategyFor(
            msg.sender, strategyId, executionNonce, grossUsdc, poolIds, depositDeadline, depositLegs
        );
        _assertGatewayClean();
        emit GatewayDeposit(msg.sender, strategyId, grossUsdc, registerSignature.length > 0);
    }

    /**
     * @notice Later deposit when strategy already registered. Optional Permit2 permit in-tx.
     */
    function depositAgain(
        IAllowanceTransfer.PermitSingle calldata permitSingle,
        bytes calldata permitSignature,
        bytes32 strategyId,
        uint256 executionNonce,
        uint256 grossUsdc,
        bytes32[5] calldata poolIds,
        uint256 depositDeadline,
        ClFivePoolDepositLib.DepositLegParams[5] calldata depositLegs
    ) external nonReentrant whenNotPaused {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert Unauthorized();

        if (permitSignature.length > 0) {
            _assertPermitBounds(permitSingle, grossUsdc);
            permit2.permit(msg.sender, permitSingle, permitSignature);
        }

        clExecutor.depositFivePoolStrategyFor(
            msg.sender, strategyId, executionNonce, grossUsdc, poolIds, depositDeadline, depositLegs
        );
        _assertGatewayClean();
        emit GatewayDeposit(msg.sender, strategyId, grossUsdc, false);
    }

    /**
     * @notice Warm/cold withdraw via NPM operator grants: decrease+collect → swap → USDC only.
     * @dev Requires `setApprovalForAll(npm, gateway)` (selector 0xa22cb465) per allowlisted NPM.
     *      Reverts if any tracked non-USDC residual remains above dust.
     */
    function exitPercentToUsdc(
        NpmExitLeg[] calldata exitLegs,
        ExitSwap[] calldata swaps,
        uint256 minUsdcOut,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 usdcOut) {
        if (exitLegs.length == 0) revert InvalidAmount();
        if (minUsdcOut == 0) revert MinOutRequired();
        if (deadline < block.timestamp) revert InvalidDeadline();
        if (swapRouter02 == address(0) && swaps.length > 0) revert InvalidSwapRouter();

        address user = msg.sender;
        uint256 preUsdc = IERC20(usdc).balanceOf(address(this));

        for (uint256 i = 0; i < exitLegs.length; i++) {
            NpmExitLeg calldata leg = exitLegs[i];
            if (!allowedNpm[leg.npm]) revert InvalidNpm();
            INpmPositionManager npm = INpmPositionManager(leg.npm);
            if (npm.ownerOf(leg.tokenId) != user) revert NotPositionOwner();
            if (
                npm.getApproved(leg.tokenId) != address(this)
                    && !npm.isApprovedForAll(user, address(this))
            ) {
                revert GatewayNotOperator();
            }

            if (leg.liquidity > 0) {
                npm.decreaseLiquidity(
                    INpmPositionManager.DecreaseLiquidityParams({
                        tokenId: leg.tokenId,
                        liquidity: leg.liquidity,
                        amount0Min: leg.amount0Min,
                        amount1Min: leg.amount1Min,
                        deadline: deadline
                    })
                );
            }
            npm.collect(
                INpmPositionManager.CollectParams({
                    tokenId: leg.tokenId,
                    recipient: address(this),
                    amount0Max: MAX_UINT128,
                    amount1Max: MAX_UINT128
                })
            );
            if (leg.burnIfEmpty) {
                try npm.burn(leg.tokenId) {} catch {}
            }
        }

        for (uint256 s = 0; s < swaps.length; s++) {
            ExitSwap calldata swap = swaps[s];
            if (swap.tokenIn == usdc) revert InvalidAmount();
            uint256 bal = IERC20(swap.tokenIn).balanceOf(address(this));
            uint256 amountIn = swap.amountIn == 0 || swap.amountIn > bal ? bal : swap.amountIn;
            if (amountIn == 0) continue;

            ISwapRouter02ExactInputSingle(swapRouter02).exactInputSingle(
                ISwapRouter02ExactInputSingle.ExactInputSingleParams({
                    tokenIn: swap.tokenIn,
                    tokenOut: usdc,
                    fee: swap.fee,
                    recipient: address(this),
                    amountIn: amountIn,
                    amountOutMinimum: swap.amountOutMinimum,
                    sqrtPriceLimitX96: 0
                })
            );
        }

        // Fail-closed: configured non-USDC exit tokens must not remain above dust.
        for (uint256 t = 0; t < trackedExitTokenList.length; t++) {
            if (IERC20(trackedExitTokenList[t]).balanceOf(address(this)) > RESIDUAL_DUST) {
                revert ResidualNonUsdc();
            }
        }

        uint256 postUsdc = IERC20(usdc).balanceOf(address(this));
        if (postUsdc < preUsdc) revert InvalidAmount();
        usdcOut = postUsdc - preUsdc;
        if (usdcOut < minUsdcOut) revert MinOutRequired();
        IERC20(usdc).safeTransfer(user, usdcOut);
        _assertGatewayClean();
        emit GatewayExitToUsdc(user, usdcOut, exitLegs.length);
    }

    /**
     * @notice Strategy-bound exit via CL executor (adapters must already be NPM-approved).
     * @dev Progressive path when positions are still managed through the executor stack.
     */
    function exitPercentToUsdcViaExecutor(
        bytes32 strategyId,
        ClFivePoolExitLib.ExitLegParams[5] calldata legs,
        ClFivePoolExitLib.ExitUnwindSwap[8] calldata swaps,
        uint8 swapCount,
        uint256 minUsdcOut,
        uint256 executionNonceBase
    ) external nonReentrant whenNotPaused returns (uint256 usdcOut) {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert Unauthorized();
        usdcOut = clExecutor.exitAllToUsdcFor(
            msg.sender, strategyId, legs, swaps, swapCount, minUsdcOut, executionNonceBase
        );
        _assertGatewayClean();
        emit GatewayExitToUsdc(msg.sender, usdcOut, 5);
    }

    function _consumeRegisterConsent(
        address user,
        bytes32 strategyId,
        bytes calldata signature,
        uint256 deadline
    ) internal {
        if (deadline < block.timestamp) revert InvalidDeadline();
        uint256 nonce = registerConsentNonce[user];
        bytes32 digest = registerConsentHash(user, strategyId, nonce, deadline);
        address signer = digest.recover(signature);
        if (signer != user) revert InvalidSignature();
        unchecked {
            registerConsentNonce[user] = nonce + 1;
        }
    }

    function _assertPermitBounds(IAllowanceTransfer.PermitSingle calldata permitSingle, uint256 grossUsdc)
        internal
        view
    {
        if (permitSingle.details.token != usdc) revert InvalidAmount();
        if (permitSingle.spender != address(clExecutor)) revert Unauthorized();
        if (uint256(permitSingle.details.amount) != grossUsdc) revert InvalidAmount();
        if (permitSingle.sigDeadline < block.timestamp) revert InvalidDeadline();
        if (permitSingle.details.expiration < block.timestamp) revert InvalidDeadline();
        if (uint256(permitSingle.details.expiration) > block.timestamp + MAX_PERMIT2_TTL) {
            revert InvalidPermit2Ttl();
        }
        if (permitSingle.sigDeadline > block.timestamp + MAX_PERMIT2_TTL) {
            revert InvalidPermit2Ttl();
        }
    }

    function _assertGatewayClean() internal view {
        if (IERC20(usdc).balanceOf(address(this)) > 0) revert ResidualNonUsdc();
        for (uint256 t = 0; t < trackedExitTokenList.length; t++) {
            if (IERC20(trackedExitTokenList[t]).balanceOf(address(this)) > RESIDUAL_DUST) {
                revert ResidualNonUsdc();
            }
        }
    }
}
