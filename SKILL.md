# SAKA TRACKER — Technical Specification (SKILL.md)

**App:** Saka Tracker — SE2026 SLS Progress Monitoring
**Version documented:** v5.4.5 (Build 20260708)
**Type:** Single-file client-side web app (HTML+CSS+JS, no backend, no build step)
**Storage:** Browser `localStorage`, key `saka_tracker_v5_4`
**Author role documented for:** Saka_Omni (internal field-ops tooling)
**Scope:** Internal monitoring tool for Sensus Ekonomi 2026 (SE2026) field progress — **not** an official BPS product.

---

## 1. Purpose & Design Philosophy

Saka Tracker helps a PML/koordinator track SLS-level field progress (open/submit/reject/pending/approve counts) against two parallel targets — **Dashboard FASIH** (assessment count) and **Muatan** (contract volume) — and surfaces prioritization, forecasting, and AI-generated strategic insight.

Design constraints that shape every decision in this codebase:

- **Local-first, zero-backend.** Everything lives in the browser. No server, no accounts, no sync. This keeps the tool deployable as a single HTML file (email it, host it anywhere, open it offline) but means data never leaves the device unless the user explicitly exports it or triggers the AI Insight feature.
- **Single source of truth = SLS array.** Dashboard totals (`state.dashboard`) and target base numbers (`state.config.assessment`, `state.config.muatan`) are **derived**, never hand-edited. They're recomputed from `state.sls` every time data changes via `syncDashboardFromSLS()` / `syncConfigTargets()`. Never write directly to `state.dashboard.*` from a form.
- **No PII.** The app is scoped to store aggregate counts and SLS/RT-RW area labels only. It must never be extended to store respondent-level personal data (name, NIK, address, phone). This is enforced socially (Consent Gate copy, ToS/Privacy) not technically — see §10.
- **Graceful AI degradation.** The Multi-AI Orchestrator always has a deterministic, non-AI fallback (`deterministicFallback()`) so the app is fully functional with zero API keys configured.

---

## 2. Tech Stack

- Vanilla HTML/CSS/JS. No framework, no bundler, no npm dependencies.
- Only external resource: Bootstrap Icons via CDN (`bootstrap-icons@1.11.3`).
- Fonts: system font stack (`Inter, system-ui, sans-serif`).
- Browser APIs used: `localStorage`, `fetch`, `crypto.subtle` (SHA-256 hashing for PIN, added v5.4.5), `FileReader` (restore), Blob-less data-URI download (backup).
- Target runtime: mobile Safari/Chrome (this is a field tool, phone-first). Viewport is locked (`user-scalable=no`) and layout is single-column, bottom-tab navigation.

---

## 3. File Structure

Everything lives in **one HTML file**. Internal organization (by `<!-- comment -->` section markers in the `<script>` block):

```
<style>                      All CSS, custom-property design tokens under :root
<body>
  #page-dashboard            Main input + analysis page
  #page-data                 SLS master data CRUD (kode, open, muatan)
  #page-history              Daily snapshot history list
  #page-settings             API keys, backup/restore, security, legal
  #legal-modal               ToS / Privacy Policy modal (shared)
  #consent-gate              Full-screen gate, v5.4.5+
  #pin-lock-screen           Full-screen PIN pad, v5.4.5+
  <nav class="bottom-nav">   4-tab navigation
<script>
  VERSI APLIKASI             APP_VERSION, BUILD_DATE, LEGAL_VERSION
  CONFIG & STATE MANAGEMENT  CONFIG const, DEFAULT_SLS_DATA, state object, migration guards
  HELPER FUNCTIONS           getElapsedDays, getSisaHariKeClearance
  SYNC FUNCTIONS             syncConfigTargets, syncDashboardFromSLS
  INPUT LOGIC                toggleInputMode, updateSLS (with submit/open coupling)
  CORE LOGIC                 getProgress, getVelocity, prioritasSLS, performanceGrade, generateSLSDetail
  RENDER: TERMIN ALERT       renderTerminAlert (large — termin 1 status box variants)
  RENDER: FORECAST etc.      renderForecast, renderTargetsAndComparison, renderDifferenceAnalysis,
                              renderPriorityAccordions, renderPerformance
  HISTORY FUNCTIONS          renderHistory, deleteHistory, clearAllHistory
  MAIN ACTIONS                runAnalysis (orchestrates a full analysis + snapshot + AI call)
  NAVIGATION                 switchPage
  CRUD DATA SLS               renderDataSLSPage, updateDataSLS, addNewSLSRow, deleteDataSLS, saveDataSLS
  SETTINGS, BACKUP & RESTORE  saveSettings, loadApiKeys, updateApiStatusUI, testAllApis, backupData, restoreData
  LEGAL MODAL                 openModal(type), closeModal — ToS/Privacy content (HTML, Bahasa Indonesia)
  HYBRID AI ORCHESTRATOR      class HybridAIOrchestrator
  CONSENT GATE & PIN LOCK     v5.4.5+ — see §10
  INITIALIZATION              initForm, DOMContentLoaded handler
```

---

## 4. Data Model

### 4.1 `state` object (persisted whole, JSON, to `localStorage['saka_tracker_v5_4']`)

```js
state = {
  config: {
    assessment: Number,   // derived: sum of (open+submit+approve) across all SLS
    muatan: Number        // derived: sum of muatan across all SLS
  },
  dashboard: {
    open: Number, draft: Number, submit: Number,
    reject: Number, pending: Number, approve: Number
  },                       // derived from state.sls except draft (manually input)
  sls: [ SLSRow, ... ],     // the single source of truth
  history: [ SnapshotRow, ... ],
  apiKeys: { openai: String, gemini: String, mistral: String },
  isAccumulationMode: Boolean,
  consent: { accepted: Boolean, version: String|null, date: ISOString|null },   // v5.4.5+
  security: {                                                                   // v5.4.5+
    pinEnabled: Boolean,
    pinHash: String|null,       // SHA-256 hex of the 4-digit PIN
    recoveryHash: String|null,  // SHA-256 hex of lowercased recovery answer
    failedAttempts: Number,
    lockUntil: EpochMillis|null // soft lockout after 5 failed attempts, 30s
  }
}
```

### 4.2 `SLSRow`

```js
{ kode: "0012", nama: "RT 004 RW 03 DUSUN KARANG KOMIS",
  open: Number, submit: Number, reject: Number, pending: Number, approve: Number,
  muatan: Number }
```

### 4.3 `SnapshotRow` (one per calendar day, keyed by `date` — re-running analysis same day overwrites, not appends)

```js
{ date: "7/9/2026",     // toLocaleDateString('id-ID') — NOTE: locale-dependent string, not sortable as ISO
  progress: Number,      // submit+approve total at time of snapshot
  dashP: Number,         // % of assessment
  velocity: Number,      // data/day at time of snapshot
  grade: "A+"|"A"|"B"|"C"|"D"|"E" }
```

**Known fragility:** `date` is stored via `toLocaleDateString('id-ID')`, which is locale/timezone dependent and not lexicographically sortable. `Forecast`/`Trend` math (`getVelocity()`) relies on **array order**, not date parsing, so this works today but is a landmine if history entries are ever reordered or merged from multiple exports. Prefer ISO date strings (`YYYY-MM-DD`) if this is refactored.

---

## 5. Core Business Logic

### 5.1 Progress definition

```
progress = dashboard.submit + dashboard.approve
```

Draft, reject, and pending are **excluded** from progress. This is a locked business decision from earlier iterations of this app — do not change without explicit confirmation.

### 5.2 Percentages

```
dashP    = progress / config.assessment * 100     // "Dashboard FASIH"
muatanP  = progress / config.muatan * 100          // "Muatan Kontrak"
```

### 5.3 Open/Submit coupling (`updateSLS`)

When a user edits `submit` for a row, `open` is decremented by the same delta (clamped at 0) — the assumption being that submitting an item moves it out of the open pool. `approve` is **not** coupled to `open` or `submit` at all, because approvals can come from newly-discovered field findings that were never in the original `open` count. This asymmetry is intentional; see the code comment block above `updateSLS`.

Validation: `submit` cannot exceed `open + previousSubmit` for that row (alerts and reverts otherwise). `approve` has no upper bound validation.

### 5.4 Velocity (`getVelocity`)

```
if history.length >= 7:
    rate = (progress[last of last 7] - progress[first of last 7]) / 6   // per-day average
else:
    rate = currentProgress / elapsedDaysSinceCONFIG.startDate
```

Returns 0 if no positive delta — this is the trigger for "BELUM ADA RITME" (no rhythm yet) states throughout the UI.

### 5.5 Prioritization (`prioritasSLS`)

```
openScore    = min(open * 0.8, 40)     // capped contribution
approveScore = approve * 0.3
submitScore  = submit * 0.1
muatanFactor = muatan ? muatan/100 : 1
score = (openScore + approveScore + submitScore) * muatanFactor
```

Sorted descending by `score`. Action label thresholds:

| Condition | Action | Class |
|---|---|---|
| `persen >= 100` | Selesai ✅ | `action-done` |
| `open > 50 && persen < 30` | URGENT! 🚨 | `action-urgent` |
| `open > 30 && persen < 50` | Prioritas Tinggi | `action-urgent` |
| `persen > 0` (else) | Lanjutkan | `action-lanjut` |
| `persen == 0` | Mulai | `action-mulai` |

### 5.6 Performance grade (`performanceGrade`)

Compares actual `dashP` against a **linear expected-progress line** from `CONFIG.startDate` to `CONFIG.absoluteDeadline`:

```
expectedProgress = elapsedDays / totalDays * 100
delta = dashP - expectedProgress
```

Grade thresholds (both an absolute `dashP` floor AND a `delta` floor must be met):

| Grade | dashP ≥ | delta ≥ | Label |
|---|---|---|---|
| A+ | 80 | +10 | Excellent 🏆 |
| A | 70 | +5 | Luar Biasa ⭐ |
| B | 60 | 0 | Baik & On Track ✅ |
| C | 50 | −5 | Sedang, Perlu Percepatan ⚠️ |
| D | 40 | −10 | Di Bawah Target 📉 |
| E | else | else | Kritis! 🚨 |

### 5.7 Termin 1 tracking (`renderTerminAlert`)

Hardcoded single milestone: `CONFIG.termin1TargetDate = 2026-07-13`, target = 40% of `dashP`. Renders one of 5 visual states depending on `daysLeft` and `currentProgress`: past-deadline-failed, ≤3 days & <30% (critical), ≤7 days (warning), >7 days (info), or target-already-met (success). Each state independently computes gap-to-40%, gap-to-100%, required daily rate, and ETA — **this logic is duplicated per branch**, not factored out. If a second termin is added (see §13), factor this into a parameterized `renderTerminStatus(terminConfig)` first.

### 5.8 Forecast engine (`renderForecast`)

Single target: `clearanceDate = absoluteDeadline - safetyBufferDays` (currently `2026-08-30 - 3 = 2026-08-27`). Compares `getVelocity()` against the required daily rate to hit 100% by that date; three states (critical / warning / on-track), each showing estimated completion date and buffer/shortfall in days.

---

## 6. AI Layer — `HybridAIOrchestrator`

### 6.1 Provider chain

```
OpenAI (gpt-4o-mini) → Gemini (gemini-2.0-flash) → Mistral (mistral-small-latest) → Deterministic Fallback
```

`generateInsight(prompt)` iterates providers in order, **skips any with no key configured**, calls with a 12s `AbortController` timeout, and on success returns markdown-lite-cleaned HTML (`**bold**` → `<span class="ai-highlight">`, `*italic*` → `<em>`, paragraphs wrapped). On failure of all configured (or zero configured) providers, falls through to `deterministicFallback()`, which synthesizes an on-track/at-risk verdict purely from `getProgress()`, `getVelocity()`, and `prioritasSLS().slice(0,3)` — no network call.

### 6.2 Prompt construction

Built fresh each `runAnalysis()` call in-line (not a separate function) — includes mode (harian/akumulasi), `dashP`, velocity, termin-1 status, and top-3 prioritized SLS codes with open counts. Kept intentionally aggregate-only — **never include `nama` (RT/RW/Dusun labels) or any respondent-adjacent detail in this prompt**, to keep the data sent to third-party providers minimal per the Privacy Policy.

### 6.3 Key storage & transmission

Keys live in `state.apiKeys` (plaintext in localStorage — see §11 limitations). Calls go **directly from the browser to the provider's API** (OpenAI/Google/Mistral endpoints) — Saka Tracker has no backend to proxy through. This is why the Privacy Policy explicitly says pihak ketiga data transmission bypasses any Saka Tracker server.

### 6.4 Status indicator

`updateStatus(name, status)` writes into `#ai-provider-status` in the footer of the AI Insight card with 🟢/🔄/🔴 glyphs — this is the only live "which provider answered" indicator in the UI.

---

## 7. Pages

| Page id | Purpose | Key functions |
|---|---|---|
| `page-dashboard` | Daily input grid (per-SLS open/submit/reject/pending/approve + global draft), triggers full analysis | `initForm`, `runAnalysis`, `updateSLS` |
| `page-data` | Master data CRUD: SLS kode, open FASIH, muatan (not day-to-day counts) | `renderDataSLSPage`, `updateDataSLS`, `addNewSLSRow`, `deleteDataSLS`, `saveDataSLS` |
| `page-history` | List of daily snapshots with delete/clear-all | `renderHistory`, `deleteHistory`, `clearAllHistory` |
| `page-settings` | API keys, connection test, backup/restore, **security (v5.4.5)**, legal links | `saveSettings`, `testAllApis`, `backupData`, `restoreData`, PIN functions (§10) |

Navigation is a simple `display:none/active` toggle (`switchPage`), no routing/hash, no history API — a full page reload always lands back on the dashboard tab.

---

## 8. Rendering Pipeline (`runAnalysis`)

`runAnalysis()` is the single "commit" action, triggered by the primary button on the dashboard. Sequence:

1. `syncDashboardFromSLS()` + `syncConfigTargets()` — recompute all derived totals from the SLS array.
2. Read `global-draft` input into `state.dashboard.draft`.
3. `getProgress()`, `performanceGrade()`.
4. Upsert today's `SnapshotRow` into `state.history` (find-by-date-string; overwrite if exists, else push).
5. Persist to `localStorage`.
6. Call all render functions in sequence: `renderTerminAlert`, `renderForecast`, `renderTargetsAndComparison`, `renderDifferenceAnalysis`, `renderPriorityAccordions`, `renderPerformance`.
7. Build AI prompt, instantiate `HybridAIOrchestrator`, `await generateInsight()`, inject into `#ai-insights`.
8. Reveal `#analysis-container`, smooth-scroll into view.
9. If History tab happens to be active, re-render it too.

This function is `async` because of step 7; every other render call in the sequence is synchronous.

---

## 9. Backup & Restore

- **Backup**: `JSON.stringify(state)` as a `data:` URI download, filename `saka_tracker_backup_YYYY-MM-DD.json`. Includes **everything** — SLS data, history, API keys (plaintext), and as of v5.4.5, `consent` and `security` (PIN hash + recovery hash, not plaintext PIN).
- **Restore**: `FileReader` → `JSON.parse` → sanity check (`restoredState.sls && restoredState.apiKeys` must exist) → replace `state` wholesale → `location.reload()`. As of v5.4.5, restore also back-fills `consent`/`security` defaults if the imported file predates those fields, so old backups don't crash the migration guard.
- **No merge logic exists** — restore is destructive/total, not a diff. Warn users of this in-product if this is ever exposed more prominently.

---

## 10. Security Layer (v5.4.5) — Consent Gate & PIN Lock

### 10.1 Consent Gate

- Constant `LEGAL_VERSION` (currently `"5.4.5"`) is compared against `state.consent.version` on every load (`checkConsentGate()`, called from `DOMContentLoaded`).
- If missing/mismatched/not accepted → full-screen `#consent-gate` overlay blocks the entire app (z-index 999999, solid background, no click-through). Contains a condensed summary of the ToS/Privacy essentials plus buttons to open the full modals (`openModal('tos'|'privacy')`, reused from Settings).
- "Setuju & Lanjutkan" is disabled until the checkbox is checked (`consent-checkbox` onchange toggles `btn-consent-agree.disabled`).
- On accept: `state.consent = {accepted:true, version:LEGAL_VERSION, date:ISOString}`, persisted, gate hidden, falls through to PIN check.
- **Operational rule: bump `LEGAL_VERSION` (and the visible date/version line inside the ToS/Privacy HTML in `openModal()`) every time the legal text changes materially.** This is the only mechanism that re-prompts existing users.

### 10.2 PIN Lock (optional, off by default)

- 4-digit numeric PIN only (fixed length by design, to allow auto-submit on the 4th digit — see `pinPress`).
- Hashing: `sha256Hex()` via `crypto.subtle.digest('SHA-256', ...)`, hex-encoded. Both the PIN and a lowercased recovery answer are hashed the same way and stored as `state.security.pinHash` / `recoveryHash`. **Plaintext PIN/answer are never persisted.**
- Setup happens in Settings → Keamanan Aplikasi (`setupPin()`): requires PIN, confirm-PIN match, and a recovery answer ≥3 chars (mandatory — you cannot enable PIN lock without setting a recovery path).
- Lock screen (`#pin-lock-screen`) is shown whenever `state.security.pinEnabled` is true, checked right after the consent gate clears (`checkPinLock()`), and can also be triggered manually via "Kunci Aplikasi Sekarang" in Settings (`lockAppNow()`).
- Entry via on-screen keypad (`pinPress(digit)` / `pinBackspace()`), 4-dot progress indicator, auto-verifies at 4 digits (`verifyPin()`).
- **Brute-force throttle**: 5 wrong attempts → 30-second soft lockout (`state.security.lockUntil`), reset on success. This is client-side and trivially bypassable via devtools — it is a friction layer, not a security boundary (documented explicitly in-product and in the Privacy Policy).
- **Recovery flow**: "Lupa PIN?" reveals a text input checked against `recoveryHash`. On match, PIN lock is fully disabled (`pinEnabled:false`) and the user is dropped into Settings to set a new one. If the user also forgets the recovery answer, the **only** remaining path is clearing browser data, which wipes all app data (destructive, last resort — no UI shortcut is provided for this on purpose).
- **Explicitly out of scope**: this PIN does **not** encrypt `localStorage`. Anyone with devtools access to the device can read `state` (including SLS numbers and API keys) regardless of PIN lock status. This limitation is stated in the in-app disclaimer text under the PIN setup form and in the Privacy Policy §7.

### 10.3 Load-order contract

```
DOMContentLoaded
  → initForm(), loadApiKeys(), renderHistory(), updatePinSecurityUI()   // app renders normally underneath
  → checkConsentGate()
      → if consent missing/stale: show #consent-gate, STOP (waits for acceptConsent())
      → else: hide gate, call checkPinLock()
          → if pinEnabled: show #pin-lock-screen, STOP (waits for correct PIN)
          → else: hide lock screen, app fully visible
```

Note the app's data layer and DOM are **already initialized underneath** both overlays — they are purely visual blockers (full-viewport, opaque, high z-index), not execution gates. This was a deliberate simplicity trade-off: no need to defer/re-run `initForm()` after unlock, at the cost of the security caveat in §10.2.

---

## 11. Known Limitations (carry these into any future work)

1. **Plaintext API keys** in `localStorage` and in backup JSON exports. Acceptable for a personal single-user field tool; would need real secret storage before any multi-user/shared-device deployment.
2. **PIN Lock is a UX gate, not encryption** (§10.2). Do not represent it to users as protecting sensitive data from a determined technical actor.
3. **Snapshot dates are locale strings**, not ISO — fragile for cross-timezone or cross-device history merges (§4.3).
4. **No merge on restore** — restoring a backup always fully overwrites current state (§9).
5. **Termin logic is hardcoded to a single milestone** (`termin1TargetDate`), with 5 near-duplicated render branches (§5.7) — needs refactoring before adding Termin 2+.
6. **No offline/installable shell** — no manifest.json or service worker yet; the app works offline today only because it's a single static file already loaded, but it isn't installable as a PWA (see §13).
7. **`alert()`/`confirm()`** used throughout for all user feedback and destructive-action confirmations — inconsistent with the rest of the dark, custom-styled UI.

---

## 12. Versioning Convention

- `APP_VERSION` / `BUILD_DATE`: bump on any shipped change; reflected in page `<title>`, header badge, and the Settings app-info box.
- `LEGAL_VERSION`: **independent** of `APP_VERSION** — only bump when ToS/Privacy Policy text changes in a way that should re-surface the Consent Gate to existing users. It's fine for `APP_VERSION` to advance without `LEGAL_VERSION` changing.
- Changelog entries live as a small inline note block inside the Settings `.app-info-box` (not a separate changelog page yet — see §13).

---

## 13. Extension Points (not yet built, ordered roughly by leverage)

- **PWA shell**: `manifest.json` + service worker for install-to-home-screen and true offline resilience.
- **Chart visualization**: `state.history` already has everything needed for a daily progress line chart (Chart.js via CDN) — currently only surfaced as text/cards.
- **Generalized Termin system**: replace the single hardcoded `termin1TargetDate` with an array of `{label, targetDate, targetPercent}` and a parameterized render function (prerequisite: refactor §5.7 first).
- **Per-SLS PIC / medan (terrain) fields**: extend `SLSRow` with `pic` and `medan` (Mudah/Sedang/Sulit) to feed a composite recommendation score (progress × medan-weight × ROI) — this was scoped conceptually in an earlier design pass but not yet wired into this codebase's `prioritasSLS()`.
- **Toast/modal system** to replace `alert()`/`confirm()` calls app-wide, matching the existing dark UI kit.
- **In-app changelog page** rather than the current inline note block.
- **WhatsApp/PDF export** of the daily analysis card stack for sharing with supervisors.

---

## 14. Change Log for This Document

| Version | Change |
|---|---|
| v5.4.5 | Initial SKILL.md written, covering full v5.4.5 architecture. Documents new Consent Gate + PIN Lock security layer, all core formulas, AI orchestrator, and known limitations/extension points. |
