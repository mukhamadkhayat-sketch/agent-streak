// Agent Streak — configuration.
// ============================================================================
// DEPLOY STATUS: LIVE on BNB Chain mainnet since 21 Nov 2026.
//   AgentStreak: 0xf67d706d60092045d9f5ec1da83d7f2fcceec474 (block 134808165)
//   StreakBadge: 0xc428ec5de2350937754d585cea88807dd76fdff7
//   Deploy tx:    0x4df5e695ed1060b1d0abc7805362450c176c369725240a2aa447959db3901229
// StreakBadge address is read on-chain from AgentStreak.badge() — no need to
// configure it here.
// ============================================================================

const CONFIG = {
  // BNB Chain mainnet.
  CHAIN_ID: 56,
  CHAIN_NAME: "BNB Smart Chain",
  BLOCK_EXPLORER: "https://bscscan.com",

  // --- Contract addresses -------------------------------------------------
  // SPACE ID Agent ID registry (live, verified). Checksummed form.
  AGENT_ID_REGISTRY: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",

  // AgentStreak on BNB Chain mainnet (deployed 21 Nov 2026, block 134808165).
  AGENT_STREAK_ADDRESS: "0xf67D706d60092045D9f5EC1Da83d7F2Fcceec474",

  // Block number of the deploy transaction (for event queries).
  DEPLOY_BLOCK: 134808165,

  // --- Read RPCs (public BSC endpoints, tried in order) -------------------
  // The app probes each with a cheap getBlockNumber() call and uses the first
  // one that answers. Reads never go through the user's wallet.
  READ_RPCS: [
    "https://bsc-dataseed.binance.org/",
    "https://bsc-dataseed1.binance.org/",
    "https://bsc-dataseed2.binance.org/",
    "https://bsc-dataseed3.binance.org/",
    "https://bsc-dataseed.bnbchain.org/",
    "https://bsc-rpc.publicnode.com",
    "https://bsc.meowrpc.com",
    "https://binance.llamarpc.com",
    "https://bsc.drpc.org",
    "https://bsc-mainnet.public.blastapi.io",
    "https://1rpc.io/bnb",
    "https://bsc-dataseed1.defibit.io/",
  ],

  // How long to wait for one RPC probe before trying the next (ms).
  RPC_PROBE_TIMEOUT_MS: 8000,

  // --- Display ------------------------------------------------------------
  LEADERBOARD_SIZE: 20,
  LEADERBOARD_PAGE: 100, // getUsers() page size
  RECENT_CHECKINS: 8, // entries in the "recent activity" feed
  EVENT_LOOKBACK_BLOCKS: 50000, // ~1.7 days, when DEPLOY_BLOCK is unknown

  // Tier thresholds (must match AgentStreak.sol constants).
  TIERS: [
    { name: "Bronze", days: 3, color: "#cd7f32" },
    { name: "Silver", days: 7, color: "#c0c0c0" },
    { name: "Gold", days: 14, color: "#f0b90b" },
    { name: "Diamond", days: 30, color: "#5eead4" },
  ],
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CONTRACTS_DEPLOYED =
  CONFIG.AGENT_STREAK_ADDRESS.toLowerCase() !== ZERO_ADDRESS;
