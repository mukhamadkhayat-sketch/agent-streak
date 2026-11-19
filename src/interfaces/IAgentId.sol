// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface of the SPACE ID Agent ID registry (HandleRegistry).
/// @dev BSC mainnet: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
///      Verified exact match on Sourcify (2026-10-16). NOT a proxy, NOT upgradeable.
///      Ownership: balanceOf > 0. Handle (name without ".ai"): handleOf(address).
///      tokenId = uint256(keccak256(handle)) — NOT sequential.
interface IAgentId {
    function balanceOf(address owner) external view returns (uint256);
    function handleOf(address owner) external view returns (string memory);
}
