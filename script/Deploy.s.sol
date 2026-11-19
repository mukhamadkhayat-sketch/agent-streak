// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentStreak} from "../src/AgentStreak.sol";

/// @notice Deploys AgentStreak (which deploys StreakBadge in its constructor).
///         PHASE 1: dry-run only — never broadcast without the user's explicit
///         go-ahead for Phase 2 (funding decision first: see FASE-1.md).
///         Dry run:  forge script script/Deploy.s.sol --rpc-url bsc
///         Broadcast (Phase 2 only): forge script script/Deploy.s.sol
///           --rpc-url bsc --broadcast --verify --verifier-url <bscscan> ...
contract Deploy is Script {
    address public constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    function run() external {
        vm.startBroadcast();
        AgentStreak streak = new AgentStreak(AGENT_ID);
        vm.stopBroadcast();
        console.log("AgentStreak:", address(streak));
        console.log("StreakBadge:", address(streak.badge()));
        console.log("Agent ID registry:", AGENT_ID);
    }
}
