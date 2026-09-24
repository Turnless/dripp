// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TipVault} from "../src/TipVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @notice Drives TipVault through random sequences of deposits, claims,
///         refunds and time jumps, across several senders and handles, and
///         keeps totals of what went in and out for the invariants below.
contract TipVaultHandler is Test {
    TipVault public vault;
    MockUSDC public usdc;
    address public owner;

    address[] public senders;
    bytes32[] public handles;

    uint256 public totalDeposited;
    uint256 public totalClaimed;
    uint256 public totalRefunded;

    constructor(TipVault _vault, MockUSDC _usdc, address _owner) {
        vault = _vault;
        usdc = _usdc;
        owner = _owner;
        for (uint256 i = 0; i < 3; i++) {
            address s = address(uint160(0x1000 + i));
            senders.push(s);
            usdc.mint(s, 1_000_000e6);
            vm.prank(s);
            usdc.approve(address(vault), type(uint256).max);
        }
        handles.push(keccak256(abi.encodePacked("youtube", ":", "alpha")));
        handles.push(keccak256(abi.encodePacked("youtube", ":", "beta")));
        handles.push(keccak256(abi.encodePacked("kick", ":", "alpha")));
    }

    function senderCount() external view returns (uint256) {
        return senders.length;
    }

    function handleCount() external view returns (uint256) {
        return handles.length;
    }

    function deposit(uint256 senderSeed, uint256 handleSeed, uint256 amount) external {
        address s = senders[senderSeed % senders.length];
        bytes32 h = handles[handleSeed % handles.length];
        amount = bound(amount, 1, 1_000e6);
        vm.prank(s);
        vault.depositPending(h, amount);
        totalDeposited += amount;
    }

    function claim(uint256 handleSeed, uint256 recipientSeed) external {
        bytes32 h = handles[handleSeed % handles.length];
        uint256 pending = vault.pendingBalanceOf(h);
        if (pending == 0) return;
        address recipient = address(uint160(0x2000 + (recipientSeed % 5)));
        vm.prank(owner);
        vault.claim(h, recipient);
        totalClaimed += pending;
    }

    function refund(uint256 senderSeed, uint256 handleSeed) external {
        address s = senders[senderSeed % senders.length];
        bytes32 h = handles[handleSeed % handles.length];
        (uint256 amount, uint256 availableAt) = vault.refundableOf(h, s);
        if (amount == 0 || block.timestamp < availableAt) return;
        vm.prank(s);
        vault.refund(h);
        totalRefunded += amount;
    }

    function warp(uint256 secondsForward) external {
        vm.warp(block.timestamp + bound(secondsForward, 1, 40 days));
    }
}

contract TipVaultInvariantTest is Test {
    TipVault vault;
    MockUSDC usdc;
    TipVaultHandler handler;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new TipVault(address(usdc), address(this));
        handler = new TipVaultHandler(vault, usdc, address(this));
        vault.transferOwnership(address(handler.owner()));
        targetContract(address(handler));
    }

    /// Each handle's escrowed total equals the sum of every sender's
    /// refundable (current-round) contribution -- so a refund can never take
    /// more than the handle holds, and nothing is left unaccounted for.
    function invariant_pendingEqualsSumOfContributions() public view {
        for (uint256 h = 0; h < handler.handleCount(); h++) {
            bytes32 handle = handler.handles(h);
            uint256 sum;
            for (uint256 s = 0; s < handler.senderCount(); s++) {
                (uint256 amount,) = vault.refundableOf(handle, handler.senders(s));
                sum += amount;
            }
            assertEq(vault.pendingBalanceOf(handle), sum, "pending != sum of contributions");
        }
    }

    /// Everything escrowed is actually held by the vault.
    function invariant_pendingEqualsVaultBalance() public view {
        uint256 total;
        for (uint256 h = 0; h < handler.handleCount(); h++) {
            total += vault.pendingBalanceOf(handler.handles(h));
        }
        assertEq(usdc.balanceOf(address(vault)), total, "vault balance != total pending");
    }

    /// Money in = money still held + money claimed + money refunded.
    function invariant_conservation() public view {
        assertEq(
            usdc.balanceOf(address(vault)),
            handler.totalDeposited() - handler.totalClaimed() - handler.totalRefunded(),
            "deposits != held + claimed + refunded"
        );
    }
}

/// @notice Fuzzed: once a handle is claimed, no sender can also get a refund
///         for money that was in the claimed round -- at any later time.
contract TipVaultClaimThenRefundTest is Test {
    TipVault vault;
    MockUSDC usdc;
    address sender = address(0xA11CE);
    bytes32 handle = keccak256(abi.encodePacked("youtube", ":", "somecreator"));

    function setUp() public {
        usdc = new MockUSDC();
        vault = new TipVault(address(usdc), address(this));
        usdc.mint(sender, type(uint128).max);
        vm.prank(sender);
        usdc.approve(address(vault), type(uint256).max);
    }

    function testFuzz_claimThenRefund_alwaysReverts(uint96 amount, uint32 waitAfter) public {
        vm.assume(amount > 0);
        vm.prank(sender);
        vault.depositPending(handle, amount);

        vault.claim(handle, address(0xB0B));
        assertEq(usdc.balanceOf(address(0xB0B)), amount);

        vm.warp(block.timestamp + uint256(waitAfter) + 30 days);
        vm.prank(sender);
        vm.expectRevert(bytes("nothing to refund"));
        vault.refund(handle);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }
}
