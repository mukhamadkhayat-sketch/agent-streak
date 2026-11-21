// Agent Streak frontend — local anvil end-to-end read test.
// Deploys the REAL contracts (AgentStreak + MockAgentId registry) to a local
// anvil chain, performs real check-ins from the khatell.ai + fafatoni.ai
// addresses (impersonated, registered as holders in the mock with their real
// handles), then runs the EXACT read calls the frontend makes.
// NOTE: a BSC-mainnet fork was tried first but anvil's fork backend fails in
// this sandbox ("missing trie node" from every public RPC). The real registry
// is covered separately by test-chain.js (live balanceOf/handleOf reads).
// Requires: anvil on 127.0.0.1:8545 + deployed addresses.
// Usage: REGISTRY=<mock addr> node test-fork.js <AgentStreak address>
const { ethers } = require("ethers");
const fs = require("fs");
const vm = require("vm");

const FE = "/home/hatch/workspace/agent-id-hackathon/frontend";
const KHATELL = "0xa80a0A7D06468d2ea00d21710180a768a0bDBaCa";
const FAFATONI = "0x423F9ADc4fD93fcA2b34a5D882D670A127491556";

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// Load the real frontend ABI + config.
const ctx = vm.createContext({ console });
const src =
  fs.readFileSync(`${FE}/js/config.js`, "utf8") + "\n" +
  fs.readFileSync(`${FE}/js/abi.js`, "utf8") + "\n" +
  ";globalThis.CONFIG=CONFIG;globalThis.AGENT_STREAK_ABI=AGENT_STREAK_ABI;" +
  "globalThis.STREAK_BADGE_ABI=STREAK_BADGE_ABI;globalThis.AGENT_ID_ABI=AGENT_ID_ABI;";
vm.runInContext(src, ctx);
const { CONFIG, AGENT_STREAK_ABI, STREAK_BADGE_ABI, AGENT_ID_ABI } = ctx;

// Verbatim copy of decodeTokenUri from frontend/js/app.js (atob is global in Node 24).
function decodeTokenUri(uri) {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) throw new Error("Unexpected tokenURI format");
  return JSON.parse(atob(uri.slice(prefix.length)));
}

(async () => {
  const streakAddr = process.argv[2];
  if (!streakAddr) { console.error("usage: REGISTRY=<mock> node test-fork.js <AgentStreak address>"); process.exit(2); }
  const registryAddr = process.env.REGISTRY || CONFIG.AGENT_ID_REGISTRY;
  console.log("registry under test:", registryAddr);
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const streak = new ethers.Contract(streakAddr, AGENT_STREAK_ABI, provider);
  const registry = new ethers.Contract(registryAddr, AGENT_ID_ABI, provider);

  console.log("== 1. Setup: impersonate Agent ID holders (mock registry) ==");
  for (const a of [KHATELL, FAFATONI]) {
    await provider.send("anvil_impersonateAccount", [a]);
    await provider.send("anvil_setBalance", [a, "0x56BC75E2D63100000"]); // 0.1 BNB
  }
  check("khatell holds Agent ID (mock)", Number(await registry.balanceOf(KHATELL)) === 1);
  check("fafatoni holds Agent ID (mock)", Number(await registry.balanceOf(FAFATONI)) === 1);

  console.log("== 2. Real check-ins: khatell 3 days, fafatoni 1 day ==");
  const khatell = await provider.getSigner(KHATELL);
  const fafa = await provider.getSigner(FAFATONI);
  const wK = streak.connect(khatell);
  const wF = streak.connect(fafa);
  await (await wK.checkIn()).wait();
  await (await wF.checkIn()).wait();
  await provider.send("evm_increaseTime", [86400]);
  await provider.send("evm_mine", []);
  await (await wK.checkIn()).wait();
  await provider.send("evm_increaseTime", [86400]);
  await provider.send("evm_mine", []);
  const tx3 = await wK.checkIn();
  const rc3 = await tx3.wait();
  check("3rd check-in (tier-up) mined", rc3.status === 1);
  const tierEv = rc3.logs.map((l) => { try { return streak.interface.parseLog(l); } catch { return null; } })
    .find((p) => p && p.name === "TierReached");
  check("TierReached event emitted on day 3", !!tierEv, tierEv ? `tier=${tierEv.args.tier} tokenId=${tierEv.args.tokenId}` : "");

  console.log("== 3. Frontend read calls (exact) ==");
  const user = await streak.getUser(KHATELL);
  check("getUser(khatell): streak 3", Number(user[0]) === 3, `streak=${user[0]} best=${user[1]} total=${user[2]}`);
  check("hasCheckedInToday(khatell) true", (await streak.hasCheckedInToday(KHATELL)) === true);
  check("userCount == 2", Number(await streak.userCount()) === 2);
  check("totalCheckInCount == 4", Number(await streak.totalCheckInCount()) === 4);
  const [users, streaks, bests] = await streak.getUsers(0, 100);
  check("getUsers(0,100) returns both users", users.length === 2);
  const rows = users.map((u, i) => ({ addr: u, streak: Number(streaks[i]), best: Number(bests[i]) }));
  for (const r of rows) r.handle = (await registry.handleOf(r.addr)) + ".ai";
  rows.sort((a, b) => b.streak - a.streak || b.best - a.best);
  check("leaderboard: khatell.ai first with streak 3",
    rows[0].handle === "khatell.ai" && rows[0].streak === 3, JSON.stringify(rows));
  check("leaderboard: fafatoni.ai second with streak 1",
    rows[1].handle === "fafatoni.ai" && rows[1].streak === 1);

  console.log("== 4. Badge scan + REAL tokenURI decode (frontend path) ==");
  const badgeAddr = await streak.badge();
  const badge = new ethers.Contract(badgeAddr, STREAK_BADGE_ABI, provider);
  const bal = await badge.balanceOf(KHATELL);
  check("khatell badge balance == 1", Number(bal) === 1);
  const nextId = Number(await badge.nextTokenId());
  const owners = await Promise.all(
    Array.from({ length: nextId }, (_, id) => badge.ownerOf(id).catch(() => null)));
  const mine = owners.map((o, id) => ({ o, id })).filter((x) => x.o === KHATELL).map((x) => x.id);
  check("ownerOf scan finds khatell's token", mine.length === 1, `tokenId=${mine[0]}`);
  const uri = await badge.tokenURI(mine[0]);
  const meta = decodeTokenUri(uri); // the frontend's verbatim function
  check("real tokenURI decodes (frontend function)", meta.name === "Agent Streak Badge - Bronze", meta.name);
  check("real tokenURI attributes", meta.attributes.find((a) => a.trait_type === "AgentID").value === "khatell.ai"
    && meta.attributes.find((a) => a.trait_type === "StreakDays").value === 3);
  const svg = Buffer.from(meta.image.split(",")[1], "base64").toString("utf8");
  check("real embedded SVG contains handle + tier", svg.includes("khatell.ai") && svg.includes("Bronze"));

  console.log("== 5. CheckIn event query (recent feed path) ==");
  const events = await streak.queryFilter(streak.filters.CheckIn(), 0, "latest");
  check("queryFilter(CheckIn) returns 4 events", events.length === 4, `got ${events.length}`);
  check("latest event is khatell streak 3",
    events[events.length - 1].args.user === KHATELL && Number(events[events.length - 1].args.streak) === 3);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
