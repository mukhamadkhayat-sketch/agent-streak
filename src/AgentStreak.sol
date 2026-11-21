// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IAgentId} from "./interfaces/IAgentId.sol";
import {StreakBadge} from "./StreakBadge.sol";

/// @title AgentStreak — daily check-in streaks for Agent ID holders
/// @notice A proof-of-consistency dApp for agents: an Agent ID holder checks in
///         once per UTC day (free — gas only). Consecutive days build a streak,
///         recorded on-chain. Reaching 3 / 7 / 14 / 30 days mints a soulbound
///         StreakBadge NFT of the matching tier. Missing a day resets the streak
///         to 1 on the next check-in; the best streak is kept forever.
///
///         Agent ID integration (the core of the product, not a bolt-on):
///         - Only Agent ID holders can check in (balanceOf > 0 on the registry).
///         - The holder's on-chain handle (handleOf) is stamped into each badge.
///         - Leaderboard identity is the Agent ID handle, resolved on-chain.
///
///         Privileges (documented for the hackathon red lines):
///         - Owner can ONLY pause / unpause check-ins (emergency) and transfer /
///           renounce ownership. No minting, no fund handling, no parameter
///           changes, no user-data writes.
///         - The contract never holds funds: checkIn is NOT payable, there is no
///           receive/fallback, no withdraw function. No token, no fees, no
///           rewards, no promises of return, no trading.
contract AgentStreak is Ownable, Pausable {
    IAgentId public immutable agentId;
    StreakBadge public immutable badge;

    uint256 public constant DAY = 1 days;
    uint256 public constant TIER_BRONZE = 3;
    uint256 public constant TIER_SILVER = 7;
    uint256 public constant TIER_GOLD = 14;
    uint256 public constant TIER_DIAMOND = 30;

    mapping(address => uint256) public lastCheckInDay;
    mapping(address => uint256) public currentStreak;
    mapping(address => uint256) public bestStreak;
    mapping(address => uint256) public totalCheckIns;
    mapping(address => mapping(StreakBadge.Tier => bool)) public tierClaimed;

    address[] private _users;
    mapping(address => bool) private _isUser;
    uint256 public totalCheckInCount;

    event CheckIn(address indexed user, uint256 indexed day, uint256 streak);
    event TierReached(address indexed user, StreakBadge.Tier indexed tier, uint256 indexed tokenId, uint256 streak);

    error NotAgentIdHolder();
    error AlreadyCheckedIn();

    /// @param agentId_ Address of the Agent ID registry (HandleRegistry).
    /// @param owner_  Owner of this contract (pause/unpause + ownership mgmt).
    ///        Passed explicitly (not msg.sender) because the contract is
    ///        deployed through a CREATE2 factory proxy: with a factory,
    ///        msg.sender inside the constructor would be the factory itself,
    ///        bricking owner functions. The deployer passes its own address.
    constructor(address agentId_, address owner_) Ownable(owner_) {
        agentId = IAgentId(agentId_);
        badge = new StreakBadge(address(this));
    }

    /// @notice Current UTC day number (block.timestamp / 86400).
    function currentDay() public view returns (uint256) {
        return block.timestamp / DAY;
    }

    /// @notice Check in for today. Free (gas only). One check-in per UTC day.
    ///         Consecutive days extend the streak; a missed day resets it to 1.
    ///         Reaching a tier threshold mints the matching soulbound badge.
    function checkIn() external whenNotPaused {
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        uint256 day = currentDay();
        uint256 lastDay = lastCheckInDay[msg.sender];
        if (lastDay == day) revert AlreadyCheckedIn();

        // day >= 1 in practice (block.timestamp >> 0), so day - 1 never underflows.
        // First check-in ever: lastDay == 0, day is huge -> streak = 1.
        uint256 streak = (lastDay == day - 1) ? currentStreak[msg.sender] + 1 : 1;

        if (!_isUser[msg.sender]) {
            _isUser[msg.sender] = true;
            _users.push(msg.sender);
        }
        lastCheckInDay[msg.sender] = day;
        currentStreak[msg.sender] = streak;
        totalCheckIns[msg.sender] += 1;
        totalCheckInCount += 1;
        if (streak > bestStreak[msg.sender]) bestStreak[msg.sender] = streak;

        emit CheckIn(msg.sender, day, streak);

        StreakBadge.Tier tier = _tierFor(streak);
        if (tier != StreakBadge.Tier.NONE && !tierClaimed[msg.sender][tier]) {
            tierClaimed[msg.sender][tier] = true;
            string memory handle = agentId.handleOf(msg.sender);
            uint256 tokenId = badge.mint(msg.sender, tier, streak, handle);
            emit TierReached(msg.sender, tier, tokenId, streak);
        }
    }

    /// @notice Highest tier a given streak length qualifies for (display helper).
    function tierOfStreak(uint256 streak) public pure returns (StreakBadge.Tier) {
        if (streak >= TIER_DIAMOND) return StreakBadge.Tier.DIAMOND;
        if (streak >= TIER_GOLD) return StreakBadge.Tier.GOLD;
        if (streak >= TIER_SILVER) return StreakBadge.Tier.SILVER;
        if (streak >= TIER_BRONZE) return StreakBadge.Tier.BRONZE;
        return StreakBadge.Tier.NONE;
    }

    /// @notice Exact tier minted when a streak lands exactly on a threshold.
    function _tierFor(uint256 streak) internal pure returns (StreakBadge.Tier) {
        if (streak == TIER_DIAMOND) return StreakBadge.Tier.DIAMOND;
        if (streak == TIER_GOLD) return StreakBadge.Tier.GOLD;
        if (streak == TIER_SILVER) return StreakBadge.Tier.SILVER;
        if (streak == TIER_BRONZE) return StreakBadge.Tier.BRONZE;
        return StreakBadge.Tier.NONE;
    }

    /// @notice Whether `user` already checked in today.
    function hasCheckedInToday(address user) external view returns (bool) {
        return lastCheckInDay[user] == currentDay();
    }

    /// @notice Full streak profile of one user.
    function getUser(address user)
        external
        view
        returns (uint256 streak, uint256 best, uint256 total, uint256 lastDay)
    {
        return (currentStreak[user], bestStreak[user], totalCheckIns[user], lastCheckInDay[user]);
    }

    /// @notice Number of distinct users who ever checked in.
    function userCount() external view returns (uint256) {
        return _users.length;
    }

    /// @notice Paginated user list with streaks, for the leaderboard.
    ///         Sorting is done off-chain (frontend / indexer); the contract only
    ///         exposes raw data, keeping check-in gas low.
    function getUsers(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory users, uint256[] memory streaks, uint256[] memory bests)
    {
        uint256 total = _users.length;
        if (offset >= total) {
            return (new address[](0), new uint256[](0), new uint256[](0));
        }
        uint256 end = offset + limit > total ? total : offset + limit;
        uint256 len = end - offset;
        users = new address[](len);
        streaks = new uint256[](len);
        bests = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            address u = _users[offset + i];
            users[i] = u;
            streaks[i] = currentStreak[u];
            bests[i] = bestStreak[u];
        }
    }

    /// @notice Emergency pause (owner only). Check-ins revert while paused.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume check-ins (owner only).
    function unpause() external onlyOwner {
        _unpause();
    }
}
