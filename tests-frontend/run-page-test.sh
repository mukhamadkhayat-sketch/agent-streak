#!/bin/bash
# Agent Streak page smoke test driver: serve ../frontend over HTTP, run the
# jsdom boot test (test-page.js), stop the server.
set -u
ROOT="$HOME/workspace/agent-id-hackathon"
TESTS="$ROOT/tests-frontend"
cd "$ROOT/frontend"
nohup python3 -m http.server 8765 >"$TESTS/server.log" 2>&1 &
SRV_PID=$!
trap 'kill $SRV_PID 2>/dev/null' EXIT
sleep 1
for p in / /index.html /css/style.css /js/config.js /js/abi.js /js/app.js /.nojekyll; do
  printf "%s -> " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8765$p"
done
cd "$TESTS" && node test-page.js
