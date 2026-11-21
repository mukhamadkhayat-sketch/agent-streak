# tests-frontend — harness pengujian frontend Agent Streak

Pengujian lokal untuk `../frontend/` (tanpa wallet nyata, tanpa mainnet).
Semua suite memakai file frontend ASLI (config.js, abi.js, app.js).

## Menjalankan

```bash
cd tests-frontend
npm install            # sekali saja (ethers 6.13.5 + jsdom)

node test-chain.js     # config/ABI + probe RPC + baca registry live (19 cek)
bash run-page-test.sh  # serve frontend + smoke test jsdom (12 cek)
bash run-local-test.sh # anvil + DeployLocal + uji baca e2e (18 cek)
```

`forge`/`anvil`/`cast` harus ada di PATH (`~/.foundry/bin`).

## Catatan

- `test-page.js` men-stub CDN ethers (jsdom tidak bisa fetch internet dari
  sandbox) dan meng-inject ethers lokal versi sama (6.13.5). Ketersediaan
  CDN diverifikasi terpisah dengan curl.
- `run-local-test.sh` memakai anvil LOKAL + `MockAgentId` (bukan fork BSC),
  karena fork anvil gagal di sandbox ("missing trie node"). Registry asli
  dicakup oleh `test-chain.js` (baca live) dan fork test Fase 1.
- Setelah kontrak di-deploy ke mainnet: isi alamat di
  `../frontend/js/config.js`, lalu uji ulang dengan wallet nyata di browser
  (check-in sungguhan) — langkah itu tidak bisa diotomatisasi di sini.
