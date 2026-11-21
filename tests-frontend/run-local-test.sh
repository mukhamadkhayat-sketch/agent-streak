#!/bin/bash
# Agent Streak local e2e test driver: plain anvil -> DeployLocal script
# (MockAgentId + AgentStreak, holders pre-registered) -> Node read-path test.
# Local only — no real funds, no mainnet.
set -u
export PATH="$HOME/.foundry/bin:$PATH"
KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
RPC="http://127.0.0.1:8545"
ROOT="$HOME/workspace/agent-id-hackathon"
TESTS="$ROOT/tests-frontend"
cd "$ROOT"

nohup anvil --chain-id 56 --port 8545 >"$TESTS/anvil.log" 2>&1 &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null' EXIT
for i in $(seq 1 30); do
  if curl -s -m 2 -X POST $RPC -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | grep -q result; then
    echo "anvil up after ${i}s"; break
  fi
  sleep 1
  if [ "$i" = 30 ]; then echo "ANVIL FAILED TO START"; tail -20 "$TESTS/anvil.log"; exit 1; fi
done

DEPLOY_OUT=$(forge script script/DeployLocal.s.sol --rpc-url $RPC \
  --broadcast --private-key "$KEY" 2>&1)
DEPLOY_RC=$?
echo "$DEPLOY_OUT" | grep -E "MockAgentId:|AgentStreak:|StreakBadge:"
[ "$DEPLOY_RC" -eq 0 ] || { echo "DEPLOY FAILED (rc=$DEPLOY_RC)"; echo "$DEPLOY_OUT" | tail -15; exit 1; }
MOCK=$(echo "$DEPLOY_OUT" | grep -oE "MockAgentId: 0x[0-9a-fA-F]{40}" | awk '{print $2}')
STREAK=$(echo "$DEPLOY_OUT" | grep -oE "AgentStreak: 0x[0-9a-fA-F]{40}" | awk '{print $2}')
[ -n "$MOCK" ] && [ -n "$STREAK" ] || { echo "COULD NOT PARSE ADDRESSES"; echo "$DEPLOY_OUT" | tail -15; exit 1; }
CODE=$(cast code "$STREAK" --rpc-url $RPC)
[ "$CODE" != "0x" ] && [ -n "$CODE" ] || { echo "NO CODE AT $STREAK"; exit 1; }
echo "code present at $STREAK"

cd "$TESTS" && REGISTRY="$MOCK" node test-fork.js "$STREAK"
