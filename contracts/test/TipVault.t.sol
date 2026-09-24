// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TipVault} from "../src/TipVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract TipVaultTest is Test {
    TipVault vault;
    MockUSDC usdc;

    address owner = address(this);
    address sender = address(0xA11CE);
    address sender2 = address(0xCA11);
    address recipient = address(0xB0B);

    bytes32 handleHash = keccak256(abi.encodePacked("youtube", ":", "somecreator"));

    function setUp() public {
        usdc = new MockUSDC();
        vault = new TipVault(address(usdc), owner);

        usdc.mint(sender, 100e6); // 100 USDC (6 decimals)
        vm.prank(sender);
        usdc.approve(address(vault), type(uint256).max);

        usdc.mint(sender2, 100e6);
        vm.prank(sender2);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ---------- escrow key ----------

    /// The app computes the same key in TypeScript (lib/tipvault.ts
    /// handleHash); tests/money.test.ts asserts these exact values.
    function test_handleHash_matchesTheApp() public pure {
        assertEq(
            keccak256(abi.encodePacked("youtube", ":", "somecreator")),
            0x1029ba6191fe353fbd48e2ac5794dd816c141703a5787a0cea8294ef4d019d0e
        );
        assertEq(
            keccak256(abi.encodePacked("kick", ":", "somecreator")),
            0xf86f51406bb7248862de01f466579977b833670b4868262be47c0d68e6be54a4
        );
    }

    /// Channel-ID escrow key (lib/tipvault.ts channelKey), asserted in
    /// tests/money.test.ts too.
    function test_channelKey_matchesTheApp() public pure {
        assertEq(
            keccak256(abi.encodePacked("youtube", "#", "UCabc123")),
            0x28665104ac78382eafc46f9456552d248ade2338c7f3d48969aabc6582449b53
        );
    }

    // ---------- deposit + claim ----------

    function test_depositPending_increasesBalance() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);

        assertEq(vault.pendingBalanceOf(handleHash), 5e6);
        assertEq(usdc.balanceOf(address(vault)), 5e6);
    }

    function test_depositPending_accumulatesAcrossMultipleTips() public {
        vm.startPrank(sender);
        vault.depositPending(handleHash, 5e6);
        vault.depositPending(handleHash, 3e6);
        vm.stopPrank();

        assertEq(vault.pendingBalanceOf(handleHash), 8e6);
    }

    function test_claim_releasesFullBalanceToRecipient() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);

        vault.claim(handleHash, recipient);

        assertEq(usdc.balanceOf(recipient), 5e6);
        assertEq(vault.pendingBalanceOf(handleHash), 0);
    }

    function test_claim_revertsIfNoPendingBalance() public {
        vm.expectRevert("no pending balance for this handle");
        vault.claim(handleHash, recipient);
    }

    function test_claim_revertsIfCalledByNonOwner() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);

        vm.prank(sender);
        vm.expectRevert();
        vault.claim(handleHash, recipient);
    }

    function test_depositPending_revertsOnZeroAmount() public {
        vm.prank(sender);
        vm.expectRevert("amount must be > 0");
        vault.depositPending(handleHash, 0);
    }

    // ---------- refunds ----------

    function test_refund_revertsBeforeDelay() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);

        vm.warp(block.timestamp + vault.REFUND_DELAY() - 1);
        vm.prank(sender);
        vm.expectRevert("refund not available yet");
        vault.refund(handleHash);
    }

    function test_refund_returnsOwnContributionAfterDelay() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);

        vm.warp(block.timestamp + vault.REFUND_DELAY());
        vm.prank(sender);
        vault.refund(handleHash);

        assertEq(usdc.balanceOf(sender), 100e6);
        assertEq(vault.pendingBalanceOf(handleHash), 0);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_refund_onlyReturnsCallersShare() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);
        vm.prank(sender2);
        vault.depositPending(handleHash, 7e6);

        vm.warp(block.timestamp + vault.REFUND_DELAY());
        vm.prank(sender);
        vault.refund(handleHash);

        assertEq(usdc.balanceOf(sender), 100e6);
        assertEq(vault.pendingBalanceOf(handleHash), 7e6);
        (uint256 left, ) = vault.refundableOf(handleHash, sender2);
        assertEq(left, 7e6);
    }

    function test_refund_delayRestartsOnNewDeposit() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);

        vm.warp(block.timestamp + 20 days);
        vm.prank(sender);
        vault.depositPending(handleHash, 1e6);

        // 30 days after the FIRST deposit, but only 10 after the latest.
        vm.warp(block.timestamp + 10 days);
        vm.prank(sender);
        vm.expectRevert("refund not available yet");
        vault.refund(handleHash);

        vm.warp(block.timestamp + 20 days);
        vm.prank(sender);
        vault.refund(handleHash);
        assertEq(usdc.balanceOf(sender), 100e6);
    }

    function test_refund_revertsAfterClaim() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);
        vault.claim(handleHash, recipient);

        vm.warp(block.timestamp + vault.REFUND_DELAY());
        vm.prank(sender);
        vm.expectRevert("nothing to refund");
        vault.refund(handleHash);

        assertEq(usdc.balanceOf(recipient), 5e6);
    }

    function test_refund_revertsTwice() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);
        vm.warp(block.timestamp + vault.REFUND_DELAY());

        vm.startPrank(sender);
        vault.refund(handleHash);
        vm.expectRevert("nothing to refund");
        vault.refund(handleHash);
        vm.stopPrank();
    }

    function test_depositAfterClaim_startsFreshRound() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);
        vault.claim(handleHash, recipient);

        // New tip after the claim: only this one is refundable.
        vm.prank(sender);
        vault.depositPending(handleHash, 2e6);
        (uint256 refundable, ) = vault.refundableOf(handleHash, sender);
        assertEq(refundable, 2e6);

        vm.warp(block.timestamp + vault.REFUND_DELAY());
        vm.prank(sender);
        vault.refund(handleHash);

        assertEq(usdc.balanceOf(sender), 100e6 - 5e6);
        assertEq(usdc.balanceOf(recipient), 5e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_claimAfterPartialRefund_paysTheRest() public {
        vm.prank(sender);
        vault.depositPending(handleHash, 5e6);
        vm.prank(sender2);
        vault.depositPending(handleHash, 7e6);

        vm.warp(block.timestamp + vault.REFUND_DELAY());
        vm.prank(sender);
        vault.refund(handleHash);

        vault.claim(handleHash, recipient);
        assertEq(usdc.balanceOf(recipient), 7e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }
}
