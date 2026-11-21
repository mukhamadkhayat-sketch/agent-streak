// Agent Streak frontend — Node test harness (offline logic + live RPC reads).
// Loads the REAL frontend files (config.js, abi.js) and exercises the same
// calls the page makes. Run: node test-chain.js
const fs = require("fs");
const vm = require("vm");
const { ethers } = require("ethers");

const FE = "/home/hatch/workspace/agent-id-hackathon/frontend";
const KHATELL = "0xa80a0A7D06468d2ea00d21710180a768a0bDBaCa";

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// ---- load real frontend files into a vm context ----
const ctx = vm.createContext({ console });
const src =
  fs.readFileSync(`${FE}/js/config.js`, "utf8") + "\n" +
  fs.readFileSync(`${FE}/js/abi.js`, "utf8") + "\n" +
  ";globalThis.CONFIG=CONFIG;globalThis.AGENT_STREAK_ABI=AGENT_STREAK_ABI;" +
  "globalThis.STREAK_BADGE_ABI=STREAK_BADGE_ABI;globalThis.AGENT_ID_ABI=AGENT_ID_ABI;" +
  "globalThis.CONTRACTS_DEPLOYED=CONTRACTS_DEPLOYED;globalThis.ZERO_ADDRESS=ZERO_ADDRESS;";
vm.runInContext(src, ctx);
const { CONFIG, AGENT_STREAK_ABI, STREAK_BADGE_ABI, AGENT_ID_ABI, CONTRACTS_DEPLOYED } = ctx;

console.log("== 1. Config ==");
check("CHAIN_ID is 56", CONFIG.CHAIN_ID === 56);
check("registry address is checksummed",
  ethers.getAddress(CONFIG.AGENT_ID_REGISTRY) === CONFIG.AGENT_ID_REGISTRY);
check("AgentStreak address is zero placeholder (not deployed)",
  CONFIG.AGENT_STREAK_ADDRESS === "0x0000000000000000000000000000000000000000");
check("CONTRACTS_DEPLOYED is false", CONTRACTS_DEPLOYED === false);
check("RPC list non-empty", CONFIG.READ_RPCS.length >= 8, `${CONFIG.READ_RPCS.length} RPCs`);
check("tier thresholds 3/7/14/30",
  CONFIG.TIERS.map((t) => t.days).join(",") === "3,7,14,30");

console.log("== 2. ABI interfaces (ethers v6) ==");
function hasFns(abi, fns) {
  const iface = new ethers.Interface(abi);
  return fns.every((f) => { try { iface.getFunction(f); return true; } catch { return false; } });
}
function hasEvents(abi, evs) {
  const iface = new ethers.Interface(abi);
  return evs.every((e) => { try { iface.getEvent(e); return true; } catch { return false; } });
}
check("AgentStreak ABI has all functions the page calls",
  hasFns(AGENT_STREAK_ABI, ["checkIn", "getUser", "getUsers", "hasCheckedInToday",
    "tierOfStreak", "userCount", "totalCheckInCount", "badge", "paused", "currentDay"]));
check("AgentStreak ABI has CheckIn + TierReached events",
  hasEvents(AGENT_STREAK_ABI, ["CheckIn", "TierReached"]));
check("StreakBadge ABI has tokenURI/balanceOf/ownerOf/nextTokenId/tierOf",
  hasFns(STREAK_BADGE_ABI, ["tokenURI", "balanceOf", "ownerOf", "nextTokenId", "tierOf"]));
check("Agent ID ABI has balanceOf/handleOf",
  hasFns(AGENT_ID_ABI, ["balanceOf", "handleOf"]));
// Encode a checkIn() call — proves the ABI is usable for the write path.
const iface = new ethers.Interface(AGENT_STREAK_ABI);
check("checkIn() calldata encodes", iface.encodeFunctionData("checkIn").length === 10,
  iface.encodeFunctionData("checkIn"));

console.log("== 3. decodeTokenUri logic (contract-shaped sample) ==");
function decodeTokenUri(uri) {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) throw new Error("Unexpected tokenURI format");
  return JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8"));
}
const sampleSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><text>Bronze</text><text>khatell.ai</text></svg>';
const sampleJson = JSON.stringify({
  name: "Agent Streak Badge - Bronze",
  description: "Soulbound proof of a 3-day daily check-in streak by an Agent ID holder. No monetary value, no yield, no redemption.",
  image: "data:image/svg+xml;base64," + Buffer.from(sampleSvg).toString("base64"),
  attributes: [
    { trait_type: "Tier", value: "Bronze" },
    { trait_type: "StreakDays", value: 3 },
    { trait_type: "AgentID", value: "khatell.ai" },
  ],
});
const sampleUri = "data:application/json;base64," + Buffer.from(sampleJson).toString("base64");
const meta = decodeTokenUri(sampleUri);
check("tokenURI decodes to valid JSON", meta.name === "Agent Streak Badge - Bronze");
check("attributes parsed", meta.attributes.find((a) => a.trait_type === "StreakDays").value === 3);
const svgBack = Buffer.from(meta.image.split(",")[1], "base64").toString("utf8");
check("embedded SVG round-trips", svgBack.includes("khatell.ai") && svgBack.includes("Bronze"));

console.log("== 4. Leaderboard sort logic ==");
const rows = [
  { addr: "0x1", streak: 5, best: 9 },
  { addr: "0x2", streak: 12, best: 12 },
  { addr: "0x3", streak: 5, best: 14 },
  { addr: "0x4", streak: 0, best: 3 },
];
rows.sort((a, b) => b.streak - a.streak || b.best - a.best);
check("sort: streak desc, then best desc",
  rows.map((r) => r.addr).join(",") === "0x2,0x3,0x1,0x4", rows.map((r) => r.addr).join(","));

console.log("== 5. Live RPC probe + registry reads (BSC mainnet) ==");
async function probeRpc(url, timeoutMs) {
  const t0 = Date.now();
  try {
    const p = new ethers.JsonRpcProvider(url);
    const bn = await Promise.race([
      p.getBlockNumber(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    return { url, ok: true, ms: Date.now() - t0, block: bn };
  } catch (e) {
    return { url, ok: false, ms: Date.now() - t0, err: e.message.slice(0, 60) };
  }
}

(async () => {
  let working = null;
  for (const url of CONFIG.READ_RPCS) {
    const r = await probeRpc(url, CONFIG.RPC_PROBE_TIMEOUT_MS);
    console.log(`  ${r.ok ? "OK " : "BAD"} ${url} ${r.ok ? `(${r.ms}ms, block ${r.block})` : `— ${r.err}`}`);
    if (r.ok && !working) working = r.url;
  }
  check("at least one RPC answers", !!working, working || "none");
  if (!working) { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(1); }

  const provider = new ethers.JsonRpcProvider(working);
  const registry = new ethers.Contract(CONFIG.AGENT_ID_REGISTRY, AGENT_ID_ABI, provider);
  const bal = await registry.balanceOf(KHATELL);
  check("balanceOf(khatell.ai) == 1", Number(bal) === 1, `got ${bal}`);
  const handle = await registry.handleOf(KHATELL);
  check('handleOf(khatell.ai) == "khatell"', handle === "khatell", `got "${handle}"`);
  // Non-holder returns 0 — the page relies on this for the gate.
  const bal2 = await registry.balanceOf("0x0000000000000000000000000000000000000001");
  check("balanceOf(random addr) == 0", Number(bal2) === 0);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
