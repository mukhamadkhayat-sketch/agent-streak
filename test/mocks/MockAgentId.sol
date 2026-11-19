// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentId} from "../../src/interfaces/IAgentId.sol";

/// @notice Test double for the Agent ID registry. Real-registry behaviour is
///         covered by the fork test (test/AgentStreakFork.t.sol).
contract MockAgentId is IAgentId {
    mapping(address => bool) public hasId;
    mapping(address => string) public override handleOf;

    function setHolder(address user, string calldata handle) external {
        hasId[user] = true;
        handleOf[user] = handle;
    }

    function balanceOf(address owner) external view override returns (uint256) {
        return hasId[owner] ? 1 : 0;
    }
}
