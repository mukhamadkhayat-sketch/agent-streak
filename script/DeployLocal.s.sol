// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentStreak} from "../src/AgentStreak.sol";
import {MockAgentId} from "../test/mocks/MockAgentId.sol";

/// @notice LOCAL TESTING ONLY — never run against mainnet.
///         Deploys MockAgentId + AgentStreak on a local anvil chain and
///         registers khatell.ai + fafatoni.ai as holders in the mock, so the
///         frontend read paths can be tested end-to-end without a mainnet
///         fork (anvil's fork backend fails in sandboxed environments).
///         The mock registry is NOT the real Agent ID registry; real-registry
///         behaviour is covered by test/AgentStreakFork.t.sol and by the
///         live reads in tests-frontend/test-chain.js.
///
///         Usage: forge script script/DeployLocal.s.sol
///           --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil key 0>
contract DeployLocal is Script {
    function run() external {
        vm.startBroadcast();
        MockAgentId mock = new MockAgentId();
        mock.setHolder(0xa80a0A7D06468d2ea00d21710180a768a0bDBaCa, "khatell");
        mock.setHolder(0x423F9ADc4fD93fcA2b34a5D882D670A127491556, "fafatoni");
        AgentStreak streak = new AgentStreak(address(mock), msg.sender);
        vm.stopBroadcast();
        console.log("MockAgentId:", address(mock));
        console.log("AgentStreak:", address(streak));
        console.log("StreakBadge:", address(streak.badge()));
    }
}
