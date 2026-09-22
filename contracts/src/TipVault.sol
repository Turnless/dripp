// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TipVault
/// @notice Escrows tips sent to a platform username that has not yet claimed
///         an account on the platform. Direct tips between two already-
///         registered users bypass this contract entirely (a plain ERC20
///         transfer between smart accounts is enough) -- this contract's job
///         is scoped ONLY to the "tip before signup" flow described in
///         04-architecture.md, section 4.4.
/// @dev handleHash is computed off-chain as keccak256(abi.encodePacked(platform, ":", username))
///      so this contract never needs to store platform/username strings.
///      claim() is restricted to `owner`, which in this scaffold is a
///      backend-controlled address: the actual proof that a claimant owns a
///      given platform handle happens off-chain via OAuth (see
///      app/api/platform/callback/[provider]/route.ts), and only the backend
///      calls claim() once that proof succeeds. This is a deliberate,
///      documented trust assumption for a hackathon-scoped build, not an
///      oversight -- a production version would likely replace `owner` with
///      a signature-based claim (e.g. an EIP-712 message signed by a backend
///      key, verified onchain) so the contract itself doesn't need a
///      privileged caller at all.
///
///      Refunds: if a handle still hasn't been claimed REFUND_DELAY after a
///      sender's latest deposit, that sender can take back exactly their own
///      contribution. Contributions are tracked per "round": claim() closes the
///      current round for the handle (claimRound++), so money that was claimed
///      can never also be refunded, and deposits after a claim start fresh.
contract TipVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant REFUND_DELAY = 30 days;

    IERC20 public immutable usdc;

    struct Contribution {
        uint256 amount;
        uint64 lastDepositAt;
        uint64 round;
    }

    /// Total currently escrowed per handle (all senders, current round).
    mapping(bytes32 => uint256) public pendingBalances;
    /// Current round per handle; incremented on every claim.
    mapping(bytes32 => uint64) public claimRound;
    /// What each sender has escrowed for a handle in its current round.
    mapping(bytes32 => mapping(address => Contribution)) private _contributions;

    event PendingTipDeposited(bytes32 indexed handleHash, address indexed sender, uint256 amount);
    event PendingTipClaimed(bytes32 indexed handleHash, address indexed recipient, uint256 amount);
    event PendingTipRefunded(bytes32 indexed handleHash, address indexed sender, uint256 amount);

    constructor(address usdcAddress, address initialOwner) Ownable(initialOwner) {
        require(usdcAddress != address(0), "usdc address cannot be zero");
        usdc = IERC20(usdcAddress);
    }

    /// @notice Deposits USDC into escrow for a not-yet-claimed platform handle.
    /// @dev Caller must have approved this contract for `amount` beforehand.
    function depositPending(bytes32 handleHash, uint256 amount) external nonReentrant {
        require(amount > 0, "amount must be > 0");

        Contribution storage c = _contributions[handleHash][msg.sender];
        uint64 round = claimRound[handleHash];
        if (c.round != round) {
            // Left over from a round that was already claimed -- start fresh.
            c.amount = 0;
            c.round = round;
        }
        c.amount += amount;
        c.lastDepositAt = uint64(block.timestamp);
        pendingBalances[handleHash] += amount;

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit PendingTipDeposited(handleHash, msg.sender, amount);
    }

    /// @notice Releases the full escrowed balance for a handle to the address
    ///         that has now proven ownership of it off-chain.
    function claim(bytes32 handleHash, address recipient) external onlyOwner nonReentrant {
        require(recipient != address(0), "recipient cannot be zero");
        uint256 amount = pendingBalances[handleHash];
        require(amount > 0, "no pending balance for this handle");

        pendingBalances[handleHash] = 0;
        claimRound[handleHash] += 1; // closes this round: nothing in it is refundable anymore
        usdc.safeTransfer(recipient, amount);

        emit PendingTipClaimed(handleHash, recipient, amount);
    }

    /// @notice Returns the caller's own escrowed tips for a handle that still
    ///         hasn't been claimed REFUND_DELAY after their latest deposit.
    function refund(bytes32 handleHash) external nonReentrant {
        Contribution storage c = _contributions[handleHash][msg.sender];
        require(c.round == claimRound[handleHash] && c.amount > 0, "nothing to refund");
        require(block.timestamp >= uint256(c.lastDepositAt) + REFUND_DELAY, "refund not available yet");

        uint256 amount = c.amount;
        c.amount = 0;
        pendingBalances[handleHash] -= amount;
        usdc.safeTransfer(msg.sender, amount);

        emit PendingTipRefunded(handleHash, msg.sender, amount);
    }

    function pendingBalanceOf(bytes32 handleHash) external view returns (uint256) {
        return pendingBalances[handleHash];
    }

    /// @notice What `sender` could get back for `handleHash` (0 if claimed or none),
    ///         and the earliest time a refund is allowed.
    function refundableOf(bytes32 handleHash, address sender)
        external
        view
        returns (uint256 amount, uint256 availableAt)
    {
        Contribution storage c = _contributions[handleHash][sender];
        if (c.round != claimRound[handleHash]) return (0, 0);
        return (c.amount, uint256(c.lastDepositAt) + REFUND_DELAY);
    }
}
