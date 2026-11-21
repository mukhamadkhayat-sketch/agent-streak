// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentStreak} from "../src/AgentStreak.sol";
import {StreakBadge} from "../src/StreakBadge.sol";
import {IAgentId} from "../src/interfaces/IAgentId.sol";

/// @notice Fork tests against REAL BSC mainnet state (latest block).
///         NOTE: BSC public RPCs prune historical state, so the fork uses the
///         latest block instead of a pinned one (pinning fails with "missing
///         trie node" on bsc-dataseed). Run with: forge test --match-contract Fork
///         Override the RPC with BSC_RPC_URL if the default endpoint is down.
contract AgentStreakForkTest is Test {
    AgentStreak public streak;
    StreakBadge public badge;

    address public constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address public constant KHATELL = 0xa80a0A7D06468d2ea00d21710180a768a0bDBaCa;

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string("https://bsc-dataseed.binance.org/"));
        vm.createSelectFork(rpc); // latest block (BSC public nodes prune history)
        streak = new AgentStreak(AGENT_ID, address(this));
        badge = streak.badge();
    }

    function testFork_KhatellHoldsAgentId() public view {
        assertEq(IAgentId(AGENT_ID).balanceOf(KHATELL), 1);
        assertEq(IAgentId(AGENT_ID).handleOf(KHATELL), "khatell");
    }

    function testFork_KhatellCanCheckIn() public {
        vm.prank(KHATELL);
        streak.checkIn();
        assertEq(streak.currentStreak(KHATELL), 1);
        assertEq(streak.userCount(), 1);
    }

    function testFork_NonHolderReverts() public {
        address stranger = address(0x1234567890123456789012345678901234567890);
        assertEq(IAgentId(AGENT_ID).balanceOf(stranger), 0);
        vm.prank(stranger);
        vm.expectRevert(AgentStreak.NotAgentIdHolder.selector);
        streak.checkIn();
    }

    function testFork_BadgeOnDay3WithRealHandle() public {
        vm.startPrank(KHATELL);
        streak.checkIn();
        vm.warp(block.timestamp + 1 days);
        streak.checkIn();
        vm.warp(block.timestamp + 1 days);
        streak.checkIn();
        vm.stopPrank();
        assertEq(badge.balanceOf(KHATELL), 1);
        assertEq(uint256(badge.tierOf(0)), uint256(StreakBadge.Tier.BRONZE));
        assertEq(badge.handleOfToken(0), "khatell", "real on-chain handle stamped into badge");
        assertEq(badge.streakAtMint(0), 3);
        // tokenURI must be a data URI (content verified in unit test + python decode).
        bytes memory uri = bytes(badge.tokenURI(0));
        bytes memory prefix = bytes("data:application/json;base64,");
        for (uint256 i; i < prefix.length; ++i) {
            assertEq(uri[i], prefix[i]);
        }
    }
}
