<div align="center">
 
# Saka Tracker
 
**Monitoring progres lapangan SLS, real-time, offline-ready.**

![Version](https://img.shields.io/badge/version-5.5.0-3b82f6?style=flat-square)
![Status](https://img.shields.io/badge/status-stable-10b981?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-10b981?style=flat-square)
![Build Step](https://img.shields.io/badge/build_step-none-f59e0b?style=flat-square)
![License](https://img.shields.io/badge/license-internal-94a3b8?style=flat-square)

Dikembangkan oleh **Saka_Omni** &middot; Saka Omni Webapps

</div>

---

## Daftar Isi

- [Tentang](#tentang)
- [Fitur Utama](#fitur-utama)
- [Tumpukan Teknologi](#tumpukan-teknologi)
- [Struktur Proyek](#struktur-proyek)
- [Menjalankan Secara Lokal](#menjalankan-secara-lokal)
- [Model Data](#model-data)
- [Versioning](#versioning)
- [Standar Ikon](#standar-ikon)
- [Keamanan & Privasi](#keamanan--privasi)
- [Riwayat Versi](#riwayat-versi)
- [Roadmap](#roadmap)
- [Lisensi](#lisensi)
- [Kontak](#kontak)

---

## Tentang

Saka Tracker adalah alat bantu internal untuk PML/koordinator dalam memantau progres lapangan tingkat SLS pada Sensus Ekonomi 2026 (SE2026). Aplikasi membandingkan progres aktual terhadap dua target paralel — **Dashboard FASIH** (jumlah asesmen) dan **Muatan** (volume kontrak) — lalu menyajikan prioritisasi kerja, forecasting ketercapaian termin, dan insight strategis berbasis AI.

> Saka Tracker adalah alat bantu internal (field-ops tooling) dan **bukan produk resmi BPS**.

## Fitur Utama

| Kategori | Deskripsi |
|---|---|
| Dashboard Real-time | Ringkasan open/submit/reject/pending/approve per SLS dan agregat total |
| Prioritisasi Otomatis | Algoritma skor memprioritaskan SLS mana yang perlu ditangani lebih dulu |
| Forecasting Termin | Proyeksi ketercapaian target 40% dan 100% berdasarkan ritme input harian |
| Grading Performa | Penilaian A+ s/d E terhadap garis progres yang diharapkan |
| Multi-AI Insight | Orkestrasi OpenAI, Gemini, dan Mistral dengan fallback deterministik tanpa API key |
| Progressive Web App | Dapat dipasang ke layar utama, tetap berjalan saat offline |
| Consent Gate & PIN Lock | Lapisan persetujuan ToS/Privacy dan kunci akses opsional berbasis PIN |
| Backup & Restore | Ekspor/impor seluruh state aplikasi sebagai berkas JSON |

## Tumpukan Teknologi

![HTML5](https://img.shields.io/badge/HTML5-e34f26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572b6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![Bootstrap Icons](https://img.shields.io/badge/Bootstrap_Icons-1.11.3-7952b3?style=flat-square&logo=bootstrap&logoColor=white)
![PWA](https://img.shields.io/badge/Service_Worker-enabled-5a0fc8?style=flat-square)

- **Vanilla JavaScript** — tanpa framework, tanpa bundler, tanpa dependensi npm.
- **Bootstrap Icons** (CDN) — satu-satunya resource eksternal, dipakai untuk seluruh indikator visual (tidak ada emoji di manapun dalam kode).
- **Browser-native APIs** — `localStorage`, `fetch`, `crypto.subtle` (hashing PIN), `FileReader`, Service Worker.
- **Zero backend** — seluruh data tersimpan di perangkat; tidak ada server maupun akun.

## Struktur Proyek

```
saka-tracker/
├── index.html        Aplikasi utama (single-file HTML + CSS + JS)
├── sw.js              Service Worker — caching aset & mode offline
├── manifest.json      Manifest PWA (ikon, nama, shortcut, versi)
├── SKILL.md           Spesifikasi teknis lengkap (arsitektur, formula, extension points)
└── README.md          Dokumen ini
```

## Menjalankan Secara Lokal

Service Worker memerlukan konteks HTTP (bukan `file://`), jadi jalankan lewat server statis sederhana:

```bash
# opsi 1 — Python
python3 -m http.server 8080

# opsi 2 — Node
npx serve .
```

Lalu buka `http://localhost:8080/` di browser. Untuk pengalaman PWA penuh (install ke layar utama, ikon, shortcut), sajikan proyek pada path `/sakahybrid/` sesuai konfigurasi `start_url` di `manifest.json`, atau sesuaikan path tersebut dengan lokasi deploy Anda.

## Model Data

Seluruh state tersimpan sebagai satu objek JSON di `localStorage` (kunci historis `saka_tracker_v5_4`, direferensikan lewat konstanta `STORAGE_KEY`):

```
state
├── config     { assessment, muatan }        // target, diturunkan dari data SLS
├── dashboard  { open, draft, submit, ... }   // agregat, diturunkan dari data SLS
├── sls[]      { kode, nama, open, submit, reject, pending, approve, muatan }
├── history[]  snapshot harian (progress, dashP, velocity, grade)
├── apiKeys    { openai, gemini, mistral }
├── consent    { accepted, version, date }
└── security   { pinEnabled, pinHash, recoveryHash, failedAttempts, lockUntil }
```

Detail lengkap formula (`prioritasSLS`, `performanceGrade`, forecasting) ada di `SKILL.md`.

## Versioning

Proyek ini mengikuti [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`:

- **MAJOR** — perubahan tidak kompatibel ke belakang (mis. migrasi skema data).
- **MINOR** — penambahan fitur yang tetap kompatibel.
- **PATCH** — perbaikan bug tanpa perubahan perilaku.

Nomor versi yang identik harus tercermin di lima tempat setiap kali ada rilis:

| Berkas | Lokasi versi |
|---|---|
| `index.html` | konstanta `APP_VERSION` |
| `sw.js` | konstanta `SW_VERSION` & `CACHE_NAME` |
| `manifest.json` | field `"version"` |
| `SKILL.md` | header `Version documented` |
| `README.md` | badge versi di atas |

Karena proyek ini sengaja tanpa build step, sinkronisasi antar berkas dilakukan manual — namun aplikasi memverifikasi kecocokan versi secara otomatis saat runtime:

1. Saat Service Worker baru aktif, versinya dikirim ke halaman lewat `postMessage`.
2. Halaman membandingkan versi tersebut — dan juga versi di `manifest.json` yang di-*fetch* langsung — terhadap `APP_VERSION`-nya sendiri.
3. Ketidakcocokan dicatat sebagai `console.warn` di browser.
4. Jika Service Worker versi baru selesai terpasang, muncul pita **"Versi baru tersedia"** dengan tombol muat ulang.

`LEGAL_VERSION` (versi dokumen ToS/Privacy) sengaja independen dari `APP_VERSION` — hanya dinaikkan saat teks legal berubah, agar Consent Gate hanya muncul ulang saat benar-benar relevan. Lihat §12 pada `SKILL.md` untuk detail kontrak versioning ini.

## Standar Ikon

Seluruh indikator visual dalam aplikasi menggunakan [Bootstrap Icons](https://icons.getbootstrap.com/) (`<i class="bi bi-...">`) — tidak ada emoji/emoticon di manapun, termasuk pada log console dan halaman offline fallback. Satu-satunya pengecualian adalah dialog native `alert()`/`confirm()`, yang secara teknis tidak dapat merender HTML/ikon sehingga menggunakan teks polos.

## Keamanan & Privasi

- **Tanpa data pribadi (PII)** — hanya menyimpan agregat angka dan label wilayah SLS/RT-RW; tidak pernah menyimpan nama, NIK, alamat, atau nomor telepon responden.
- **Consent Gate** — persetujuan ToS/Privacy Policy wajib sebelum aplikasi dapat digunakan.
- **PIN Lock opsional** — kunci akses 4 digit berbasis hash SHA-256 (bukan enkripsi data, murni gerbang UX perangkat).
- **API key tersimpan plaintext di localStorage** — cocok untuk penggunaan personal/single-user; tidak direkomendasikan untuk perangkat bersama.

## Riwayat Versi

| Versi | Ringkasan |
|---|---|
| 5.5.0 | Standardisasi seluruh ikon ke Bootstrap Icons (emoji dihapus total); sistem Semantic Versioning terpadu lintas berkas dengan sinkronisasi versi otomatis saat runtime antara halaman, Service Worker, dan manifest PWA. |
| 5.4.5 | Penyempurnaan Terms of Service & Privacy Policy; penambahan Consent Gate dan PIN Lock opsional. |

## Roadmap

- [ ] Visualisasi grafik progres harian (Chart.js)
- [ ] Sistem termin yang digeneralisasi (tidak lagi hardcoded satu milestone)
- [ ] Toast/modal kustom menggantikan `alert()`/`confirm()` native
- [ ] Halaman changelog in-app
- [ ] Ekspor analisis harian ke PDF/WhatsApp

Detail lengkap ada pada bagian *Extension Points* di `SKILL.md`.

## Lisensi

Proyek internal — hak cipta dipegang oleh **Saka Omni Webapps**. Tidak didistribusikan di bawah lisensi open-source publik; penggunaan di luar tim internal memerlukan izin dari pengembang.

## Kontak

Dikembangkan dan dirawat oleh **Saka_Omni**.
Untuk pertanyaan teknis atau permintaan fitur, hubungi developer melalui kontak yang tersedia di dalam aplikasi (halaman Pengaturan).

---

<div align="center">

Saka Tracker v5.5.0 &middot; Alat bantu internal monitoring SE2026

</div>
