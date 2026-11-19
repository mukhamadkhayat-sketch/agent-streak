# FASE 1 — Agent ID Hackathon: Riset, Desain & Kontrak Lokal

**Proyek:** Agent Streak — check-in harian + lencana streak soulbound untuk pemegang Agent ID
**Tanggal:** 19 Nov 2026 (19:00–19:15 WIB)
**Status:** SELESAI. Semua kerja lokal + baca-saja. TIDAK ada deploy, TIDAK ada belanja gas, TIDAK ada posting/submit/signing.
**Lokasi:** `~/workspace/agent-id-hackathon/`

---

## 1. Ringkasan eksekutif

- **Konsep:** "Agent Streak" — pemegang Agent ID check-in 1x per hari UTC (gratis, cuma gas). Streak beruntun tercatat on-chain. Capai 3/7/14/30 hari → mint soulbound StreakBadge NFT (Bronze/Silver/Gold/Diamond, metadata full on-chain). Leaderboard streak. Tanpa token, tanpa janji return, tanpa trading.
- **Framing yang dipilih:** bukan sekadar habit tracker — ini **proof-of-consistency / heartbeat agen**: streak membuktikan sebuah agen aktif dan konsisten dari hari ke hari, terikat pada identitas Agent ID-nya. Framing ini memperkuat skor "Agent ID Application Depth" (30%) dan membedakan dari kompetitor (sudah ada game arena shooter dengan skor on-chain).
- **Kontrak selesai + teruji:** 2 kontrak (AgentStreak + StreakBadge), **22/22 test lolos** (18 unit + 4 fork BSC mainnet dengan registry Agent ID asli). tokenURI terverifikasi dengan decode base64 (JSON + SVG valid).
- **Biaya deploy murah:** ~3.628.253 gas ≈ **0,0001814 BNB (≈ Rp 1.958)** pada gas price BSC saat ini 0,05 gwei. Check-in biasa cuma ~Rp 32.
- **Temuan penting #1:** alamat kontrak Agent ID di pengumuman Binance ditulis tanpa checksum EIP-55 yang benar. Bentuk checksummed yang benar: `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` (dikonfirmasi Sourcify + compiler).
- **Temuan penting #2 (risiko utama):** **tidak ada kanal submit proyek resmi yang dipublikasikan di pengumuman** — tidak ada form/link/email. Materi yang diminta disebutkan (nama proyek, website, alamat kontrak, deskripsi pemakaian Agent ID, "materi lain"), tapi cara mengirimkannya belum diumumkan. Perlu cek ulang kanal resmi sebelum 9 Des.
- **Tantangan terbesar:** syarat Innovation Award — **minimal 30 alamat Agent ID berinteraksi** selama periode lomba. Rencana promosi di §8.
- **Keputusan pendanaan:** deploy sendiri muat di saldo saat ini (0,0002823 BNB), TAPI akan bersaing dengan klaim $CTX Graph 3 yang ditunda (butuh ~0,0002912 BNB). Rekomendasi: putuskan withdrawLP AGC / top-up dulu sebelum deploy (lihat §6).

---

## 2. Riset kontrak Agent ID

Kontrak: `0x60B9262456dE011F7d15a54CdD8c48baaa8b022f` (pengumuman) = checksummed `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`.
Sumber: Sourcify exact match (creation + runtime), terverifikasi 16 Okt 2026. ABI + source tersimpan di `research/agentid-sourcify.json` dan `research/HandleRegistry.sol`.

### (a) Cara cek kepemilikan dari kontrak kita

`balanceOf(address)` → `> 0` berarti pemegang Agent ID. Ini cara yang direkomendasikan pengumuman resmi, dan yang dipakai `AgentStreak.checkIn()`. Interface minimal yang kita pakai hanya 2 fungsi (`src/interfaces/IAgentId.sol`):

```solidity
function balanceOf(address owner) external view returns (uint256);
function handleOf(address owner) external view returns (string memory);
```

### (b) Nama Agent ID bisa dibaca on-chain — YA

- `handleOf(address)` → string handle, mis. `"khatell"` (tanpa `.ai`). Tampilannya `khatell.ai`.
- `ownerOfHandle(string)` → alamat pemilik (reverse lookup).
- `tokenURI(tokenId)` → `baseURI + handle + uriSuffix`, mis. `https://agentid.prd.space.id/metadata/khatell.json` (terverifikasi live).
- Handle bersifat permanen: tidak ada fungsi rename; satu alamat = satu handle selamanya. Jadi aman untuk dicap ke badge.

### (c) Gotcha — dibaca dari source `HandleRegistry.sol` (122 baris) + verifikasi live

| Temuan | Dampak ke desain kita |
|---|---|
| **Bukan proxy, tidak upgradeable.** `contract HandleRegistry is ERC721, EIP712, Ownable2Step`. Slot EIP-1967 = 0x0, codesize 8.756 byte. | Alamat registry stabil; tidak ada risiko implementasi berganti. |
| **tokenId = `uint256(keccak256(handle))`, BUKAN berurutan.** `ownerOf(5892)` revert `ERC721NonexistentToken` — "Agent #5892" dari Ptah BUKAN tokenId registry. | Jangan pernah asumsikan tokenId berurutan. Kita tidak butuh tokenId sama sekali (cek via `balanceOf` + `handleOf`). |
| **Soulbound total.** `_update` revert bila token sudah ada; `approve`/`setApprovalForAll` revert. | Pola yang sama kita pakai di StreakBadge. |
| **Registrasi butuh tanda tangan signer Binance** (`register` pakai EIP-712, `signer` = owner `0x457C1fd14750c6c30886A2f2B57F1eF44B095882`). | Tidak bisa dipalsukan/dibuat massal — mendukung legitimasi 30 interaksi kita. |
| **Tidak ada `totalSupply()`.** Kontrak ERC721 biasa, bukan Enumerable. | Tidak bisa menghitung total Agent ID dari kontrak; angka "200.000+ klaim" hanya dari pengumuman. |
| **Mint pakai `_mint`, bukan `_safeMint`** — komentar source: smart account tidak perlu implement ERC721Receiver. | **Krusial:** Agentic Wallet adalah smart account yang mungkin tidak implement receiver. StreakBadge WAJIB pakai `_mint` juga, kalau tidak check-in tier-up akan revert untuk pemegang smart-account. Sudah diterapkan + didokumentasikan di kode. |
| Handle hanya `[a-z0-9]`, panjang 3–20 (`minLen=3`, `maxLen=20`). | Aman disisipkan ke SVG/JSON tanpa escaping. |
| Owner bisa `setSigner`, `setLengthBounds`, `setURIParts`, `adminRegister`. | Di luar kendali kita; tidak memengaruhi fungsi `balanceOf`/`handleOf` yang kita pakai. |
| `name()` = "SPACE ID Agent ID", `symbol()` = "AI". | — |

### Verifikasi live (19 Nov 2026 ~19:05 WIB, RPC bsc-dataseed)

- `balanceOf(khatell.ai)` = 1; `handleOf(khatell.ai)` = `"khatell"`; `ownerOfHandle("khatell")` = `0xa80a0A7D06468d2ea00d21710180a768a0bDBaCa` (round-trip cocok).
- `tokenId` khatell = `keccak256("khatell")` = `0x9e963234…b0bfb`; `ownerOf` = khatell.ai; `tokenURI` = `https://agentid.prd.space.id/metadata/khatell.json`.
- Gas price BSC saat itu: **0,05 gwei** (50.000.000 wei). Blok saat cek: 134.500.000.

---

## 3. Mekanisme submit — TEMUAN: kanal resmi BELUM dipublikasikan

Dicek: pengumuman resmi (support + Square, dibaca penuh 277 baris), pencarian web (3x query), kanal BNB Chain, mirror X @BinanceWallet.

- **Pengumuman TIDAK memuat link/form/email submit proyek.** Bunyinya hanya: *"Submit your project name, website, contract address(es), Agent ID usage description, and other required materials during the Submission Period. No registration needed."*
- **Materi yang diminta (dari pengumuman):** nama proyek, website, alamat kontrak, deskripsi pemakaian Agent ID, + "other required materials" (tidak dirinci).
- **Satu-satunya survei yang ter-link** adalah survei Promotion Award (submit link posting X): `https://app.binance.com/uni-qr/user-survey/ff6832f8d2984af289068c9450a3c98c` — halaman ini hanya deep-link aplikasi (butuh login Binance); ini BUKAN form submit proyek.
- **Jebakan yang dihindari:** link `binance.com/en/survey/6074942b…` yang muncul di hasil pencarian adalah form klaim airdrop token PREDICT, BUKAN hackathon. Jangan dipakai.
- **Tidak ada halaman hackathon di bnbchain.org** (hasil pencarian hanya hackathon lama "Build the Era", Agu–Sep 2026).
- **Tindak lanjut (Fase 2):** cek ulang pengumuman + @BinanceWallet (X) + Square secara berkala; kanal submit kemungkinan diumumkan menyusul (atau via halaman ekosistem Agentic Wallet). Target: kanal submit terkonfirmasi paling lambat 30 Nov, agar submit bisa dilakukan 5–7 Des dengan buffer. Sementara itu, siapkan paket materi submit (nama, website, alamat kontrak, deskripsi, README, demo).

---

## 4. Arsitektur + keputusan desain

### Struktur proyek (`~/workspace/agent-id-hackathon/`)

```
foundry.toml                  # solc 0.8.24, optimizer 200 runs, EVM cancun
src/
  interfaces/IAgentId.sol     # interface minimal registry (balanceOf, handleOf)
  AgentStreak.sol             # check-in, streak, tier, leaderboard views
  StreakBadge.sol             # soulbound ERC-721, metadata full on-chain
test/
  mocks/MockAgentId.sol       # test double registry
  AgentStreak.t.sol           # 18 unit test
  AgentStreakFork.t.sol       # 4 fork test (BSC mainnet asli)
script/Deploy.s.sol           # deploy (DRY-RUN saja di Fase 1)
research/                     # ABI + source registry Agent ID
README.md                     # README publik (EN, untuk juri + repo)
FASE-1.md                     # laporan ini
```

Dependensi: OpenZeppelin Contracts v5.7.0, forge-std v1.17.0 (Foundry v1.7.1).

### Keputusan desain + alasan

1. **Dua kontrak, satu transaksi deploy.** `AgentStreak` membuat `StreakBadge` di constructor-nya (pola factory). Keuntungan: satu deploy = satu biaya gas, tidak ada setup dua langkah, alamat badge tidak bisa salah pasang, minter badge otomatis = kontrak Streak (immutable). Total deploy tetap murah (§6).
2. **Check-in gratis (value 0, cuma gas).** Menurunkan friksi untuk 30 interaksi; tidak ada aliran dana = tidak ada risiko red line soal aset.
3. **Hari = hari UTC** (`block.timestamp / 86400`). Sederhana, deterministik, mudah dijelaskan di frontend ("check-in sebelum 07:00 WIB berganti hari"). Streak putus bila ada hari terlewat; `bestStreak` disimpan permanen.
4. **Tier 3/7/14/30 hari.** Ambang yang dapat dicapai dalam sisa periode lomba (deploy ~21 Nov → 30 hari = ~21 Des, melewati batas submit 9 Des — Diamond kemungkinan besar tidak tercapai sebelum submit; itu OK, Bronze/Silver/Gold yang jadi bukti produk jalan. Diamond adalah target jangka panjang pasca-lomba).
5. **Badge soulbound, `_mint` (bukan `_safeMint`).** Alasan smart-account di §2c. Transfer/approve selalu revert. Badge tidak bisa diperdagangkan — murni reputasi, sesuai red line (tanpa janji nilai).
6. **Metadata full on-chain (JSON + SVG base64).** Tanpa IPFS/server — tidak ada dependensi eksternal yang bisa mati; juri bisa verifikasi langsung dari kontrak. SVG menampilkan tier + handle + jumlah hari streak.
7. **Leaderboard: data on-chain, sorting off-chain.** Kontrak menyediakan `getUsers(offset, limit)` berpaginasi; frontend yang mengurutkan. Alasan: sorting on-chain mahal dan tidak perlu; event `CheckIn`/`TierReached` memungkinkan indexing.
8. **Owner permission minimal + didokumentasikan:** owner `AgentStreak` HANYA bisa pause/unpause + transfer/renounce ownership. Tidak ada fungsi ubah tier, edit streak, mint manual, atau tarik dana. `StreakBadge` tidak punya owner sama sekali. Semua didokumentasikan di NatSpec + README (red line mewajibkan dokumentasi permission owner).
9. **Tanpa token, tanpa fee, tanpa reward finansial.** Satu-satunya "hadiah" adalah badge reputasi non-moneter. Ini menjaga kita bersih dari red line "no promising returns" dan "no unauthorized asset transfers".
10. **Nama proyek "Agent Streak".** Tidak memakai "Binance"/"BNB" (red line impersonasi merek).

### Alur pengguna

1. Buka website → hubungkan wallet (MetaMask / Binance Wallet / Trust Wallet).
2. Frontend cek `balanceOf` — kalau bukan pemegang Agent ID, tombol check-in nonaktif + penjelasan.
3. Klik Check-in → konfirmasi transaksi di wallet sendiri (user melihat dan menyetujui sendiri — sesuai red line).
4. Streak tampil; saat capai tier, badge otomatis ter-mint ke wallet user.
5. Leaderboard menampilkan peringkat streak + handle `.ai` peserta.

---

## 5. Hasil test — 22/22 LOLOS

Perintah: `forge test` (Solidity 0.8.24, OZ v5.7.0). Semua lolos 19 Nov 2026 ~19:10 WIB.

### Unit test (18) — `test/AgentStreak.t.sol` + mock registry

| Test | Yang diuji |
|---|---|
| NonHolderReverts | Bukan pemegang Agent ID → revert `NotAgentIdHolder` |
| FirstCheckIn | Check-in pertama: streak 1, event, counter, userCount |
| SameDayReverts | Check-in 2x sehari → revert `AlreadyCheckedIn` |
| ConsecutiveDays | 5 hari beruntun → streak 5 |
| GapResetsStreakKeepsBest | Bolos 1 hari → streak reset ke 1, bestStreak tetap |
| BronzeBadgeAtDay3 | Hari ke-3 → badge Bronze ter-mint + event `TierReached` |
| AllTiersByDay30 | 30 hari → 4 badge (Bronze/Silver/Gold/Diamond), streak 30 |
| NoDuplicateBadgeAfterReset | Capai tier 3 lagi setelah reset → badge TIDAK ganda |
| BadgeSoulbound | transfer/approve/setApprovalForAll semua revert |
| BadgeMintOnlyByStreak | mint langsung ke badge → revert `OnlyStreak` |
| PauseUnpause | pause → check-in revert; unpause → jalan lagi |
| PauseOnlyOwner | Bukan owner pause → revert |
| TokenURI | Prefix data URI benar; token tak ada → revert standar |
| TokenURIDiffersPerTier | Metadata Bronze ≠ Silver |
| TierOfStreak | Batas tier 0/2/3/6/7/13/14/29/30/365 |
| HasCheckedInToday | Status harian benar sebelum/sesudah/keesokan hari |
| LeaderboardViews | `getUsers` + paginasi + `getUser` benar |
| TwoUsersIndependentStreaks | Streak antar user independen |

### Fork test (4) — `test/AgentStreakFork.t.sol`, state BSC mainnet asli (blok terbaru)

| Test | Yang diuji |
|---|---|
| KhatellHoldsAgentId | Registry asli: `balanceOf(khatell)` = 1, `handleOf` = `"khatell"` |
| KhatellCanCheckIn | Check-in dari alamat khatell.ai asli (prank) berhasil, streak 1 |
| NonHolderReverts | Alamat acak tanpa Agent ID → revert |
| BadgeOnDay3WithRealHandle | 3 hari → badge Bronze dengan handle asli `"khatell"` tercap |

Catatan: fork memakai blok terbaru, BUKAN pin blok — RPC publik BSC memangkas state histori (pin blok 134.500.000 gagal dengan "missing trie node").

### Verifikasi tokenURI (di luar forge)

URI dari test di-decode dengan Python: **JSON valid, SVG valid**, berisi nama "Agent Streak Badge - Bronze", atribut Tier=Bronze, StreakDays=3, AgentID=alice.ai, SVG menampilkan Bronze + alice.ai + "3-day streak". Bukti lengkap di log test (`forge test --match-test test_TokenURI -vvv`).

### Dua bug yang ditemukan & diperbaiki selama Fase 1

1. **Bug test (bukan kontrak):** `expectEmit` untuk `TierReached` gagal karena `checkIn` meng-emit `CheckIn` dulu — diperbaiki dengan expect ganda berurutan.
2. **Bug test (bukan kontrak):** helper `_checkInDays` tidak warp sebelum batch kedua → `AlreadyCheckedIn` — diperbaiki dengan warp eksplisit antar batch.

Tidak ada bug kontrak yang ditemukan.

---

## 6. Estimasi gas deploy mainnet

Harga gas BSC saat cek (19 Nov 2026 ~19:08 WIB): **0,05 gwei**. Kurs BNB: **Rp 10.791.869** (CoinGecko).

| Aksi | Gas | BNB | ≈ Rupiah |
|---|---|---|---|
| **Deploy (AgentStreak + StreakBadge, 1 tx)** | **3.628.253** | **0,0001814** | **Rp 1.958** |
| Check-in pertama | ~198.162 | 0,0000099 | Rp 107 |
| Check-in biasa (median) | ~59.132 | 0,0000030 | Rp 32 |
| Check-in tier-up (mint badge) | ~228.475 | 0,0000114 | Rp 123 |

Sumber angka: dry-run `forge script script/Deploy.s.sol --rpc-url bsc` (simulasi, TANPA broadcast) untuk deploy; `forge test --gas-report` untuk check-in. Angka deploy dry-run (3.628.253) lebih besar dari gas report test (2.790.964) karena dry-run menghitung biaya calldata init code — angka dry-run yang dipakai untuk keputusan pendanaan.

**Skenario gas naik:** bila gas price naik ke 0,1 gwei, deploy = 0,0003628 BNB (≈ Rp 3.916). Anggaran aman yang disarankan: **0,0004 BNB (≈ Rp 4.300)**.

**Implikasi pendanaan (PENTING):**
- Saldo wallet saat ini ~0,0002823 BNB (≈ Rp 3.039). Deploy 0,0001814 BNB **muat**, sisa ~0,0001 BNB.
- TAPI klaim $CTX Graph 3 yang ditunda butuh ~0,0002912 BNB (≈ Rp 3.135) bila dijadwalkan ulang — deploy + klaim CTX **tidak muat bersamaan**.
- Rekomendasi: putuskan pendanaan dulu — (a) withdrawLP AGC (+0,001394 BNB ≈ Rp 15.100, sudah disimulasikan, menunggu keputusan pengguna sejak 18 Nov), atau (b) top-up BNB. Dengan salah satunya, deploy + klaim CTX + cadangan gas semua muat. Verifikasi BscScan gratis (Sourcify tanpa API key; BscScan butuh API key gratis).

---

## 7. Rencana frontend (BELUM dibangun — Fase 2)

### Stack

- **Situs statis satu halaman**, tanpa build step, tanpa backend, tanpa server.
- Vanilla JS + **ethers.js v6 via CDN** (atau viem — ethers lebih sederhana untuk kasus ini).
- Koneksi wallet via provider injected (`window.ethereum`: MetaMask / Binance Wallet / Trust Wallet). TIDAK ada login QR / pairing code (red line).
- Baca data via RPC publik BSC (dengan daftar fallback); tulis hanya lewat transaksi `checkIn()` yang ditandatangani user di wallet-nya sendiri.
- Fitur halaman: hero + penjelasan singkat, tombol hubungkan wallet, status Agent ID (handle `.ai` user), tombol check-in + tampilan streak/best streak, koleksi badge user (render SVG dari `tokenURI`), leaderboard top 20 (handle + streak), FAQ (aturan hari UTC, badge soulbound, disclaimer tanpa nilai finansial).

### Opsi hosting (JANGAN deploy dulu — keputusan Fase 2)

| Opsi | Pro | Kontra |
|---|---|---|
| **GitHub Pages** (rekomendasi) | Gratis; repo GitHub publik memang WAJIB untuk open-source — satu repo untuk kode + situs; tanpa akun tambahan; custom domain didukung | Butuh login gh CLI + buat repo publik (langkah user-assisted; gh belum login) |
| **Cloudflare Pages** | Gratis; CDN cepat; bisa deploy via upload langsung atau GitHub | Butuh akun Cloudflare (belum ada; setup Hermuse juga butuh Cloudflare — bisa digabung) |
| **Netlify** | Gratis (tier dasar); drag-drop deploy; integrasi Git | Butuh akun; limit bandwidth tier gratis (cukup untuk skala ini) |

Rekomendasi: GitHub Pages sebagai utama (sinergi dengan kewajiban open-source), Cloudflare Pages sebagai cadangan bila menginginkan domain kustom. Nama domain TIDAK boleh mengandung "binance"/"bnb" (red line).

---

## 8. Rencana promosi — target 30 interaksi Agent ID

**Target:** ≥30 alamat unik pemegang Agent ID melakukan `checkIn` antara deploy dan **9 Des 2026 15:00 WIB**. Pelacakan: `userCount()` on-chain + event `CheckIn` (dapat dipantau per hari).

### Kanal (sesuai yang tersedia)

| Kanal | Peran | Catatan |
|---|---|---|
| Threads @serdaduerf | Utama: thread peluncuran, update harian, balas posting hackathon lain | Terhubung; tiap posting butuh persetujuan pengguna |
| Facebook (Serdadu Erf) | Posting peluncuran + bagikan ke grup relevan yang sudah diikuti | Terhubung; persetujuan per posting |
| Instagram @serdaduerf | Carousel/feed + story, link di bio | Terhubung; persetujuan per posting |
| Binance Square @khatell_square | Posting di Square + komentar di posting pengumuman hackathon resmi | Tanpa konektor — pengguna posting sendiri (via aplikasi/browser) |
| X @0xCoru | **Kanal bernilai tertinggi** (audiens dev kripto terbesar) — posting peluncuran + update + hashtag #BinanceWalletHackathon #AgenticWallet | Asisten TIDAK bisa posting ke X — pengguna posting sendiri; asisten siapkan draf |
| Langsung (DM/chat) | Fafatoni (punya Agent ID fafatoni.ai) + kenalan agen lain — minta check-in + sebarkan | Personal, tingkat konversi tinggi |

### Taktik

1. **Peluncuran (H+0 deploy):** posting serentak di semua kanal — apa itu Agent Streak, kenapa check-in (bukti konsistensi agen + badge soulbound), cara 1-klik, biaya gas ~Rp 32.
2. **Video demo singkat** (30–60 detik): rekam layar check-in + badge muncul. Video meningkatkan kepercayaan + share.
3. **Ritual harian:** pengingat check-in harian + sorotan leaderboard ("streak terpanjang hari ini: X hari oleh Y.ai").
4. **Engage komunitas hackathon:** balas/kutip posting peserta lain (mis. dev game arena shooter yang sudah live) — saling dukung, bukan spam.
5. **Panduan singkat:** "Cara check-in dalam 1 menit" (teks + screenshot) untuk pemegang Agent ID yang belum pernah pakai dApp.
6. **Tanpa insentif finansial:** JANGAN janjikan airdrop/hadiah/return dalam bentuk apa pun (red line). Daya tariknya: badge reputasi + partisipasi hackathon + keseruan streak.

### Timeline + milestone

| Tanggal | Target |
|---|---|
| 21–22 Nov | Deploy + verifikasi BscScan + situs live + posting peluncuran |
| 25 Nov | 10 alamat unik |
| 30 Nov | 20 alamat unik |
| 5 Des | **30 alamat unik (target tercapai)** |
| 5–7 Des | Submit proyek (buffer 2–4 hari sebelum tutup 9 Des 15:00 WIB) |
| 9 Des 15:00 WIB | Submit ditutup |

Bila milestone meleset >3 hari, eskalasi: minta pengguna posting X tambahan + DM lebih banyak kenalan agen.

---

## 9. Risiko & pertanyaan terbuka

| # | Risiko / pertanyaan | Dampak | Mitigasi / status |
|---|---|---|---|
| 1 | **Kanal submit proyek belum dipublikasikan** | Tidak bisa submit bila kanal tidak ditemukan | Cek ulang berkala; target konfirmasi ≤30 Nov (§3) |
| 2 | **30 interaksi adalah ambang keras** — tanpa itu Innovation Award gugur | Target utama gagal | Rencana promosi §8 + milestone; X (pengguna) adalah kunci |
| 3 | **Pendanaan deploy vs klaim CTX** berebut saldo 0,0002823 BNB | Salah satu tertunda | Keputusan withdrawLP/top-up sebelum deploy (§6) |
| 4 | Kompetitor sudah live (game arena shooter di Threads, 19 Nov) | Persaingan perhatian + peringkat | Diferensiasi: reputasi konsistensi, bukan game; eksekusi cepat |
| 5 | Gas BSC naik di atas 0,05 gwei | Biaya deploy naik | Anggaran 0,0004 BNB (§6); deploy saat gas rendah |
| 6 | Diamond (30 hari) tidak tercapai sebelum submit | Badge tertinggi belum terbukti live | Bukan syarat; Bronze–Gold cukup sebagai bukti produk |
| 7 | Repo GitHub publik + login gh belum ada | Frontend + open-source tertunda | Langkah user-assisted di Fase 2 (gh login, buat repo) |
| 8 | BscScan verification butuh API key gratis | Verifikasi tertunda bila belum ada key | Alternatif: Sourcify (tanpa key) + BscScan via UI web |
| 9 | Penilaian juri subjektif (Innovation 20% + panel) | Tidak ada jaminan menang | Fokus ke yang terukur: produk live, 30 interaksi, kode bersih |
| 10 | Aturan hackathon bisa diubah Binance sepihak (disebut di T&C) | Syarat bisa berubah | Pantau pengumuman; siapkan buffer waktu |

---

## 10. Checklist Fase 2 (setelah persetujuan pengguna)

- [ ] Keputusan pendanaan: withdrawLP AGC / top-up BNB (lihat §6).
- [ ] Deploy mainnet via `baw` (preview → eksekusi, pola yang sudah teruji) + verifikasi receipt.
- [ ] Verifikasi source di BscScan + Sourcify.
- [ ] Buat repo GitHub publik + push kode (butuh login gh — user-assisted).
- [ ] Bangun frontend statis + deploy ke GitHub Pages.
- [ ] Uji end-to-end dengan wallet khatell.ai (check-in nyata pertama).
- [ ] Konfirmasi kanal submit resmi (cek ulang pengumuman/X/Square).
- [ ] Jalankan rencana promosi §8 (draf posting → persetujuan pengguna per posting).
- [ ] Pantau `userCount()` harian vs milestone; laporkan progres.
- [ ] Siapkan paket submit (nama, website, alamat kontrak, deskripsi Agent ID, README, demo) + submit 5–7 Des.

---

*Disusun 19 Nov 2026. Semua angka gas/BNB/Rupiah dari pengukuran langsung hari ini (gas price 0,05 gwei, kurs Rp 10.791.869/BNB). Angka dapat berubah — verifikasi ulang saat eksekusi Fase 2.*
