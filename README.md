# Agent Streak

Daily check-in streaks for Agent ID holders — a proof-of-consistency dApp for
the **Binance Wallet × BNB Chain Agent ID Hackathon** (Nov–Dec 2026).

An Agent ID holder checks in once per UTC day (free — gas only). Consecutive
days build an on-chain streak. Reaching **3 / 7 / 14 / 30 days** mints a
**soulbound StreakBadge NFT** (Bronze / Silver / Gold / Diamond) with fully
on-chain metadata. Missing a day resets the streak to 1; the best streak is
kept forever. A leaderboard ranks holders by streak.

**No token. No fees. No yield. No promises of return. No trading.**

## How Agent ID is used (core, not bolt-on)

- **Access control:** only Agent ID holders can check in. The contract reads
  `balanceOf(address) > 0` on the SPACE ID Agent ID registry
  (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, BSC mainnet).
- **Identity:** the holder's on-chain handle (`handleOf(address)`) is stamped
  into every badge and shown on the leaderboard.
- **One identity, one streak:** Agent ID is soulbound and one-per-address, so
  a streak is genuinely bound to one agent identity.

## Contracts

| Contract | Description |
|---|---|
| `AgentStreak` | Check-in logic, streak accounting, tier thresholds, leaderboard views. Deploys `StreakBadge` in its constructor. |
| `StreakBadge` | Soulbound ERC-721 badge. Mintable ONLY by `AgentStreak`. Fully on-chain JSON + SVG metadata. |

Deployed addresses: *TBD (Phase 2 — not yet deployed).*

## Owner permissions (disclosed, per hackathon rules)

`AgentStreak` owner (the deployer) can ONLY:

- `pause()` / `unpause()` check-ins (emergency only);
- transfer or renounce ownership (OpenZeppelin `Ownable`).

The owner CANNOT mint badges, change tiers, edit streaks, touch user data, or
move funds — the contract never holds funds (no payable function, no
`receive`/`fallback`, no withdraw). `StreakBadge` has NO owner and NO admin
function at all: the only privileged caller is the immutable `AgentStreak`
address, which can only mint.

## Safety red-line compliance

- No QR-code / pairing-code login anywhere; users sign with their own wallet.
- No prompts or skills that bypass user transaction confirmation.
- No scheduled/automatic transfers, no bundled extra transfers, no approvals
  requested at all (the dApp never asks for token/NFT approvals).
- Contracts open-source, owner permissions documented above.
- No use of "Binance" / "BNB" in project, token, or domain names.
- No collection of seed phrases, private keys, API secrets, or pairing codes.
- No promised returns; badges are explicitly non-monetary reputation.
- No trading functionality, so no risk-warning page is required.
- Agent ID is NOT packaged as a lookup tool for other people's wallets;
  handles are shown only for users who voluntarily checked in (public
  on-chain activity they performed themselves).

## Build & test

```bash
forge build
forge test                          # 22 tests: 18 unit + 4 BSC mainnet fork
forge test --match-contract Fork    # fork tests only (needs BSC RPC)
forge script script/Deploy.s.sol --rpc-url bsc   # DRY RUN only (no --broadcast)
```

- Solidity 0.8.24, OpenZeppelin Contracts v5.7.0, Foundry.
- Fork tests run against live BSC mainnet state (latest block; BSC public
  RPCs prune history, so no pinned block).

## Gas (measured, BSC @ 0.05 gwei, 19 Nov 2026)

| Action | Gas | BNB | ~IDR |
|---|---|---|---|
| Deploy (both contracts, 1 tx) | 3,628,253 | 0.0001814 | Rp 1.958 |
| First check-in | ~198,000 | 0.0000099 | Rp 107 |
| Regular check-in | ~59,000 | 0.0000030 | Rp 32 |
| Tier-up check-in (badge mint) | ~228,000 | 0.0000114 | Rp 123 |

BNB price: Rp 10.791.869 (CoinGecko, 19 Nov 2026).

## License

MIT. See `LICENSE` (to be added on public release).
