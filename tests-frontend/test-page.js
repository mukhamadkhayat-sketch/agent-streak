// Agent Streak frontend — jsdom smoke test.
// Loads the REAL index.html over a local HTTP server (like GitHub Pages
// would serve it) and checks the page boots without JS errors and renders
// the not-deployed state correctly.
//
// NOTE: jsdom's resource loader cannot reach the public internet from this
// sandbox (proxy), so the ethers.js CDN scripts are stubbed out and the
// locally installed ethers 6.13.5 (same version) is injected instead.
// CDN availability itself was verified separately with curl (HTTP 200 on
// both jsDelivr and unpkg). Run: node test-page.js (server on 127.0.0.1:8765)
const { JSDOM, VirtualConsole, ResourceLoader } = require("jsdom");
const { ethers } = require("ethers");

// Stub the CDN scripts — the real ethers is injected via beforeParse.
class TestLoader extends ResourceLoader {
  fetch(url, options) {
    if (url.includes("cdn.jsdelivr.net") || url.includes("unpkg.com")) {
      return Promise.resolve(Buffer.from("/* ethers stubbed: injected by harness */"));
    }
    return super.fetch(url, options);
  }
}

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

(async () => {
  const dom = await JSDOM.fromURL("http://127.0.0.1:8765/", {
    resources: new TestLoader(),
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.ethers = ethers; // same version as the CDN (6.13.5)
    },
  });
  // Wait for async init: RPC probes + page loads.
  await new Promise((r) => setTimeout(r, 30000));
  const doc = dom.window.document;
  const text = (id) => { const el = doc.getElementById(id); return el ? el.textContent.trim() : "<missing>"; };

  console.log("== jsdom page boot ==");
  check("no JS errors captured", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("ethers present in page", typeof dom.window.ethers !== "undefined");
  check("deploy banner visible (contracts not deployed)",
    doc.getElementById("deployBanner") && !doc.getElementById("deployBanner").hidden);
  const utcDay = Math.floor(Date.now() / 86400000).toString();
  check("current UTC day shown", text("statDay") === utcDay, `got "${text("statDay")}", want ${utcDay}`);
  check("countdown ticking (HH:MM:SS)", /^\d{2}:\d{2}:\d{2}$/.test(text("statCountdown")), text("statCountdown"));
  check("leaderboard shows not-deployed note",
    text("boardBody").includes("unlocks after the contracts deploy"), text("boardBody").slice(0, 60));
  check("recent feed shows not-deployed note",
    text("recentList").includes("unlocks after the contracts deploy"));
  check("connect button present", text("connectBtn") === "Connect Wallet");
  check("check-in button disabled pre-deploy",
    doc.getElementById("checkinBtn").disabled === true);
  check("no global error banner", doc.getElementById("globalError").hidden === true);
  check("FAQ present", doc.querySelectorAll("#faq details").length >= 6,
    `${doc.querySelectorAll("#faq details").length} items`);
  check("disclaimer mentions no monetary value",
    doc.querySelector(".disclaimer").textContent.includes("no monetary value"));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})();
