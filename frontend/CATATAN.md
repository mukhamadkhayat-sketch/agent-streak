# CATATAN — Frontend "Agent Streak" (Fase 2a)

**Tanggal:** 19 Nov 2026 (~19:15–20:00 WIB)
**Status:** SELESAI. Situs statis satu halaman sudah jadi + teruji lokal.
Kerja lokal SAJA: tanpa repo GitHub, tanpa login gh, tanpa deploy hosting,
tanpa posting/submit/signing. README.md root TIDAK diubah.

---

## 1. File yang dibuat

```
frontend/
├── index.html          # Satu halaman: hero, check-in, tier, badge, leaderboard, FAQ, disclaimer
├── css/style.css       # Tema gelap (#0b0e11 + emas #f0b90b, selaras SVG badge)
├── js/
│   ├── config.js       # Alamat kontrak (placeholder), daftar RPC fallback, tier, konstanta
│   ├── abi.js          # ABI AgentStreak (38 entri) + StreakBadge (33 entri) — diekstrak
│   │                   #   dari artefak Foundry (forge build); ABI registry minimal
│   └── app.js          # Semua logika: RPC fallback, wallet, Agent ID, check-in,
│                       #   streak, badge, leaderboard, event feed, countdown UTC
└── .nojekyll           # Supaya GitHub Pages tidak memproses folder lewat Jekyll
```

File pendukung (di luar folder frontend, TIDAK ikut ter-publish ke Pages):

```
script/DeployLocal.s.sol     # Deploy lokal (anvil): MockAgentId + AgentStreak,
                             #   holder khatell/fafatoni sudah terdaftar. HANYA
                             #   untuk pengujian lokal — jangan jalankan ke mainnet.
tests-frontend/              # Harness pengujian (bisa dijalankan ulang, lihat §4)
├── test-chain.js            # Cek config/ABI + probe RPC + baca registry live
├── test-page.js             # Smoke test halaman di jsdom (boot tanpa error JS)
├── test-fork.js             # Uji baca end-to-end di anvil (check-in nyata lokal)
├── run-page-test.sh         # Serve frontend + jalankan test-page.js
├── run-local-test.sh        # Anvil + DeployLocal + jalankan test-fork.js
├── package.json / package-lock.json
└── node_modules/            # ethers 6.13.5 + jsdom (di-.gitignore, jangan commit)
```

Perubahan kecil lain: `.gitignore` ditambah `node_modules/` dan log/pid test.

---

## 2. Cara menjalankan lokal

```bash
cd ~/workspace/agent-id-hackathon/frontend
python3 -m http.server 8765
# Buka http://127.0.0.1:8765/ di browser
```

Tanpa build step, tanpa backend, tanpa server khusus — file statis saja.
Butuh internet untuk CDN ethers.js v6 (jsDelivr, fallback unpkg).

### Setelah kontrak di-deploy (Fase 2b)

1. Isi `AGENT_STREAK_ADDRESS` di `frontend/js/config.js` dengan alamat
   deploy (alamat StreakBadge dibaca otomatis dari `AgentStreak.badge()`).
2. Isi `DEPLOY_BLOCK` dengan nomor blok deploy (untuk query event; kalau
   dibiarkan 0, feed memakai jendela ~50.000 blok terakhir).
3. Update tautan "Source code: GitHub repo (coming soon)" di footer
   `index.html` setelah repo dibuat.

---

## 3. Fitur yang sudah dibangun

- **Hero + framing proof-of-consistency / heartbeat agen**, statistik live
  (jumlah agen, total check-in, hari UTC, countdown ke 00:00 UTC / 07:00 WIB).
- **Hubungkan wallet via provider injected SAJA** (`window.ethereum` —
  MetaMask / Binance Wallet / Trust Wallet). Tanpa QR, tanpa pairing code.
  Otomatis minta pindah ke BNB Chain (56) bila wallet di jaringan lain.
- **Status Agent ID**: `balanceOf` + `handleOf` dari registry
  `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, tampil sebagai `nama.ai`.
- **Check-in**: transaksi `checkIn()` yang ditandatangani user di wallet-nya
  sendiri (halaman tidak pernah minta approval apa pun). Status tombol
  mengikuti keadaan: belum holder / sudah check-in hari ini / paused.
  Link tx BscScan ditampilkan setelah kirim.
- **Streak**: current / best / total + badge berikutnya ("Gold in 5d").
- **Koleksi badge**: render SVG dari `tokenURI` on-chain (data URI JSON +
  SVG base64). Catatan penting: `StreakBadge` BUKAN Enumerable, jadi daftar
  badge user dicari dengan scan `ownerOf` per tokenId (0..`nextTokenId`) —
  murah karena jumlah badge kecil.
- **Leaderboard top 20**: `getUsers` berpaginasi (100/halaman) + resolusi
  handle on-chain, urut streak lalu best streak; baris user sendiri
  disorot. **Feed check-in terbaru** dari event `CheckIn` (query event
  dengan batas blok; gagal query → pesan ramah, halaman tetap jalan).
- **FAQ + disclaimer jelas**: hari UTC, badge soulbound, badge tanpa nilai
  finansial / tanpa yield / tanpa janji return, permission owner, keamanan
  wallet. Banner "Coming soon" tampil selama kontrak belum di-deploy
  (check-in/leaderboard/badge nonaktif, tapi koneksi wallet + cek Agent ID
  tetap jalan).
- **RPC baca**: 12 endpoint publik BSC, di-probe berurutan (`getBlockNumber`
  + timeout 8 detik), pakai yang pertama menjawab. Baca tidak pernah lewat
  wallet user.

---

## 4. Yang sudah diuji + hasilnya (49 cek, semua lolos)

| Suite | Perintah | Hasil |
|---|---|---|
| `test-chain.js` | `node test-chain.js` | **19/19 lolos** — config, ABI ethers v6 (semua fungsi/event yang dipakai halaman ada; `checkIn()` ter-encode), decode tokenURI sampel, sort leaderboard, probe 12 RPC + baca live registry: `balanceOf(khatell.ai)=1`, `handleOf="khatell"`, non-holder = 0 |
| `test-page.js` (jsdom) | `bash run-page-test.sh` | **12/12 lolos** — halaman boot tanpa error JS, banner deploy tampil, hari UTC + countdown jalan, leaderboard/feed menampilkan catatan "belum deploy", tombol check-in nonaktif, FAQ 7 item, disclaimer lengkap. Semua aset HTTP 200 |
| `test-fork.js` (anvil e2e) | `bash run-local-test.sh` | **18/18 lolos** — kontrak ASLI di-deploy ke anvil lokal, check-in nyata 3 hari (khatell) + 1 hari (fafatoni), event `TierReached` terbit hari ke-3, `getUser/getUsers/userCount/totalCheckInCount` benar, leaderboard terurut, scan badge menemukan tokenId 0, tokenURI ASLI ter-decode fungsi frontend (`Agent Streak Badge - Bronze`, atribut + SVG berisi `khatell.ai`), query event `CheckIn` 4 entri |
| Sintaks | `node --check` | `config.js`, `abi.js`, `app.js` — OK |
| CDN ethers | `curl -I` | jsDelivr + unpkg `ethers@6.13.5` — HTTP 200 |

### Catatan pengujian (jujur)

- **jsdom tidak bisa fetch internet dari sandbox** (proksi) — jadi skrip CDN
  di-stub dan ethers 6.13.5 lokal di-inject ke jsdom. Logika halaman yang
  diuji adalah kode aslinya; ketersediaan CDN diverifikasi terpisah via curl.
- **Fork BSC mainnet di anvil GAGAL di sandbox ini** (`missing trie node`
  dari semua RPC publik yang dicoba) — jadi uji e2e memakai anvil lokal +
  `MockAgentId`. Registry ASLI sudah diverifikasi terpisah lewat baca live
  di `test-chain.js` dan fork test Fase 1 (22/22 lolos).
- **RPC `binance.llamarpc.com` gagal dari sandbox** (terowongan proksi) —
  tetap ada di daftar fallback (tidak merugikan user nyata; probe akan
  lewati bila gagal). 11 dari 12 RPC menjawab saat pengujian.
- **`forge create --constructor-args` bermasalah** di Foundry ini
  ("expected 1 but got 6") — deploy lokal dialihkan ke `DeployLocal.s.sol`.
- **/tmp dibersihkan tiba-tiba di tengah pengujian** — harness dipindah ke
  `tests-frontend/` (persisten) supaya bisa dijalankan ulang.
- **Dua jebakan yang sempat muncul dan sudah diperbaiki saat pengujian:**
  (1) kunci privat anvil yang diketik salah satu karakter → deploy gagal
  "insufficient funds"; (2) `forge script` mencetak alamat dari SIMULASI
  walau broadcast gagal — driver sekarang memverifikasi `eth_getCode`
  setelah deploy.

---

## 5. Yang masih menunggu (di luar Fase 2a)

- [ ] **Alamat deploy** — isi `AGENT_STREAK_ADDRESS` (+ `DEPLOY_BLOCK`) di
      `js/config.js` setelah deploy mainnet (keputusan pendanaan dulu, lihat
      FASE-1.md §6).
- [ ] **Repo GitHub publik + GitHub Pages** — `frontend/` sudah siap jadi
      Pages source (jadikan root repo atau folder `/docs`; `.nojekyll`
      sudah ada). Butuh login `gh` (user-assisted) + buat repo. Jangan lupa
      update tautan source di footer.
- [ ] **Uji end-to-end dengan wallet nyata** (TIDAK bisa dilakukan di sini):
      hubungkan MetaMask/Binance Wallet khatell.ai → cek handle tampil →
      check-in nyata pertama → badge Bronze muncul hari ke-3 → leaderboard
      terisi. Lakukan setelah deploy + Pages live.
- [ ] **Verifikasi BscScan/Sourcify** kontrak setelah deploy (link footer
      `AgentStreak on BscScan` aktif otomatis setelah alamat diisi).
- [ ] **Kanal submit hackathon** — masih belum dipublikasikan Binance
      (pantauan harian sudah jalan; target konfirmasi ≤30 Nov, lihat
      FASE-1.md §3).
- [ ] **Promosi 30 interaksi Agent ID** — rencana di FASE-1.md §8.

---

## 6. Kepatuhan red line (dirancang sejak awal)

- Tanpa login QR / pairing code; tanpa pengumpulan seed/key/API secret.
- Tanpa approval apa pun; satu-satunya transaksi adalah `checkIn()` yang
  user tinjau dan setujui sendiri di wallet-nya.
- Tanpa transfer terjadwal/otomatis, tanpa janji return, tanpa token.
- Nama proyek/domain tidak memakai "Binance"/"BNB".
- Handle hanya ditampilkan untuk agen yang check-in sendiri (aktivitas
  on-chain publik yang mereka lakukan sukarela), bukan alat lookup wallet.
