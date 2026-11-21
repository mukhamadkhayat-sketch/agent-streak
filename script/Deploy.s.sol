// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentStreak} from "../src/AgentStreak.sol";

/// @notice Deploys AgentStreak (which deploys StreakBadge in its constructor).
///         PHASE 1: dry-run only — never broadcast without the user's explicit
///         go-ahead for Phase 2 (funding decision first: see FASE-1.md).
///         Dry run:  forge script script/Deploy.s.sol --rpc-url bsc
///         NOTE (21 Nov 2026): the Binance Agentic Wallet CLI (`baw
///         contract-call`) cannot send contract-creation transactions
///         (`to` is required for EVM). The real mainnet deploy therefore goes
///         through the Arachnid deterministic deployment proxy
///         (0x4e59b44847b379578588920cA78FbF26c0B4956C) via a normal
///         `baw contract-call` to the proxy, with calldata = salt (32 bytes)
///         + creation bytecode. That is why the constructor takes an explicit
///         `owner_` (khatell.ai): with a factory deploy, msg.sender inside the
///         constructor would be the proxy, not the deployer.
///         Broadcast (Phase 2 only, direct route — needs a signing key):
///           forge script script/Deploy.s.sol
///           --rpc-url bsc --broadcast --verify --verifier-url <bscscan> ...
contract Deploy is Script {
    address public constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address public constant OWNER = 0xa80a0A7D06468d2ea00d21710180a768a0bDBaCa; // khatell.ai

    function run() external {
        vm.startBroadcast();
        AgentStreak streak = new AgentStreak(AGENT_ID, OWNER);
        vm.stopBroadcast();
        console.log("AgentStreak:", address(streak));
        console.log("StreakBadge:", address(streak.badge()));
        console.log("Agent ID registry:", AGENT_ID);
    }
}
