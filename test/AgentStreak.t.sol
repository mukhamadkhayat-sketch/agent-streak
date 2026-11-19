// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AgentStreak} from "../src/AgentStreak.sol";
import {StreakBadge} from "../src/StreakBadge.sol";
import {MockAgentId} from "./mocks/MockAgentId.sol";

contract AgentStreakTest is Test {
    AgentStreak public streak;
    StreakBadge public badge;
    MockAgentId public agentId;

    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA901); // no Agent ID

    uint256 constant DAY = 1 days;

    event CheckIn(address indexed user, uint256 indexed day, uint256 streak);
    event TierReached(address indexed user, StreakBadge.Tier indexed tier, uint256 indexed tokenId, uint256 streak);

    function setUp() public {
        agentId = new MockAgentId();
        agentId.setHolder(alice, "alice");
        agentId.setHolder(bob, "bob");
        streak = new AgentStreak(address(agentId));
        badge = streak.badge();
        // Fixed start: 2027-01-15 08:00:00 UTC (day 20833) for deterministic day math.
        vm.warp(1_800_000_000);
    }

    function _checkInDays(address user, uint256 numDays) internal {
        vm.startPrank(user);
        for (uint256 i; i < numDays; ++i) {
            if (i > 0) vm.warp(block.timestamp + DAY);
            streak.checkIn();
        }
        vm.stopPrank();
    }

    function test_NonHolderReverts() public {
        vm.prank(carol);
        vm.expectRevert(AgentStreak.NotAgentIdHolder.selector);
        streak.checkIn();
    }

    function test_FirstCheckIn() public {
        uint256 day = block.timestamp / DAY;
        vm.expectEmit(true, true, false, true, address(streak));
        emit CheckIn(alice, day, 1);
        vm.prank(alice);
        streak.checkIn();
        assertEq(streak.currentStreak(alice), 1);
        assertEq(streak.bestStreak(alice), 1);
        assertEq(streak.totalCheckIns(alice), 1);
        assertEq(streak.lastCheckInDay(alice), day);
        assertEq(streak.userCount(), 1);
        assertEq(streak.totalCheckInCount(), 1);
    }

    function test_SameDayReverts() public {
        vm.prank(alice);
        streak.checkIn();
        vm.prank(alice);
        vm.expectRevert(AgentStreak.AlreadyCheckedIn.selector);
        streak.checkIn();
    }

    function test_ConsecutiveDays() public {
        _checkInDays(alice, 5);
        assertEq(streak.currentStreak(alice), 5);
        assertEq(streak.bestStreak(alice), 5);
        assertEq(streak.totalCheckIns(alice), 5);
    }

    function test_GapResetsStreakKeepsBest() public {
        _checkInDays(alice, 2);
        assertEq(streak.currentStreak(alice), 2);
        vm.warp(block.timestamp + 2 * DAY); // skip one full day
        vm.prank(alice);
        streak.checkIn();
        assertEq(streak.currentStreak(alice), 1, "streak resets after a missed day");
        assertEq(streak.bestStreak(alice), 2, "best streak is kept");
        assertEq(streak.totalCheckIns(alice), 3);
    }

    function test_BronzeBadgeAtDay3() public {
        _checkInDays(alice, 2);
        vm.warp(block.timestamp + DAY);
        uint256 day = block.timestamp / DAY;
        // checkIn emits CheckIn first, then TierReached — expect both in order.
        vm.expectEmit(true, true, false, true, address(streak));
        emit CheckIn(alice, day, 3);
        vm.expectEmit(true, true, true, true, address(streak));
        emit TierReached(alice, StreakBadge.Tier.BRONZE, 0, 3);
        vm.prank(alice);
        streak.checkIn();
        assertEq(badge.balanceOf(alice), 1);
        assertEq(badge.ownerOf(0), alice);
        assertEq(uint256(badge.tierOf(0)), uint256(StreakBadge.Tier.BRONZE));
        assertEq(badge.handleOfToken(0), "alice");
        assertEq(badge.streakAtMint(0), 3);
        assertTrue(streak.tierClaimed(alice, StreakBadge.Tier.BRONZE));
    }

    function test_AllTiersByDay30() public {
        _checkInDays(alice, 30);
        assertEq(badge.balanceOf(alice), 4);
        assertEq(uint256(badge.tierOf(0)), uint256(StreakBadge.Tier.BRONZE));
        assertEq(uint256(badge.tierOf(1)), uint256(StreakBadge.Tier.SILVER));
        assertEq(uint256(badge.tierOf(2)), uint256(StreakBadge.Tier.GOLD));
        assertEq(uint256(badge.tierOf(3)), uint256(StreakBadge.Tier.DIAMOND));
        assertEq(badge.streakAtMint(0), 3);
        assertEq(badge.streakAtMint(1), 7);
        assertEq(badge.streakAtMint(2), 14);
        assertEq(badge.streakAtMint(3), 30);
        assertEq(streak.currentStreak(alice), 30);
    }

    function test_NoDuplicateBadgeAfterReset() public {
        _checkInDays(alice, 3); // bronze minted
        assertEq(badge.balanceOf(alice), 1);
        vm.warp(block.timestamp + 2 * DAY); // miss a day, streak resets
        _checkInDays(alice, 3); // reach 3 again
        assertEq(badge.balanceOf(alice), 1, "bronze must not mint twice");
        // Continue the second run to 7 days -> silver mints (first time).
        vm.warp(block.timestamp + DAY); // helper's first check-in needs a new day
        _checkInDays(alice, 4);
        assertEq(badge.balanceOf(alice), 2);
        assertEq(uint256(badge.tierOf(1)), uint256(StreakBadge.Tier.SILVER));
    }

    function test_BadgeSoulbound() public {
        _checkInDays(alice, 3);
        vm.startPrank(alice);
        vm.expectRevert(StreakBadge.Soulbound.selector);
        badge.transferFrom(alice, bob, 0);
        vm.expectRevert(StreakBadge.Soulbound.selector);
        badge.safeTransferFrom(alice, bob, 0);
        vm.expectRevert(StreakBadge.Soulbound.selector);
        badge.approve(bob, 0);
        vm.expectRevert(StreakBadge.Soulbound.selector);
        badge.setApprovalForAll(bob, true);
        vm.stopPrank();
        assertEq(badge.ownerOf(0), alice, "badge stays with alice");
    }

    function test_BadgeMintOnlyByStreak() public {
        vm.expectRevert(StreakBadge.OnlyStreak.selector);
        badge.mint(alice, StreakBadge.Tier.GOLD, 14, "alice");
    }

    function test_PauseUnpause() public {
        streak.pause();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        streak.checkIn();
        streak.unpause();
        vm.prank(alice);
        streak.checkIn();
        assertEq(streak.currentStreak(alice), 1);
    }

    function test_PauseOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice));
        streak.pause();
    }

    function test_TokenURI() public {
        _checkInDays(alice, 3);
        string memory uri = badge.tokenURI(0);
        // Prefix check; full JSON/SVG content is verified by decoding the
        // logged URI with python (see FASE-1.md verification notes).
        bytes memory prefix = bytes("data:application/json;base64,");
        for (uint256 i; i < prefix.length; ++i) {
            assertEq(bytes(uri)[i], prefix[i]);
        }
        assertGt(bytes(uri).length, 500, "tokenURI must carry real metadata");
        console.log(uri);
        // Nonexistent token reverts with the standard OZ error.
        vm.expectRevert(abi.encodeWithSignature("ERC721NonexistentToken(uint256)", 999));
        badge.tokenURI(999);
    }

    function test_TokenURIDiffersPerTier() public {
        _checkInDays(alice, 7);
        assertTrue(
            keccak256(bytes(badge.tokenURI(0))) != keccak256(bytes(badge.tokenURI(1))),
            "bronze and silver metadata must differ"
        );
    }

    function test_TierOfStreak() public view {
        assertEq(uint256(streak.tierOfStreak(0)), uint256(StreakBadge.Tier.NONE));
        assertEq(uint256(streak.tierOfStreak(2)), uint256(StreakBadge.Tier.NONE));
        assertEq(uint256(streak.tierOfStreak(3)), uint256(StreakBadge.Tier.BRONZE));
        assertEq(uint256(streak.tierOfStreak(6)), uint256(StreakBadge.Tier.BRONZE));
        assertEq(uint256(streak.tierOfStreak(7)), uint256(StreakBadge.Tier.SILVER));
        assertEq(uint256(streak.tierOfStreak(13)), uint256(StreakBadge.Tier.SILVER));
        assertEq(uint256(streak.tierOfStreak(14)), uint256(StreakBadge.Tier.GOLD));
        assertEq(uint256(streak.tierOfStreak(29)), uint256(StreakBadge.Tier.GOLD));
        assertEq(uint256(streak.tierOfStreak(30)), uint256(StreakBadge.Tier.DIAMOND));
        assertEq(uint256(streak.tierOfStreak(365)), uint256(StreakBadge.Tier.DIAMOND));
    }

    function test_HasCheckedInToday() public {
        assertFalse(streak.hasCheckedInToday(alice));
        vm.prank(alice);
        streak.checkIn();
        assertTrue(streak.hasCheckedInToday(alice));
        vm.warp(block.timestamp + DAY);
        assertFalse(streak.hasCheckedInToday(alice));
    }

    function test_LeaderboardViews() public {
        _checkInDays(alice, 3);
        _checkInDays(bob, 1);
        assertEq(streak.userCount(), 2);
        (address[] memory users, uint256[] memory streaks, uint256[] memory bests) = streak.getUsers(0, 10);
        assertEq(users.length, 2);
        assertEq(users[0], alice);
        assertEq(users[1], bob);
        assertEq(streaks[0], 3);
        assertEq(streaks[1], 1);
        assertEq(bests[0], 3);
        assertEq(bests[1], 1);
        // Pagination: second page, limit 1.
        (users, streaks, bests) = streak.getUsers(1, 1);
        assertEq(users.length, 1);
        assertEq(users[0], bob);
        // Offset beyond the end -> empty.
        (users, streaks, bests) = streak.getUsers(5, 10);
        assertEq(users.length, 0);
        assertEq(streaks.length, 0);
        assertEq(bests.length, 0);
        // getUser tuple.
        (uint256 s, uint256 b, uint256 t, uint256 d) = streak.getUser(alice);
        assertEq(s, 3);
        assertEq(b, 3);
        assertEq(t, 3);
        assertEq(d, block.timestamp / DAY);
    }

    function test_TwoUsersIndependentStreaks() public {
        _checkInDays(alice, 4);
        _checkInDays(bob, 2);
        assertEq(streak.currentStreak(alice), 4);
        assertEq(streak.currentStreak(bob), 2);
        assertEq(badge.balanceOf(alice), 1, "alice has bronze");
        assertEq(badge.balanceOf(bob), 0, "bob has no badge yet");
    }
}
