// Agent Streak — frontend logic (vanilla JS + ethers.js v6).
// No backend, no build step. Reads go through public BSC RPCs (fallback list);
// writes are ONLY the checkIn() transaction, signed by the user in their own
// wallet. No QR login, no pairing codes, no approvals requested ever.
(function () {
  "use strict";

  // ---------- tiny helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shortAddr = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  const bscscanTx = (h) => `${CONFIG.BLOCK_EXPLORER}/tx/${h}`;
  const bscscanAddr = (a) => `${CONFIG.BLOCK_EXPLORER}/address/${a}`;

  function setStatus(text, kind) {
    const el = $("checkinStatus");
    el.textContent = text;
    el.className = "status-line" + (kind ? " " + kind : "");
  }

  function showGlobalError(text) {
    const el = $("globalError");
    el.textContent = text;
    el.hidden = false;
  }

  // Decode a "data:application/json;base64,..." tokenURI into an object.
  function decodeTokenUri(uri) {
    const prefix = "data:application/json;base64,";
    if (!uri.startsWith(prefix)) throw new Error("Unexpected tokenURI format");
    return JSON.parse(atob(uri.slice(prefix.length)));
  }

  // Next UTC midnight (day flip) countdown, "HH:MM:SS".
  function countdownToUtcMidnight() {
    const now = Date.now();
    const next = Math.ceil(now / 86400000) * 86400000;
    let s = Math.max(0, Math.floor((next - now) / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  }

  // ---------- state ----------
  let readProvider = null; // ethers.JsonRpcProvider (public RPC)
  let streakRead = null; // AgentStreak (read-only)
  let badgeRead = null; // StreakBadge (read-only)
  let badgeAddress = null;
  let registryRead = null; // Agent ID registry (read-only)
  let browserProvider = null; // ethers.BrowserProvider (user wallet)
  let account = null;
  let accountHandle = null;

  // ---------- read provider with RPC fallback ----------
  function probeRpc(url) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), CONFIG.RPC_PROBE_TIMEOUT_MS);
      const provider = new ethers.JsonRpcProvider(url);
      provider
        .getBlockNumber()
        .then(() => {
          clearTimeout(timer);
          resolve(provider);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(null);
        });
    });
  }

  async function initReadProvider() {
    for (const url of CONFIG.READ_RPCS) {
      const provider = await probeRpc(url);
      if (provider) {
        readProvider = provider;
        registryRead = new ethers.Contract(CONFIG.AGENT_ID_REGISTRY, AGENT_ID_ABI, provider);
        if (CONTRACTS_DEPLOYED) {
          streakRead = new ethers.Contract(CONFIG.AGENT_STREAK_ADDRESS, AGENT_STREAK_ABI, provider);
        }
        return url;
      }
    }
    return null;
  }

  async function resolveBadgeAddress() {
    if (!streakRead || badgeAddress) return badgeAddress;
    try {
      badgeAddress = await streakRead.badge();
      badgeRead = new ethers.Contract(badgeAddress, STREAK_BADGE_ABI, readProvider);
    } catch (e) {
      console.warn("Could not read badge address:", e);
    }
    return badgeAddress;
  }

  // ---------- public stats + countdown ----------
  async function loadPublicStats() {
    $("statDay").textContent = Math.floor(Date.now() / 86400000);
    if (!CONTRACTS_DEPLOYED || !streakRead) {
      $("statUsers").textContent = "—";
      $("statCheckins").textContent = "—";
      return;
    }
    try {
      const [users, total] = await Promise.all([
        streakRead.userCount(),
        streakRead.totalCheckInCount(),
      ]);
      $("statUsers").textContent = users.toString();
      $("statCheckins").textContent = total.toString();
    } catch (e) {
      console.warn("Stats failed:", e);
      $("statUsers").textContent = "—";
      $("statCheckins").textContent = "—";
    }
  }

  function startCountdown() {
    const tick = () => {
      $("statCountdown").textContent = countdownToUtcMidnight();
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---------- leaderboard (getUsers pagination + handle resolution) ----------
  async function loadLeaderboard() {
    const body = $("boardBody");
    const status = $("leaderboardStatus");
    if (!CONTRACTS_DEPLOYED || !streakRead) {
      body.innerHTML = '<tr><td colspan="4" class="muted">Leaderboard unlocks after the contracts deploy.</td></tr>';
      status.textContent = "";
      return;
    }
    try {
      const total = Number(await streakRead.userCount());
      if (total === 0) {
        body.innerHTML = '<tr><td colspan="4" class="muted">No check-ins yet — be the first.</td></tr>';
        status.textContent = "";
        return;
      }
      // Paginate getUsers() in chunks.
      const rows = [];
      for (let off = 0; off < total; off += CONFIG.LEADERBOARD_PAGE) {
        const [users, streaks, bests] = await streakRead.getUsers(off, CONFIG.LEADERBOARD_PAGE);
        for (let i = 0; i < users.length; i++) {
          rows.push({ addr: users[i], streak: Number(streaks[i]), best: Number(bests[i]) });
        }
      }
      // Resolve handles in batches (all leaderboard users are Agent ID holders).
      const BATCH = 20;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const handles = await Promise.all(
          chunk.map((r) => registryRead.handleOf(r.addr).catch(() => ""))
        );
        chunk.forEach((r, j) => {
          r.handle = handles[j] ? handles[j] + ".ai" : shortAddr(r.addr);
        });
      }
      rows.sort((a, b) => b.streak - a.streak || b.best - a.best);
      const top = rows.slice(0, CONFIG.LEADERBOARD_SIZE);
      body.innerHTML = top
        .map(
          (r, i) =>
            `<tr${account && r.addr.toLowerCase() === account.toLowerCase() ? ' class="me"' : ""}>` +
            `<td>${i + 1}</td><td><a href="${bscscanAddr(r.addr)}" target="_blank" rel="noopener">${esc(r.handle)}</a></td>` +
            `<td class="num">${r.streak} 🔥</td><td class="num">${r.best}</td></tr>`
        )
        .join("");
      status.textContent = `${total} agent${total === 1 ? "" : "s"} on the board.`;
    } catch (e) {
      console.warn("Leaderboard failed:", e);
      body.innerHTML = '<tr><td colspan="4" class="muted">Could not load the leaderboard — please refresh.</td></tr>';
    }
  }

  // ---------- recent check-ins (CheckIn events) ----------
  async function loadRecentCheckins() {
    const list = $("recentList");
    if (!CONTRACTS_DEPLOYED || !streakRead) {
      list.innerHTML = '<li class="muted">Recent activity unlocks after the contracts deploy.</li>';
      return;
    }
    try {
      const latest = await readProvider.getBlockNumber();
      const fromBlock =
        CONFIG.DEPLOY_BLOCK > 0
          ? CONFIG.DEPLOY_BLOCK
          : Math.max(0, latest - CONFIG.EVENT_LOOKBACK_BLOCKS);
      const events = await streakRead.queryFilter(streakRead.filters.CheckIn(), fromBlock, "latest");
      const recent = events.slice(-CONFIG.RECENT_CHECKINS).reverse();
      if (recent.length === 0) {
        list.innerHTML = "<li class='muted'>No check-ins in the recent window yet.</li>";
        return;
      }
      const handles = await Promise.all(
        recent.map((ev) => registryRead.handleOf(ev.args.user).catch(() => ""))
      );
      list.innerHTML = recent
        .map((ev, i) => {
          const name = handles[i] ? esc(handles[i]) + ".ai" : shortAddr(ev.args.user);
          return `<li>${name} checked in — streak <strong>${ev.args.streak}</strong> 🔥 <a href="${bscscanTx(ev.transactionHash)}" target="_blank" rel="noopener">tx</a></li>`;
        })
        .join("");
    } catch (e) {
      console.warn("Recent check-ins failed:", e);
      list.innerHTML = "<li class='muted'>Recent activity is unavailable right now (RPC limits event queries).</li>";
    }
  }

  // ---------- wallet ----------
  async function ensureBscNetwork() {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(chainId, 16) === CONFIG.CHAIN_ID) return true;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x38" }], // 56
      });
      return true;
    } catch (err) {
      if (err && err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x38",
                chainName: CONFIG.CHAIN_NAME,
                nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
                rpcUrls: ["https://bsc-dataseed.binance.org/"],
                blockExplorerUrls: [CONFIG.BLOCK_EXPLORER],
              },
            ],
          });
          return true;
        } catch (e2) {
          return false;
        }
      }
      return false;
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus("No injected wallet found. Install MetaMask, Binance Wallet or Trust Wallet, then try again.", "err");
      return;
    }
    try {
      setStatus("Waiting for your wallet…", "");
      browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        setStatus("No account selected.", "err");
        return;
      }
      account = accounts[0];
      const ok = await ensureBscNetwork();
      if (!ok) {
        setStatus("Please switch your wallet to BNB Chain (chain 56) and refresh.", "err");
        return;
      }
      $("connectBtn").textContent = shortAddr(account);
      $("walletStatus").hidden = true;
      $("accountBox").hidden = false;
      $("accountAddr").textContent = account;
      $("networkStatus").textContent = "BNB Chain (56) ✓";
      await refreshAccount();
    } catch (e) {
      console.warn("Connect failed:", e);
      if (e && e.code === 4001) setStatus("Connection rejected in your wallet.", "err");
      else setStatus("Could not connect wallet: " + (e && e.message ? e.message : e), "err");
    }
  }

  // ---------- account data: Agent ID, streak, badges ----------
  function nextTierInfo(streak) {
    for (const t of CONFIG.TIERS) {
      if (streak < t.days) return { tier: t, remaining: t.days - streak };
    }
    return { tier: null, remaining: 0 };
  }

  async function refreshAccount() {
    if (!account) return;
    // 1) Agent ID status (registry is live regardless of our deploy).
    try {
      const bal = await registryRead.balanceOf(account);
      if (Number(bal) > 0) {
        accountHandle = await registryRead.handleOf(account);
        $("agentIdStatus").innerHTML = `<strong>${esc(accountHandle)}.ai</strong> ✓ holder`;
      } else {
        accountHandle = null;
        $("agentIdStatus").innerHTML = "Not an Agent ID holder — check-in requires an Agent ID.";
      }
    } catch (e) {
      console.warn("Agent ID lookup failed:", e);
      $("agentIdStatus").textContent = "Lookup failed — please refresh.";
    }

    if (!CONTRACTS_DEPLOYED || !streakRead) {
      setStatus("Contracts not deployed yet — check-in unlocks after deploy.", "warn");
      $("checkinBtn").disabled = true;
      return;
    }

    // 2) Streak profile.
    try {
      const [user, checkedToday, paused] = await Promise.all([
        streakRead.getUser(account),
        streakRead.hasCheckedInToday(account),
        streakRead.paused(),
      ]);
      const streak = Number(user[0]);
      const best = Number(user[1]);
      const total = Number(user[2]);
      $("streakBox").hidden = false;
      $("curStreak").textContent = streak + " 🔥";
      $("bestStreak").textContent = best;
      $("totalCheckins").textContent = total;
      const next = nextTierInfo(streak);
      $("nextTier").textContent = next.tier
        ? `${next.tier.name} in ${next.remaining}d`
        : "All badges earned 🏆";

      const btn = $("checkinBtn");
      if (paused) {
        setStatus("Check-ins are paused by the contract owner (emergency only).", "warn");
        btn.disabled = true;
      } else if (!accountHandle) {
        setStatus("Only Agent ID holders can check in.", "warn");
        btn.disabled = true;
      } else if (checkedToday) {
        setStatus("Already checked in today ✓ — come back after 00:00 UTC (07:00 WIB).", "ok");
        btn.disabled = true;
      } else {
        setStatus(streak > 0 ? `Streak at risk! Check in today to keep your ${streak}-day streak alive.` : "Ready for your first check-in.", "");
        btn.disabled = false;
      }
    } catch (e) {
      console.warn("Streak profile failed:", e);
      setStatus("Could not load your streak — please refresh.", "err");
    }

    // 3) Badges.
    await loadMyBadges();
  }

  // StreakBadge is NOT Enumerable, so enumerate by scanning tokenIds
  // 0..nextTokenId and checking ownerOf. nextTokenId stays small (one badge
  // per tier per user), so this is cheap.
  async function loadMyBadges() {
    const grid = $("badgeGrid");
    if (!CONTRACTS_DEPLOYED) {
      grid.innerHTML = '<p class="muted">Badges unlock after the contracts deploy.</p>';
      return;
    }
    await resolveBadgeAddress();
    if (!badgeRead) {
      grid.innerHTML = '<p class="muted">Could not load badges — please refresh.</p>';
      return;
    }
    try {
      const [bal, nextId] = await Promise.all([
        badgeRead.balanceOf(account),
        badgeRead.nextTokenId(),
      ]);
      if (Number(bal) === 0) {
        grid.innerHTML = '<p class="muted">No badges yet — check in 3 days in a row to earn Bronze.</p>';
        return;
      }
      const total = Number(nextId);
      const owners = await Promise.all(
        Array.from({ length: total }, (_, id) => badgeRead.ownerOf(id).catch(() => null))
      );
      const mine = owners
        .map((owner, id) => ({ owner, id }))
        .filter((o) => o.owner && o.owner.toLowerCase() === account.toLowerCase())
        .map((o) => o.id);
      const cards = await Promise.all(
        mine.map(async (id) => {
          const [uri, tierNum] = await Promise.all([
            badgeRead.tokenURI(id),
            badgeRead.tierOf(id),
          ]);
          const meta = decodeTokenUri(uri);
          const tierName = ["None", "Bronze", "Silver", "Gold", "Diamond"][Number(tierNum)] || "?";
          const days = (meta.attributes || []).find((a) => a.trait_type === "StreakDays");
          return { id, tierName, days: days ? days.value : "?", image: meta.image, name: meta.name };
        })
      );
      grid.innerHTML = cards
        .map(
          (c) =>
            `<div class="badge-card"><img src="${esc(c.image)}" alt="${esc(c.name)}" />` +
            `<div class="badge-meta"><strong>${esc(c.tierName)}</strong><span>#${c.id} · ${c.days}-day streak · soulbound</span></div></div>`
        )
        .join("");
    } catch (e) {
      console.warn("Badges failed:", e);
      grid.innerHTML = '<p class="muted">Could not load badges — please refresh.</p>';
    }
  }

  // ---------- check-in transaction ----------
  async function doCheckIn() {
    if (!account || !browserProvider) return;
    const btn = $("checkinBtn");
    btn.disabled = true;
    try {
      setStatus("Please review and confirm the transaction in your wallet…", "");
      const signer = await browserProvider.getSigner();
      const streakWrite = new ethers.Contract(CONFIG.AGENT_STREAK_ADDRESS, AGENT_STREAK_ABI, signer);
      const tx = await streakWrite.checkIn();
      setStatus("Transaction sent — waiting for confirmation…", "");
      $("txLine").hidden = false;
      $("txLine").innerHTML = `Tx: <a href="${bscscanTx(tx.hash)}" target="_blank" rel="noopener">${tx.hash}</a>`;
      const receipt = await tx.wait();
      if (receipt.status === 1n || receipt.status === 1) {
        setStatus("Checked in! 🔥 Your streak is updated.", "ok");
      } else {
        setStatus("Transaction failed on-chain — no streak recorded.", "err");
      }
      await refreshAccount();
      await loadPublicStats();
      await loadLeaderboard();
      await loadRecentCheckins();
    } catch (e) {
      console.warn("Check-in failed:", e);
      btn.disabled = false;
      if (e && e.code === 4001) {
        setStatus("Transaction rejected in your wallet.", "err");
      } else if (e && /AlreadyCheckedIn/.test(e.message || "")) {
        setStatus("Already checked in today.", "ok");
        await refreshAccount();
      } else if (e && /NotAgentIdHolder/.test(e.message || "")) {
        setStatus("This wallet does not hold an Agent ID.", "err");
      } else {
        setStatus("Check-in failed: " + (e && e.reason ? e.reason : e.message || e), "err");
      }
    }
  }

  // ---------- boot ----------
  async function init() {
    if (typeof ethers === "undefined") {
      showGlobalError("Could not load ethers.js from the CDN. Check your connection and reload the page.");
      return;
    }

    // Deploy banner + contract link.
    if (CONTRACTS_DEPLOYED) {
      $("deployBanner").hidden = false;
      $("contractLink").href = bscscanAddr(CONFIG.AGENT_STREAK_ADDRESS);
    }

    startCountdown();
    const rpcUsed = await initReadProvider();
    if (!rpcUsed) {
      showGlobalError("Could not reach any BSC public RPC. Please check your connection and reload.");
      $("boardBody").innerHTML = '<tr><td colspan="4" class="muted">Offline — RPC unreachable.</td></tr>';
      $("recentList").innerHTML = "<li class='muted'>Offline — RPC unreachable.</li>";
      return;
    }

    await loadPublicStats();
    await loadLeaderboard();
    await loadRecentCheckins();

    // If the user already authorized this site, restore the connection silently.
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts && accounts.length > 0) {
          browserProvider = new ethers.BrowserProvider(window.ethereum);
          account = accounts[0];
          $("connectBtn").textContent = shortAddr(account);
          $("walletStatus").hidden = true;
          $("accountBox").hidden = false;
          $("accountAddr").textContent = account;
          $("networkStatus").textContent = "BNB Chain (56) — verify in your wallet";
          await refreshAccount();
        }
      } catch (e) {
        console.warn("Silent reconnect failed:", e);
      }
      window.ethereum.on("accountsChanged", (accs) => {
        if (!accs || accs.length === 0) {
          location.reload();
        } else {
          account = accs[0];
          $("connectBtn").textContent = shortAddr(account);
          $("accountAddr").textContent = account;
          refreshAccount();
        }
      });
      window.ethereum.on("chainChanged", () => location.reload());
    }

    $("connectBtn").addEventListener("click", connectWallet);
    $("checkinBtn").addEventListener("click", doCheckIn);
    $("refreshBtn").addEventListener("click", async () => {
      await refreshAccount();
      await loadPublicStats();
      await loadLeaderboard();
      await loadRecentCheckins();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
