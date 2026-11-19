// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title StreakBadge — soulbound badge NFT for Agent Streak
/// @notice Fully on-chain metadata (JSON + SVG, base64 data URI). No external
///         dependency, no IPFS, no server.
///
///         Privileges (documented for the hackathon red lines):
///         - ONLY the AgentStreak contract (immutable `streak` address) can mint.
///         - There is NO owner, NO admin function, NO burn, NO transfer, NO
///           approval. Once minted, a badge can never move or be taken away.
///         - The contract never holds funds: no payable function, no withdraw.
contract StreakBadge is ERC721 {
    using Strings for uint256;

    enum Tier {
        NONE,
        BRONZE, // 3-day streak
        SILVER, // 7-day streak
        GOLD, // 14-day streak
        DIAMOND // 30-day streak
    }

    address public immutable streak;
    uint256 public nextTokenId;

    mapping(uint256 => Tier) public tierOf;
    mapping(uint256 => string) public handleOfToken;
    mapping(uint256 => uint256) public streakAtMint;

    error Soulbound();
    error OnlyStreak();

    constructor(address streak_) ERC721("Agent Streak Badge", "STREAK") {
        streak = streak_;
    }

    modifier onlyStreak() {
        if (msg.sender != streak) revert OnlyStreak();
        _;
    }

    /// @notice Mint a badge. Callable ONLY by the AgentStreak contract.
    /// @dev Uses _mint (not _safeMint) on purpose: Agent ID holders include
    ///      smart accounts (e.g. Agentic Wallets) that do not implement
    ///      ERC721Receiver. The Agent ID registry itself mints the same way
    ///      for the same reason. The token is soulbound, so the receiver check
    ///      adds no safety here.
    function mint(address to, Tier tier, uint256 streakDays, string calldata handle)
        external
        onlyStreak
        returns (uint256 tokenId)
    {
        tokenId = nextTokenId++;
        tierOf[tokenId] = tier;
        handleOfToken[tokenId] = handle;
        streakAtMint[tokenId] = streakDays;
        _mint(to, tokenId);
    }

    /// @notice Soulbound: only minting (token does not exist yet) is allowed.
    ///         Transfers and burns always revert. Same pattern as the Agent ID
    ///         registry (HandleRegistry._update).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    /// @notice Fully on-chain metadata. Handles are [a-z0-9] only (enforced by
    ///         the Agent ID registry), so no escaping is needed inside SVG/JSON.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Tier tier = tierOf[tokenId];
        string memory tierName = _tierName(tier);
        string memory color = _tierColor(tier);
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<rect width="400" height="400" rx="24" fill="#0b0e11"/>',
            '<rect x="12" y="12" width="376" height="376" rx="16" fill="none" stroke="',
            color,
            '" stroke-width="4"/>',
            '<text x="200" y="150" font-family="sans-serif" font-size="42" font-weight="bold" fill="',
            color,
            '" text-anchor="middle">',
            tierName,
            "</text>",
            '<text x="200" y="210" font-family="sans-serif" font-size="28" fill="#ffffff" text-anchor="middle">',
            handleOfToken[tokenId],
            ".ai</text>",
            '<text x="200" y="260" font-family="sans-serif" font-size="24" fill="#b7bdc6" text-anchor="middle">',
            streakAtMint[tokenId].toString(),
            "-day streak</text>",
            '<text x="200" y="330" font-family="sans-serif" font-size="18" fill="#848e9c" text-anchor="middle">Agent Streak - BNB Chain</text>',
            "</svg>"
        );
        string memory json = string.concat(
            '{"name":"Agent Streak Badge - ',
            tierName,
            '",',
            '"description":"Soulbound proof of a ',
            streakAtMint[tokenId].toString(),
            "-day daily check-in streak by an Agent ID holder. No monetary value, no yield, no redemption.\",",
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '",',
            '"attributes":[{"trait_type":"Tier","value":"',
            tierName,
            '"},{"trait_type":"StreakDays","value":',
            streakAtMint[tokenId].toString(),
            '},{"trait_type":"AgentID","value":"',
            handleOfToken[tokenId],
            '.ai"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _tierName(Tier tier) internal pure returns (string memory) {
        if (tier == Tier.BRONZE) return "Bronze";
        if (tier == Tier.SILVER) return "Silver";
        if (tier == Tier.GOLD) return "Gold";
        if (tier == Tier.DIAMOND) return "Diamond";
        return "None";
    }

    function _tierColor(Tier tier) internal pure returns (string memory) {
        if (tier == Tier.BRONZE) return "#cd7f32";
        if (tier == Tier.SILVER) return "#c0c0c0";
        if (tier == Tier.GOLD) return "#f0b90b";
        if (tier == Tier.DIAMOND) return "#5eead4";
        return "#848e9c";
    }
}
