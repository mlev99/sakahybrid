<div align="center">

# 📊 Saka Tracker

**Dashboard monitoring progres lapangan Sensus Ekonomi 2026 (SE2026)**
Single-file web app — offline-capable, local-first, tanpa server.

![Version](https://img.shields.io/badge/version-5.4.5-3b82f6?style=flat-square)
![Status](https://img.shields.io/badge/status-stable-10b981?style=flat-square)
![License](https://img.shields.io/badge/license-Proprietary-ef4444?style=flat-square)
![Stack](https://img.shields.io/badge/stack-Vanilla%20JS%20%2F%20HTML%20%2F%20CSS-f59e0b?style=flat-square)
![Storage](https://img.shields.io/badge/storage-localStorage-8b5cf6?style=flat-square)

</div>

---

> ⚠️ **Disclaimer**: Saka Tracker adalah alat bantu internal untuk monitoring progres lapangan. Aplikasi ini **bukan produk resmi Badan Pusat Statistik (BPS)** dan tidak berafiliasi dengan BPS.

## 📖 Daftar Isi

- [Tentang](#-tentang)
- [Fitur](#-fitur)
- [Screenshot](#-screenshot)
- [Cara Menjalankan](#-cara-menjalankan)
- [Struktur Data](#-struktur-data)
- [Logika Bisnis Inti](#-logika-bisnis-inti)
- [Multi-AI Orchestrator](#-multi-ai-orchestrator)
- [Keamanan](#-keamanan)
- [Struktur Proyek](#-struktur-proyek)
- [Roadmap](#-roadmap)
- [Keterbatasan yang Diketahui](#-keterbatasan-yang-diketahui)
- [Kontribusi](#-kontribusi)
- [Lisensi](#-lisensi)
- [Kontak](#-kontak)

---

## 🧭 Tentang

Saka Tracker membantu PML/koordinator lapangan memantau progres per SLS (open/submit/reject/pending/approve) terhadap dua target paralel:

- **Dashboard FASIH** — jumlah asesmen
- **Muatan** — volume kontrak

Aplikasi menghitung target harian, forecast tanggal pencapaian, prioritas kerja optimal per SLS, skor performa harian, dan ringkasan strategi berbasis AI — semua berjalan **sepenuhnya di browser**, tanpa backend.

**Kenapa local-first?**
Karena ini alat kerja lapangan: harus bisa dibuka tanpa instalasi, tanpa akun, dan tetap berfungsi meski koneksi lemah — cukup satu file HTML.

## ✨ Fitur

| Kategori | Fitur |
|---|---|
| **Input & Tracking** | Grid input harian per SLS, mode input harian vs akumulasi rentang tanggal, validasi submit ≤ open |
| **Analitik** | Forecast Engine (estimasi tanggal clearance), skor performa A+–E, ritme ritme 7-hari terakhir |
| **Prioritisasi** | Ranking SLS otomatis berbasis skor (open/approve/submit/muatan-weighted) + label aksi (URGENT/Prioritas Tinggi/Lanjutkan/Mulai) |
| **Termin Tracking** | Status target termin 1 (40%) dengan 5 varian tampilan sesuai urgensi |
| **AI Insight** | Multi-provider orchestrator (OpenAI → Gemini → Mistral) dengan fallback deterministik tanpa AI |
| **History** | Snapshot harian, riwayat progres, hapus per-entry atau semua |
| **Data Master** | CRUD data SLS (kode, open FASIH, muatan) |
| **Backup/Restore** | Export/import seluruh state sebagai JSON |
| **Keamanan** | Consent Gate (ToS/Privacy wajib disetujui) + PIN Lock 4-digit opsional dengan recovery |

## 📸 Screenshot

> _Tambahkan screenshot aplikasi di sini (`docs/screenshots/`) — dashboard, prioritas SLS, dan halaman pengaturan direkomendasikan._

```
docs/screenshots/dashboard.png
docs/screenshots/priority.png
docs/screenshots/settings.png
```

## 🚀 Cara Menjalankan

Tidak ada proses build. Tidak ada dependency untuk diinstal.

```bash
# Clone repo
git clone <repo-url>
cd saka-tracker

# Buka langsung di browser
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

Atau host sebagai static file di GitHub Pages / Netlify / Vercel / server internal mana pun — cukup satu file `index.html`.

**Persyaratan browser:** Chrome/Safari modern (mendukung `crypto.subtle`, `fetch`, `localStorage`). Didesain mobile-first (viewport terkunci, navigasi bottom-tab).

### Konfigurasi AI (opsional)

Fitur AI Insight bersifat opsional. Buka **Pengaturan → Konfigurasi API**, isi salah satu atau lebih:

| Provider | Format Key |
|---|---|
| OpenAI | `sk-proj-...` |
| Gemini | `AIzaSy...` |
| Mistral | `...` |

Tanpa key, aplikasi tetap berfungsi penuh menggunakan **deterministic fallback** (analisis berbasis rule, bukan LLM).

## 🗂️ Struktur Data

Seluruh state tersimpan di `localStorage` pada key `saka_tracker_v5_4`:

```js
state = {
  config:   { assessment, muatan },              // derived dari state.sls
  dashboard:{ open, draft, submit, reject, pending, approve },
  sls:      [{ kode, nama, open, submit, reject, pending, approve, muatan }],
  history:  [{ date, progress, dashP, velocity, grade }],
  apiKeys:  { openai, gemini, mistral },
  isAccumulationMode: Boolean,
  consent:  { accepted, version, date },
  security: { pinEnabled, pinHash, recoveryHash, failedAttempts, lockUntil }
}
```

> 📌 `state.sls` adalah **single source of truth**. `dashboard` dan `config` dihitung ulang dari `sls` setiap kali data berubah (`syncDashboardFromSLS`, `syncConfigTargets`) — jangan pernah menulis langsung ke field turunan.

Dokumentasi lengkap arsitektur & skema ada di [`SKILL.md`](./SKILL.md).

## 🧮 Logika Bisnis Inti

```
progress   = dashboard.submit + dashboard.approve   // draft/reject/pending TIDAK dihitung
dashP      = progress / config.assessment * 100
muatanP    = progress / config.muatan * 100
```

**Skor prioritas per SLS:**
```
score = (min(open*0.8, 40) + approve*0.3 + submit*0.1) * (muatan/100 || 1)
```

**Grade performa** dihitung dari selisih progres aktual terhadap garis progres linear ideal (`elapsedDays / totalDays * 100`), menghasilkan grade A+ hingga E.

Detail lengkap semua formula, termasuk forecast engine dan tracking termin, ada di [`SKILL.md § 5`](./SKILL.md#5-core-business-logic).

## 🤖 Multi-AI Orchestrator

```
OpenAI (gpt-4o-mini) → Gemini (gemini-2.0-flash) → Mistral (mistral-small-latest) → Deterministic Fallback
```

- Mencoba provider sesuai urutan, **melewati** provider tanpa API key.
- Timeout 12 detik per provider.
- Semua panggilan API terjadi **langsung dari browser** ke masing-masing provider — tidak melalui server Saka Tracker (karena tidak ada backend).
- Jika semua provider gagal/tidak dikonfigurasi, insight tetap dihasilkan lewat fallback berbasis rule (`deterministicFallback()`), bukan LLM.

## 🔐 Keamanan

| Layer | Deskripsi |
|---|---|
| **Consent Gate** | Wajib menyetujui ToS/Privacy Policy sebelum masuk aplikasi. Otomatis muncul lagi jika `LEGAL_VERSION` berubah. |
| **PIN Lock** | Opsional, 4 digit, disimpan sebagai hash SHA-256 (`crypto.subtle`). Bukan enkripsi data — murni lapisan kenyamanan/anti-akses-casual. |
| **Recovery** | Jawaban pemulihan wajib diisi saat setup PIN; jika lupa keduanya, satu-satunya jalan adalah menghapus data browser (destruktif). |
| **Brute-force throttle** | 5 percobaan PIN salah → lockout 30 detik (client-side, bukan pengaman kriptografis). |

⚠️ **Catatan penting**: karena tidak ada backend, seluruh data (termasuk API key) tersimpan di `localStorage` perangkat. Siapa pun dengan akses devtools ke perangkat berpotensi membaca data mentah terlepas dari status PIN Lock. Jangan pernah memasukkan data pribadi responden (nama, NIK, alamat, kontak individu) ke aplikasi ini — lihat [Privacy Policy](#) di dalam aplikasi (Pengaturan → Privacy Policy) untuk detail lengkap.

## 📁 Struktur Proyek

```
saka-tracker/
├── index.html          # Seluruh aplikasi (HTML + CSS + JS), single file
├── SKILL.md             # Spesifikasi teknikal lengkap (arsitektur, skema, formula)
├── README.md             # Dokumen ini
└── docs/
    └── screenshots/      # (opsional) tangkapan layar untuk dokumentasi
```

## 🗺️ Roadmap

- [ ] PWA shell (`manifest.json` + service worker) — install-to-home-screen, offline resilience penuh
- [ ] Grafik tren progres harian (Chart.js)
- [ ] Generalisasi sistem termin (saat ini hanya Termin 1 hardcoded)
- [ ] Field PIC & medan (tingkat kesulitan) per SLS untuk Recommendation Engine
- [ ] Toast/modal system menggantikan `alert()`/`confirm()` native
- [ ] Halaman changelog in-app
- [ ] Export laporan harian ke WhatsApp/PDF

Detail & rationale tiap item ada di [`SKILL.md § 13`](./SKILL.md#13-extension-points-not-yet-built-ordered-roughly-by-leverage).

## ⚠️ Keterbatasan yang Diketahui

1. API key tersimpan plaintext di `localStorage` dan file backup.
2. PIN Lock adalah UX gate, bukan enkripsi.
3. Tanggal snapshot history menggunakan locale string (`id-ID`), bukan ISO — rapuh untuk lintas timezone.
4. Restore backup bersifat destruktif total (tidak ada merge).
5. Logika termin hardcoded ke satu milestone.

Selengkapnya di [`SKILL.md § 11`](./SKILL.md#11-known-limitations-carry-these-into-any-future-work).

## 🤝 Kontribusi

Proyek internal — perubahan dikoordinasikan langsung dengan developer. Jika menemukan bug atau punya ide fitur, hubungi lewat kanal di bagian [Kontak](#-kontak).

## 📄 Lisensi

Proprietary — internal tool. Seluruh hak cipta pada developer. Tidak untuk didistribusikan ulang tanpa izin.

## 📬 Kontak

- **Email**: [mlevian@protonmail.com](mailto:mlevian@protonmail.com)
- **WhatsApp**: [+62 851-1133-0391](https://wa.me/6285111330391)

---

<div align="center">

**Developed by Saka_Omni** · Build 20260708 · v5.4.5

</div>
