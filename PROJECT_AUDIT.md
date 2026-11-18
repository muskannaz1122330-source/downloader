# UltraDownloader — Complete Repository Audit

**Date:** 2026-11-18 (UTC)
**Repository:** `muskannaz1122330-source/downloader`
**Branch audited:** `arena/6ce6b6a5-downloader` @ `fb7644a` (same commit as `origin/main`)
**Base commit:** `fb7644aedcc02b34dcef7d8fa17e1bd4ee8cca91`
**Scope:** every tracked file in this repository — nothing outside the repo was used as a source of truth
**Method:** static review of all 86 tracked files + `npm ci`, syntax checks, `npm test` (both packages), `npm run build`, `npm audit`, SQL/schema inspection, archive/binary validation

> This document is a **check / audit only**. No source file was modified. Generated `node_modules/` and `dist/` were used for verification and excluded locally from git status; the tracked working tree is unchanged.

---

## 0. Executive verdict

This is a **full-stack "universal video downloader" product** with a Node/Express API, a React/Vite SPA, a XAMPP MySQL schema, a secret admin dashboard, SEO/monetization tooling and Windows IDM integration. It is substantial (~20k lines of hand-written source) and largely well-organised: it installs, parses, builds, and 15 of 25 automated tests pass.

However, **it is not production-safe and it is not portable outside Windows** in its current state.

| Area | Result |
|---|---|
| Install / syntax | ✅ Both packages install cleanly; all JS/JSON parse |
| Production build | ✅ `vite build` succeeds (8 chunks, 1 warning) |
| Backend tests | ❌ 7 / 15 pass (8 fail) |
| Frontend tests | ❌ Cannot start on Linux; with a path workaround 8 / 10 pass |
| Dependency audit | ❌ 6 high (backend), 2 moderate (frontend) |
| Security | ❌ 6 critical-class issues (real secrets committed, 2FA bypassed, unauthenticated system control, CORS allow-all, destructive auto-SQL-import, IDOR) |
| Portability | ❌ `Frontend/vite.config.js` hardcodes a lowercase `../backend` path; repo directory is `Backend` (capital B) |

**Top blockers, in order:** committed real secrets → admin 2FA disabled by default → unauthenticated settings/maintenance/cookie endpoints → CORS allows every origin → auto SQL import can DROP live tables → per-user download history broken in standby mode → `npm run dev` / `npm test` broken on Linux/macOS.

The app works best in its intended environment: **Windows + XAMPP MySQL running + unrestricted internet**. In this sandbox (Linux, no MySQL, restricted outbound hosts) 6 backend tests and 1 frontend test fail purely because they call live YouTube/TeraBox/Vimeo/MDN endpoints; the remaining 3 failures are genuine code defects.

---

## 0.1 Post-audit remediation (applied 2026-11-18)

The findings below describe the repository **as audited at commit `fb7644a`**. The
remediation branch implements the P0/P1/P2 plan; this section records the
verified state afterwards so the report is not read as a claim about the fixed
tree.

| Area | After remediation (verified) |
|---|---|
| Backend tests | ✅ 24 passed (15 integration + 9 security regressions), 2 live tests skipped (`cd Backend && npm test`) |
| Frontend tests | ✅ 10 / 10 (`cd Frontend && npm test`, real companion API) |
| Production build | ✅ `npm run build` succeeds |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities in both packages |
| Secrets / 2FA | ✅ No committed secrets or defaults; TOTP mandatory; production fails fast |
| Auth / CORS / IP / IDOR | ✅ System routes admin-only, strict CORS, `req.ip`, cookie-only SSE, user-scoped file routes |
| SQL import | ✅ Idempotent `schema.sql`; no `DROP TABLE`; admin seeded from env |
| Standby DB | ✅ Honest `standbyMode` / `mysqlConnected`, strict user-scoped queries |
| Portability | ✅ `../Backend` probed case-sensitively; companion lifecycle owned by test runner |
| Source honesty | ✅ `GET /api/v1/admin/sources-health` reports real attempts, not "222/222" |

Deterministic offline fixtures (`ULTRA_FIXTURES=1`) replace live third-party calls
in CI; `LIVE=1 npm run test:live` remains available as an opt-in network smoke
suite. See `README.md` for setup and `.github/workflows/ci.yml` for CI.

---

## 1. Repository facts

| Item | Value |
|---|---|
| Branch | `arena/6ce6b6a5-downloader` (active) |
| HEAD / base | `fb7644a` — "new" |
| Commits | **1** (grafted shallow clone); author `ShakeelAijaz123223` |
| Remote | `https://github.com/muskannaz1122330-source/downloader.git` |
| Working tree | clean (source); branch has no diff vs `main` |
| Tracked files | **86** |
| Hand-written source LOC | **19,917** (JS/JSX/CJS/CSS/SQL/HTML/conf, excluding lockfiles) |
| Total LOC incl. lockfiles | 29,616 |
| Repo size (excl. `.git`) | ~1.4 MB |
| Root layout | `Backend/` + `Frontend/` only |
| Missing | `README.md`, `LICENSE`, `.gitignore`, CI workflow, Dockerfile, `CONTRIBUTING`, any docs |
| Tracked env files | `Backend/.env`, `Backend/.env.example`, `Frontend/.env`, `Frontend/.env.example` |
| Tracked binaries | 2 ZIPs + 1 PDF in `Backend/storage/files/` (2,894 bytes total) |
| Largest files | `extractorEngine.js` (1,648), `SubPages.jsx` (1,188), `publicRoutes.js` (1,082), `adminRoutes.js` (896), `HeroSmartAnalyzer.jsx` (816), `teraboxEngine.js` (803), `database.js` (803) |

**Notable:** both real `.env` files are byte-for-byte identical in *values* to their `.env.example` counterparts (verified key-by-key). That means the checked-in `.env` **is** the example configuration, including all default signing keys, the TOTP secret and the AES vault key. There is no history to rotate from — the secrets are in the single public commit.

---

## 2. Architecture

```
Browser (React 18 SPA, Vite)
   │  /api/v1/*  (relative, same origin)
   ▼
Vite dev proxy  ──or──  nginx (prod, :80)
   │                         ├─ /api/v1/admin/live-cards/stream  → SSE, buffering off
   │                         ├─ /api/*                           → 127.0.0.1:4000
   │                         ├─ /sitemap.xml, /robots.txt        → backend
   │                         └─ /                               → dist/index.html
   ▼
Express 4 app  (Backend/src/app.js, :4000)
   ├─ helmet → CORS → compression → cookieParser → json(4mb)
   ├─ attachRequestContext (clientIp, websiteProjectId, optional user JWT)
   ├─ rateLimit 1200 req/min on /api/v1
   ├─ seoSitemapRouter   → /robots.txt, /sitemap.xml
   ├─ publicRouter       → /api/v1   (52 routes)
   ├─ adminRouter        → /api/v1/admin (32 routes; last 29 behind super-admin JWT)
   └─ AppError → JSON { success, error:{code,message,details} }
        │
        ├─ services/: extractorEngine, teraboxEngine, deepPageSniffer,
        │   extendedEmbedExtractors, idmTurboDownloader, streamProxyService,
        │   fileDownloadService, downloadJobManager, liveCardBus (RAM + SSE),
        │   trafficEngine (telemetry/cache/coalescing/analytics batch)
        ├─ security/: cryptoVault (bcrypt, JWT, TOTP, AES-256-GCM), antiSsrfGuard
        └─ db/database.js → mysql2 pool (XAMPP, 50 conn) OR in-memory SQL emulator
                              │
                              └─ ultradownloader_xampp.sql (16 tables, 222 platforms, 350 INSERTs)
External: youtubei.js, yt-search, ~30 hard-coded third-party hosts, DoH (Cloudflare/Google),
          Windows IDMan.exe, XAMPP mysqld.exe autostart
```

**Runtime modes:**
1. **MySQL connected** — `mysql2/promise` pool, auto-imports the SQL dump if `admin_users`/`platforms`/`ip_lockouts` are missing, syncs 222 platform definitions, re-hydrates engine preferences.
2. **Standby** — if MySQL is unreachable, `database.js` falls back to `mem.*` arrays and a **regex-based fake-SQL interpreter** (`executeStandbyMemoryQuery`, lines 456–712). A 3-second poller retries MySQL forever. `getDatabaseHealth()` still reports `connected: true` in this mode.

---

## 3. Backend — complete detail

### 3.1 Stack & scripts (`Backend/package.json`)

| Field | Value |
|---|---|
| Name / version | `ultradownloader-backend` / `10.0.0` |
| Type / entry | ESM (`"type":"module"`) / `src/server.js` |
| Scripts | `dev` (`node --watch-path=src`), `start`, `test` (`vitest run`) |
| Runtime deps (16) | express 4, cors, helmet 8, compression, cookie-parser, express-rate-limit 7, dotenv, mysql2 3, zod 3, jsonwebtoken 9, bcryptjs 2, otplib 12, pino 9, uuid 11, `youtubei.js` 15, `yt-search` 2 |
| Dev deps | vitest 2, supertest 7 |
| Explicitly absent | `yt-dlp`, `ffmpeg-static`, `ffprobe-static`, `postinstall` script, `bin/` — tests assert this |

### 3.2 Bootstrap (`src/server.js`, 54 lines)

`createBackendApp()` → `app.listen(PORT, HOST)` **immediately** (so the port is bound before slow initialisation) → `initLiveCardBus()` → `initDatabase()` → `getMediaBinariesStatus()` → log status → register `SIGTERM`/`SIGINT` graceful shutdown. On `EADDRINUSE` it logs "already running" and `process.exit(0)`. **Bootstrap failures are swallowed** (`.catch` only logs a warning), so the process can stay alive with a half-initialised DB.

### 3.3 Middleware chain (`src/app.js`, 94 lines)

1. `trust proxy = 1`
2. `trackBackendTxRxMiddleware` — monkey-patches `res.write`/`res.end` to count bytes; uses **estimated** 380 RX / 240 TX bytes when no real length is present, and `avgLatencyMs: 1.4` is hard-coded in `trafficEngine.js`.
3. `helmet` — CSP **disabled**, CORP `cross-origin`.
4. `cors` — see Finding C4. `credentials: true`, exposes `Content-Range`, `Accept-Ranges`, `Content-Length`, `Content-Disposition`.
5. `compression` — skipped for SSE/downloads/streams.
6. `cookieParser`, `express.json({limit:'4mb'})`, `attachRequestContext`.
7. `rateLimit` — 1200/min per IP on `/api/v1`, `skip` when `NODE_ENV === 'test'`.
8. SEO router → public router → admin router → `/api` 404 handler → error handler.

### 3.4 Configuration (`src/config/env.js`, 65 lines)

`dotenv` loads `Backend/.env` relative to `BACKEND_ROOT`. Groups:

- **Server:** `NODE_ENV`, `PORT=4000`, `HOST=0.0.0.0`, `PUBLIC_SITE_URL`, `CORS_ORIGINS`.
- **DB:** `DB_HOST/PORT/USER/PASSWORD/NAME` (XAMPP defaults root / empty password / `ultradownloader_db`); `DB_POOL_SIZE` read directly in `database.js`.
- **Storage:** `VAULT_STORAGE_DIR`, `TEMP_EPHEMERAL_DIR`.
- **Secrets:** `JWT_ADMIN_SECRET`, `JWT_USER_SECRET`, `PADLOCK_TICKET_SECRET`, `AES_256_VAULT_KEY`, `ADMIN_TOTP_SECRET`, `ADMIN_ALLOW_DEV_TOTP_CODE` — **all have hard-coded fallback literals in source** (lines 41–54), so even deleting `.env` does not remove the known keys.
- **Policy:** `ADMIN_IP_ALLOWLIST`, `ADMIN_MAX_FAILED_ATTEMPTS=3`, `ADMIN_BAN_DURATION_MINUTES=30`, `GUEST_DAILY_DOWNLOAD_LIMIT=50`, `USER_DAILY_DOWNLOAD_LIMIT=500`, `EXTRACTOR_TIMEOUT_MS=25000`.
- `DOWNLOAD_TICKET_SECRET`, `DOWNLOAD_TICKET_TTL_SECONDS=300` are read directly in `fileDownloadService.js:22-25`.

### 3.5 Authentication & authorisation

The "5-layer" admin gate:

| Layer | Implementation | Notes |
|---|---|---|
| 1 — secret URL | `vault-control-x9p4` (frontend hard-coded default) | discoverable in JS bundle |
| 2 — IP allowlist | `enforceAdminIpAllowlist` applied to whole admin router | empty by default → disabled |
| 3 — 3-strike ban | `ip_lockouts` table, 30 min | uses spoofable `x-forwarded-for` |
| 4 — PIN padlock | bcrypt hash of `2580`, signed 10-min JWT ticket | PIN is in `.env.example`, tests and frontend |
| 5 — credentials + TOTP | bcrypt `UltraAdmin@2026` + RFC-6238 | **effectively disabled**, see C2 |

`adminRouter.use(requireSuperAdminAuth)` at `adminRoutes.js:162` protects every route declared after it (analytics, finance, SEO, websites, platforms, ads, settings, cookies, audit logs, SSE). Public-user auth uses a 7-day JWT (`ud_user_jwt` cookie + `Authorization: Bearer`), admin uses an 8-hour JWT (`ud_admin_jwt` cookie + `X-Admin-Token`). All JWTs are also stored in `sessionStorage` by `apiClient.js`.

### 3.6 Database (`src/db/database.js`, 803 lines + SQL dump 586 lines)

- **16 tables:** `websites`, `admin_users`, `ip_lockouts`, `users`, `user_favorites`, `platforms`, `ad_waterfall_zones`, `system_settings`, `saved_vault_videos`, `finance_ledger`, `seo_keywords`, `encrypted_cookies`, `download_jobs`, `share_links`, `analytics_events`, `security_audit_logs`.
- **222 platform definitions** in `src/data/platformDefinitions.js` (102 flagged `isAdult`; categories: social, video, education, cloud_terabox, adult_18), 4 default ad-waterfall zones.
- SQL dump: 350 `INSERT` rows, composite indexes, `ENGINE=InnoDB utf8mb4`. `download_jobs` has indexes on `(requester_ip, created_at)` and `status` but **not on `user_id`**, which is the column every history query filters on.
- Auto-import: `ensureXamppSchemaImported()` (line 189) executes the whole dump with `multipleStatements: true` if any of 3 tables is missing. The dump begins with **16 `DROP TABLE IF EXISTS`** statements (lines 14–29) → see C5.
- Windows-only `mysqld.exe` autostart (lines 152–187), 3-second reconnect poller, `flushStandbyMutationsToMysql()` syncs vault + ledger rows.
- **Standby emulator** (`executeStandbyMemoryQuery`, lines 456–712): a chain of ~50 regex `if` statements matching exact SQL prefixes. Unmatched statements silently return `[]` or `{affectedRows:1}` — see H8.

### 3.7 Services (10 files in `src/services/`)

| File | LOC | Purpose |
|---|---:|---|
| `extractorEngine.js` | 1,648 | Core multi-platform analyzer: `youtubei.js` Innertube, `yt-search`, YouTube InnerTube API, Dailymotion metadata, PeerTube API, TikTok (`tikwm.com`), X (`vxtwitter`), Reddit JSON, Vimeo player config, SoundCloud, embed/deep sniffing, DRM honesty check, `cachedOrCoalesced` analysis cache |
| `teraboxEngine.js` | 803 | TeraBox mirror domains, short-url/surl resolution, share session, super-chunk discovery, live M3U8 manifest builder, turbo full-video download |
| `downloadJobManager.js` | 500 | Guest = zero DB rows; registered user = row bound to `user_id`; job CRUD, IDM dispatch, progress overlay, `.ef2`/file endpoints |
| `idmTurboDownloader.js` | 419 | 32-thread parallel HTTP-range downloader, speed limiter, Windows `IDMan.exe` detection/launch, `.ef2` export generation, UA selection |
| `fileDownloadService.js` | 364 | HMAC-SHA256 signed short-lived download tickets, filename sanitisation, range/resume streaming for local + remote targets |
| `extendedEmbedExtractors.js` | 346 | Bilibili, Odysee, OK.ru, Bitchute, Archive.org, JustWatch-style embed adapters |
| `streamProxyService.js` | 344 | RFC-9110 206 range for local files, remote stream proxy, HLS manifest rewriting, HLS→single-file concatenation, subtitle proxy, live preview pipe |
| `trafficEngine.js` | 336 | RX/TX byte telemetry (30 one-second buckets), single-flight promise coalescing, TTL read cache, write-behind analytics batch, 16 runtime engine preferences, MBps snapshots |
| `deepPageSniffer.js` | 232 | HTML regex crawler for embedded `<video>`/m3u8/mp4/iframe candidates |
| `liveCardBus.js` | 159 | In-RAM volatile cards (max 200, 2 h TTL, URL de-dup), SSE client set, `snapshot`/`card_added`/`card_updated`/`card_removed` events |

Supporting modules: `security/cryptoVault.js` (130), `security/antiSsrfGuard.js` (194), `middleware/securityMiddleware.js` (184) = **508 lines** of crypto/SSRF/auth guards; `utils/errors.js` + `utils/logger.js` = **53 lines** for the JSON envelope, `AppError`, `asyncHandler` and pino redaction.

### 3.8 API surface

**52 public routes**, **32 admin routes**, **2 SEO routes**. Full tables in the Appendix.

---

## 4. Frontend — complete detail

### 4.1 Stack & scripts (`Frontend/package.json`)

`ultradownloader-frontend` v8.0.0, ESM, React 18.3, React Router 6.28, TanStack Query 5 (declared but not used for data fetching), Framer Motion 11, Recharts 2.15, hls.js 1.7, lucide-react, Tailwind 3.4, Vite 6, Vitest 2 + Testing Library. Scripts: `dev` (`vite --host 0.0.0.0 --port 5173`), `build`, `preview` (:4173), `test`.

### 4.2 Routes (`src/App.jsx`, 96 lines)

`/`, `/share-target`, `/v/:shortCode`, `/tools/:slug`, `/sites`, `/player`, `/albums`, `/downloads`, `/favorites`, `/settings`, `/login`, `/register`, `/legal/:docType`, plus honeypot fake-404s (`/admin`, `/admin/*`, `/wp-admin`, `/dashboard`), the lazy-loaded secret portal `/vault-control-x9p4` (Ctrl+Shift+Alt+U shortcut), and catch-all 404.

### 4.3 UI inventory (26 files in `pages/` + `components/`)

- **Pages (7 files):** `HomePage`, `ViralSharePage`, `SeoToolLandingPage`, `SubPages.jsx` (8 exported pages: SupportedSites, StandalonePlayer, AlbumMixSearch, DownloadsHistory, Favorites, Settings, UserAuth, Legal), `HoneypotNotFoundPage`, `SecretAdminPortal` (492 lines), `App.jsx`.
- **Downloader components:** `HeroSmartAnalyzer` (816), `LandingSections` (300), `SupportedSitesSection` (247), `DownloadQueueDrawer` (577).
- **Admin components (7):** `PadlockAuthScreen`, `SecretAdminPortal`, `ProfitDashboardTab` (388), `FinanceLedgerTab`, `SeoManagerTab`, `SavedVaultTab`, `OperationsTab` (563), `LiveNotificationDrawer`.
- **Layout:** `Navbar` (493), `AppSidebar`, `Footer`, `AnnouncementBar`.
- **Player:** `OnlineVideoPlayer`, `CenterTheaterModal`.
- **Monetization / UI / icons:** `AdWaterfallManager`, `Primitives`, `PlatformIcon`.
- **Styles:** `tokens.css` (light-theme CSS variables), `globals.css` (Tailwind + card utilities), `animations.css` (2 keyframes). `AppContext` forces `data-theme="light"` at runtime, while `index.html` ships `data-theme="dark"` — a small flash/inconsistency.
- **PWA:** `manifest.webmanifest` with `share_target`; `main.jsx` registers `/sw.js` in production. `sw.js` is **3 lines with an empty `fetch` listener** → no caching, no offline support, share target still works only because the SPA route exists.

### 4.4 State & API client

`AppContext.jsx` (512 lines) owns language (EN/UR), bootstrap config, platforms, websites, ad zones, settings, 16 engine preferences, telemetry polling, user, favourites, download queue, adult gate, toasts. `apiClient.js` (565 lines) exposes **~55 methods** mapping 1:1 to backend endpoints, plus client-side URL healing and anti-SSRF/DRM pre-validation. `instantDownload.js` and `fileDownload.js` build signed `/files/download/...?ticket=` URLs and dispatch native anchor downloads.

**Environment-variable audit (frontend):**

| Variable (`.env`) | Used? | Where |
|---|---|---|
| `VITE_API_BASE_URL=/api/v1` | ✅ | `apiClient.js:4` |
| `VITE_BACKEND_ORIGIN=http://localhost:4000` | ⚠️ | read as `process.env` in `vite.config.js:12` — Vite does **not** load `.env` into `process.env` at config-evaluation time, so the fallback `127.0.0.1:4000` always wins |
| `VITE_ADMIN_SECRET_ROUTE=/vault-control-x9p4` | ❌ | `App.jsx:24` reads `VITE_SECRET_ADMIN_SLUG` instead (different name) |
| `VITE_DEFAULT_PADLOCK_DEMO_PIN=2580` | ❌ | not referenced anywhere |

### 4.5 Build output (`npm run build`)

```
dist/index.html                              1.15 kB │ gzip:   0.59 kB
dist/assets/index-...css                    48.86 kB │ gzip:   8.80 kB
dist/assets/SecretAdminPortal-...js         71.33 kB │ gzip:  16.08 kB
dist/assets/vendor-motion-...js            143.13 kB │ gzip:  44.12 kB
dist/assets/index-...js                    157.41 kB │ gzip:  40.83 kB
dist/assets/vendor-react-...js             163.65 kB │ gzip:  53.54 kB
dist/assets/vendor-charts-...js            422.12 kB │ gzip: 114.09 kB
dist/assets/vendor-player-...js            594.02 kB │ gzip: 185.48 kB   ← >500 kB warning
✓ built in 8.68s (2,588 modules)
```

---

## 5. Deployment & tooling

| File | Purpose / observations |
|---|---|
| `Backend/ecosystem.config.cjs` | PM2, 1 fork instance, `NODE_ENV=production`, 1 GB restart, app name still `ultradownloader-backend-v7` |
| `Backend/nginx/ultradownloader.conf` | :80 only (no TLS/443), `server_name ultradownloader.pro www.ultradownloader.pro`, SSE location with buffering off, `/api/` proxy with range headers, SPA `try_files` |
| `Frontend/vite.config.js` | dev proxy for `/api`, `/sitemap.xml`, `/robots.txt`; `allowedHosts: true`; **auto-installs and auto-starts the backend companion**; manual vendor chunks; Vitest config (jsdom) |
| `Backend/database/ultradownloader_xampp.sql` | phpMyAdmin import instructions; auto-imported by backend |
| `Backend/storage/` | `files/` (3 sample assets), `tmp/.gitkeep`, `vault/.gitkeep` |

**Version drift:** backend package `10.0.0`, frontend `8.0.0`, SQL header "V8.0", PM2 name "v7", `.env.example` "Contract v7.0", `trafficEngine.js` "V9.0", `/health` reports `version: '8.0.0'`, `server.js` logs "V10.0", secret defaults in `env.js` are `v10_*` while `.env` values are `v7_*`. Nothing is functionally broken by this, but it makes incident triage confusing.

---

## 6. Verification performed

| Check | Command | Result |
|---|---|---|
| Git state | `git status`, `git log`, `git branch -vv` | clean, 1 commit, branch == main |
| Syntax | `node --check` on every backend `.js`/`.cjs` + frontend configs | ✅ all pass |
| JSON | parse both `package.json`, manifest | ✅ |
| Install | `npm ci` in both packages | ✅ 260 + 291 packages, 2 deprecation warnings |
| Build | `npm run build` (Frontend) | ✅ 8.68 s, one >500 kB chunk warning |
| Backend tests | `npm test` (Backend) | ❌ 7 passed / 8 failed |
| Frontend tests | `npm test` (Frontend) | ❌ startup error; with temporary `backend`→`Backend` symlink: 8 passed / 2 failed + orphan process |
| Audit | `npm audit --omit=dev` | ❌ backend 6 high, frontend 2 moderate |
| Schema | SQL dump inspection | 16 tables, 16 DROPs, 350 INSERTs, 222 platform rows |
| Assets | `unzip -t` on both ZIPs; PDF header | ✅ valid ZIPs; PDF 1,346 B starting `%PDF-` (placeholder content) |
| Secrets | key-by-key `.env` vs `.env.example` | all 20 backend + 4 frontend values identical |

### 6.1 Backend test matrix (15 tests)

| # | Test | Result | Reason |
|---|---|---|---|
| 1 | Zero yt-dlp / clean zero-fake SQL state | ✅ | |
| 2 | Anti-SSRF + Widevine DRM guard | ✅ | |
| 3 | Real YouTube 4K + HTTP 206 bytes | ❌ 422 | live `youtube.com` unreachable in sandbox |
| 3b | `/stream/direct-download/Flower...mp4` | ❌ 502 | live MDN sample unreachable |
| 3c | Signed PDF/ZIP tickets, ranges, traversal, expiry | ✅ | |
| 3d | Expired ticket → 410 | ✅ | |
| 3e | One paste = one RAM card | ❌ 422 | depends on live analysis |
| 3f | Dailymotion + generic page coverage | ❌ 422 | live upstream unreachable |
| 4 | Real TeraBox share + 206 ranges | ❌ 422 | live TeraBox unreachable |
| 5 | Vimeo / PeerTube / SoundCloud / live search | ❌ 422 | live upstream unreachable |
| 6 | Guest zero-history rule | ✅ | |
| 7 | Strict multi-user isolated history | ❌ `expected 0 to be 2` | **code defect H8** (standby emulator) |
| 8 | 5-layer padlock + VIEW/SAVE/DELETE + ledger | ✅ | |
| 9 | Settings + DB diagnostics | ❌ `expected 0 >= 222` | **code defect H8** (`SELECT COUNT(*) AS cnt`) |
| 10 | Sitemap / robots without admin slug leak | ✅ | |

### 6.2 Frontend test matrix (10 tests, run with workaround)

| # | Test | Result | Reason |
|---|---|---|---|
| 1 / 1b / 1c / 1d | SSRF, URL healing, download URL builder, no tech leakage | ✅ | |
| 2 | Real homepage YouTube flow | ❌ | live YouTube analysis unavailable; also depends on hard-coded "Java Programming Full Tutorial" title |
| 2b / 2b2 / 2c | Real PDF/ZIP bytes, reachable origin, anchor dispatch | ✅ | |
| 3 | Full live admin padlock → RAM card → vault | ✅ | |
| 4 | Guest zero-history + user history + delete + cookies | ❌ `expected 0 to be 2` | **same code defect H8** |

### 6.3 Dependency advisories (`npm audit --omit=dev`)

**Backend — 6 high:** `body-parser` (DoS via trailing bytes after compressed body, fix available), `zod` (memory exhaustion on oversized constrained collections, fix = zod 4 major), `minimatch` → `redstar` → `node-fzf` → `yt-search` (ReDoS chain; only "fix" is downgrading `yt-search` to 0.0.2, a semver-major change).
**Frontend — 2 moderate:** `react-router` / `react-router-dom` (open redirect via backslash in `<Link>`/`useNavigate`, CVE-2025-68470 bypass; SSR hydration constructor injection; fix = react-router-dom 7.18.6 major).

---

## 7. Findings (prioritised, with evidence)

### 🔴 CRITICAL

**C1 — Real secrets and admin credentials are committed.**
`Backend/.env` and `Backend/.env.example` contain identical, publicly-known JWT signing keys, padlock ticket secret, AES-256 vault key and TOTP seed (`env.js:41-54` also hard-codes fallbacks). `database/ultradownloader_xampp.sql:238` ships the bcrypt hashes of the default admin password and PIN. `Frontend/src/components/admin/PadlockAuthScreen.jsx:9-11` **pre-fills** the admin email, password `UltraAdmin@2026` and TOTP `123456` in the shipped JS bundle; the same password/PIN appear in both test suites. Anyone can mint admin/user JWTs, decrypt the cookie vault, or log into the dashboard.
→ Rotate every secret, remove `.env` from git (`git rm --cached`), add `.gitignore`, load secrets from the environment/secret manager, remove all hard-coded defaults and pre-filled credentials, and force a password/PIN/TOTP reset.

**C2 — Admin 2FA is disabled by default, including production.**
`cryptoVault.js:59-73`: if `totpCode` is empty, `verifyTotp2FA` returns `Boolean(ENV.ADMIN_ALLOW_DEV_TOTP_CODE)`; `env.js:54` defaults that to `'123456'` and `Backend/.env` sets it explicitly. `ecosystem.config.cjs` sets only `NODE_ENV/PORT/HOST`, so the dev bypass stays active under PM2 production. Gate 2 is therefore password-only.
→ Delete the bypass entirely; require a valid TOTP in all environments; make the app fail startup if `ADMIN_TOTP_SECRET`/JWT secrets are missing in production.

**C3 — Unauthenticated system-control endpoints.**
`publicRoutes.js:190` `PUT /system/settings`, `:227` `POST /system/db-maintenance` (supports `factory_reset_settings`, `clear_completed_jobs`, `optimize_tables`), `:263` `POST /system/cookies`, `:297` `POST /system/clear-cache`, `:211` `GET /system/db-diagnostics` are all on the **public** router with only the generic rate limiter. Any anonymous visitor can change engine preferences, reset settings, inject encrypted cookie blobs, flush caches and read DB internals.
→ Move all of them behind `requireSuperAdminAuth`, or split into a public read-only subset + an admin router.

**C4 — CORS allow-list is dead code; every origin is allowed with credentials.**
`app.js:31-45`: the `origin` callback checks the allow-list, then `return cb(null, true)` **unconditionally on the failure path**. With `credentials: true`, any website can make authenticated cross-origin requests using the admin/user cookies.
→ `return cb(new Error('Origin not allowed'))` for unknown origins (or `cb(null, false)`), and derive the list from `ENV.CORS_ORIGINS` only.

**C5 — Auto SQL import can destroy live data.**
`database.js:209-218` re-runs `ultradownloader_xampp.sql` whenever `admin_users`, `platforms` **or** `ip_lockouts` is missing. The dump starts with 16 `DROP TABLE IF EXISTS` (SQL lines 14-29) → one missing table wipes users, finance ledger, vault, share links, analytics, cookies and download history.
→ Replace with idempotent `CREATE TABLE IF NOT EXISTS` migrations, or never auto-import against an existing database; require an explicit import flag.

**C6 — IDOR: unauthenticated access to other users' download jobs.**
`publicRoutes.js:833` `GET /downloads/:id/file`, `:856` `/:id/idm-export`, `:879` `POST /:id/open-in-idm` call `getDownloadJobRawRow(req.params.id)` **without a user argument** (`downloadJobManager.js:337-341` → `SELECT * FROM download_jobs WHERE id = ?`). A guest can enumerate IDs and read another user's stream URL, file path or archived file, or redirect to it. This contradicts the "strictly user-only history" guarantee.
→ Pass `req.user`, require `requireRegisteredUser`, and use the user-scoped variant for all three.

### 🟠 HIGH

**H7 — Linux/macOS: `npm run dev` and `npm test` cannot start.**
`Frontend/vite.config.js:10-11` resolves `../backend/src/server.js` and `../backend`, but the directory is `Backend` (capital B). On case-sensitive filesystems `ensureBackendDependenciesInstalled()` runs `npm install` in a non-existent cwd → `spawnSync /bin/sh ENOENT` startup error. Confirmed: frontend Vitest aborts before running any test; with a temporary `backend → Backend` symlink 8/10 tests ran. The comment claims "works 100% on Windows" — true only because Windows is case-insensitive.
→ Use `../Backend` (or derive the path by probing both), and guard `execSync` with `fs.existsSync(backendCwd)`.

**H8 — Standby (no-MySQL) SQL emulator silently breaks real features.**
`executeStandbyMemoryQuery` (`database.js:456-712`) matches SQL by prefix regex and returns `[]` for anything unmatched. Missing handlers include:
- `SELECT * FROM download_jobs WHERE user_id = ? ORDER BY ...` (`downloadJobManager.js:352`) → user history always `[]` → backend test 7 and frontend test 4 fail;
- `SELECT id, local_output_path FROM download_jobs WHERE id = ? AND user_id = ?` (`:369`) → per-item delete/pause returns 404;
- `SELECT COUNT(*) AS cnt FROM <table>` (`database.js:753`) → all admin diagnostics table counts `0` → backend test 9 fails;
- `DELETE ... WHERE id = ? AND user_id = ?` is matched by a loose prefix regex that ignores `user_id` → **cross-user deletion** is possible in standby if the SELECT guard is ever loosened.
Also `getDatabaseHealth()` reports `connected: true` while in standby (`database.js:444`), so the admin dashboard hides the outage.
→ Replace the regex emulator with a real embedded DB (e.g. `better-sqlite3`) or add exact handlers + a strict fallback that throws; report `standbyMode: true` honestly.

**H9 — Client IP is spoofable; admin ban/allowlist can be bypassed.**
`securityMiddleware.js:10-16` prefers the raw `x-forwarded-for` header over `req.ip` even though `app.set('trust proxy', 1)` already produces a trustworthy `req.ip`. An attacker sending `X-Forwarded-For: <victim>` evades the 3-strike lockout and satisfies an IP allowlist.
→ Use `req.ip` (with an explicitly configured trusted-proxy count), not the raw header.

**H10 — Admin JWT in a query string.**
`securityMiddleware.js:165` accepts `req.query.adminToken` and `apiClient.js:406` sends `?adminToken=...` on the SSE URL (EventSource cannot set headers). Tokens end up in access logs, proxies, browser history and referrers. The same query parameter works on **all** protected admin routes, not just SSE.
→ Use the existing httpOnly `ud_admin_jwt` cookie for SSE; remove the query fallback entirely.

**H11 — Tests depend on live third-party sites and hard-coded content.**
6 backend + 1 frontend tests hit YouTube, TeraBox, Vimeo, Dailymotion, SoundCloud, PeerTube, `yt-search` and an MDN MP4; they assert exact titles like "Spring"/"Java Programming Full Tutorial". In any restricted/CI/offline environment they fail with 422/502. They are integration tests masquerading as unit tests.
→ Add a mock/fixture layer (MSW or a local fixture server) and keep a small opt-in `LIVE=1` smoke suite.

**H12 — Known vulnerable dependencies.**
6 high (backend) + 2 moderate (frontend), see §6.3. `body-parser`, `zod`, `yt-search` chain and `react-router` all need upgrades; two require semver-major migrations.

### 🟡 MEDIUM

**M13 — Frontend env contract is broken.** 3 of 4 `Frontend/.env` variables are unused or misnamed (`VITE_ADMIN_SECRET_ROUTE` vs `VITE_SECRET_ADMIN_SLUG`, `VITE_DEFAULT_PADLOCK_DEMO_PIN` unused, `VITE_BACKEND_ORIGIN` read via `process.env` instead of `loadEnv()`). The "secret" admin route is therefore a hard-coded constant baked into the bundle.
**M14 — Vite companion plugin leaks processes.** `vite.config.js:62-105` spawns a backend on `4000` from inside Vitest; cleanup only runs on `httpServer 'close'`. Observed: `close timed out after 10000ms`, "Tests closed successfully but something prevents Vite server from exiting", plus an orphan `node .../server.js` holding port 4000 (had to be killed manually).
**M15 — SSRF guard gaps.** `validateSafeExternalUrlSync` (`antiSsrfGuard.js:114-162`) blocks literal private IPs/hostnames but not numeric/hex/octal IPv4 forms, and `/intake/paste-capture`, `/share`, `/stream/terabox-hls` call only the **synchronous** check (no DNS). `assertSafeOutboundUrl` swallows `dns.lookup` errors (`:188-190`) → fail-open, and the DoH "ISP poisoning" bypass (`:176-180`) deliberately overrides a private DNS answer. `fetch(..., {redirect:'follow'})` in `streamProxyService.js:100` can follow a public URL into a private redirect target.
**M16 — Unvalidated stored `streamUrl`.** `publicRoutes.js:963` accepts any `streamUrl` from `/share` and stores it; `ViralSharePage` later plays/redirects it. Combined with `res.redirect(stream_url)` at `:90` and `adminRoutes.js:384`, this is an open-redirect / stored-injection path.
**M17 — `/downloads/send-direct-idm`** (`publicRoutes.js:770`) echoes an arbitrary URL into `targetUrl`/`.ef2` without any SSRF validation.
**M18 — Secret admin URL is not actually secret.** `robots.txt` avoids printing it, but `App.jsx:24`, `Frontend/.env`, the lazy chunk name `SecretAdminPortal-*.js` and the Ctrl+Shift+Alt+U handler all expose it. The honeypot routes (`/admin`, `/wp-admin`) don't cover it.
**M19 — Cookie/session hardening.** JWTs live in `sessionStorage` (readable by any XSS); `res.cookie` calls never set `secure: true` (and `sameSite` is `lax`); CSP is disabled in helmet.
**M20 — Version drift** across 7 places (see §5); `adminRoutes.js:543` still tells admins "yt-dlp + FFmpeg" even though the product's headline claim is zero yt-dlp.
**M21 — PWA service worker is a no-op** (3 lines, empty `fetch` handler); `share_target` POST/GET handling and offline caching are absent.
**M22 — Sample assets are placeholders** (762 B ZIP, 786 B ZIP, 1,346 B PDF) — fine for tests, not for a real download library.
**M23 — No repo hygiene files:** no `.gitignore`, README, LICENSE, CI, Docker, or setup guide. `node_modules/` and `dist/` appear as untracked after a normal install/build; committed binaries and `.env` files are in the single commit.
**M24 — Bundle size:** `vendor-player` (hls.js) = 594 kB minified; Vite warns. Note `@tanstack/react-query` is installed but unused.
**M25 — Rate limiter** is skipped entirely when `NODE_ENV=test` and is a generous 1200 req/min/IP; there is no separate, stricter limiter for auth, paste-capture, share or analysis (all of which trigger outbound fetches).
**M26 — Analytics integrity.** `GET /seo/landing/:slug` increments impressions+clicks for **any** slug; `trafficEngine.js` hard-codes `avgLatencyMs: 1.4` and estimates RX/TX bytes (380/240) when headers are absent; `GET /system/telemetry` and `/health` are public.
**M27 — `download_jobs` lacks a `user_id` index** while every history query filters on it; `getDatabaseDiagnostics` interpolates table names from a fixed local array (safe, but brittle).
**M28 — nginx** serves HTTP only, no TLS/HSTS/security headers, hard-coded domain, `PUBLIC_SITE_URL` in `.env` is `http://localhost:5173` → production `sitemap.xml`/`robots.txt` emit localhost URLs.
**M29 — `server.js:52`** swallows bootstrap errors instead of exiting, so a failed DB/binary init can leave a listening but broken API.
**M30 — Content/compliance:** 102 of 222 platform definitions are adult-flagged, `showAdultVaultTab` defaults to `true`, and the product downloads from third-party sites (including DRM-protected services that are explicitly blocked). There is no terms/privacy/copyright policy in the repo beyond a `LegalPage` component.

### 🔵 LOW / observation

- `trackBackendTxRxMiddleware` monkey-patches `res.write`/`res.end` on every response, including SSE — a subtle source of double-counting and stream issues.
- The 3-second MySQL reconnect poller runs forever in standby; `reconnectTimer.unref()` is used, so it doesn't keep the process alive.
- `AppContext` hard-forces light theme while `index.html` declares `data-theme="dark"`; `tailwind.config.js` defines a dark mode that can never activate.
- `Frontend/src/services/apiClient.js:83` returns `http://127.0.0.1:4000` whenever `process.versions.node` is truthy — a Node/jsdom-only hack that is fine for tests but confusing in SSR-like contexts.
- Both ZIPs and the PDF are valid; backend `unzip -t` passed; PDF header `%PDF-` confirmed.
- `Backend/.env.example` and `Frontend/.env.example` are useful, but they ship the same secrets as `.env`, so following the example reproduces the vulnerability.

---

## 8. Recommended fix plan

**P0 — do before any deployment (security + data loss)**
1. `git rm --cached Backend/.env Frontend/.env`; add `.gitignore` (`node_modules/`, `dist/`, `.env`, `storage/tmp/*`, `storage/vault/*`, `*.log`). Add `README.md` + setup guide. Rotate **all** JWT/AES/TOTP secrets, admin password and PIN; purge hardcoded fallbacks from `env.js:41-54` and the SQL dump hashes.
2. Remove `ADMIN_ALLOW_DEV_TOTP_CODE` and enforce TOTP (`cryptoVault.js:59-73`); fail startup in production if secrets are unset.
3. Remove pre-filled credentials in `PadlockAuthScreen.jsx:9-11` and admin creds from tests.
4. Protect the 5 public system endpoints (C3) with `requireSuperAdminAuth`; keep only health/bootstrap public.
5. Fix CORS (`app.js:41`) and use `req.ip` (`securityMiddleware.js:10-16`); remove `req.query.adminToken` (`securityMiddleware.js:165`) and switch SSE to cookie auth.
6. Gate the 3 download-job file routes with `requireRegisteredUser` + user-scoped lookups (C6).
7. Replace the destructive auto-import with `CREATE TABLE IF NOT EXISTS` migrations (C5 / SQL lines 14-29).

**P1 — make it run everywhere and pass CI**
8. Fix `Frontend/vite.config.js:10-11` to `../Backend` (or auto-detect), use `loadEnv()` for `VITE_BACKEND_ORIGIN`, and guard the auto-install with `fs.existsSync`.
9. Fix the standby emulator (H8) — preferably swap for a real embedded SQL store; at minimum add exact handlers for `user_id` queries and `COUNT(*) AS cnt`, make unmatched queries throw, and report `standbyMode: true` honestly.
10. Make the Vite companion plugin not spawn during `vitest`/`npm test` and always kill its child on exit (M14).
11. Introduce network mocks for the 7 live-network tests; keep an opt-in live suite (H11).
12. Align env var names (M13), version strings (M20), and add `secure: true` cookies + a basic CSP (M19).
13. Upgrade dependencies: `express`/`body-parser`, `zod` v4, replace/drop `yt-search` (or pin a patched fork), `react-router-dom` v7 (H12). Re-run both suites.

**P2 — hardening & polish**
14. Harden SSRF: normalise numeric/hex IPs, always `performDnsCheck: true` for user-supplied URLs, re-validate every redirect hop, fail closed on DNS errors, remove the DoH override for private answers (M15).
15. Validate `streamUrl` on `/share` and `/downloads/send-direct-idm`; reject non-http(s) and internal targets (M16/M17).
16. Add per-route rate limits for auth/analysis/paste/share, add a `user_id` index, implement a real service worker, split the hls.js chunk, add TLS + correct `PUBLIC_SITE_URL` in nginx/env (M21/M24/M25/M27/M28).
17. Add CI (install → lint/syntax → tests → build → audit), a LICENSE, and legal/ToS/privacy content.

---

## 9. What is genuinely good

- Clear two-package layout, ESM everywhere, consistent `{ success, data }` / `{ success, error }` envelope and `AppError`/`asyncHandler` error handling.
- Real security primitives: bcrypt (cost 12), HMAC-signed short-lived download tickets with timing-safe comparison, AES-256-GCM cookie vault, JWT scopes, TOTP plumbing, pino redaction, an explicit anti-SSRF module and an honest DRM-blocked response.
- Proper RFC-9110 206 range/resume streaming, HLS manifest rewriting, in-RAM SSE live cards with de-dup and TTL, single-flight caching, write-behind analytics batching and live TX/RX telemetry.
- Signed file downloads resolve through a fixed registry with a path-traversal assertion — no user-controlled filesystem paths.
- 222-platform data-driven registry, 16-table SQL schema with indexes, bilingual UI (EN/UR), 9-tab admin dashboard, SEO sitemap/robots/landing pages.
- Two real test suites (25 tests) that cover SSRF, ticket tampering, auth isolation, padlock lockout, file bytes and UI flow — a good base once the external-network dependency is mocked.
- Frontend production build succeeds cleanly; all 86 tracked source files parse.

---

## 10. Appendix

### 10.1 Complete API endpoint inventory

**Total: 86 HTTP routes** across 3 routers.

#### Public API — `/api/v1` — 52 routes

| Line | Method | Path | Auth | Purpose (from code comment) |
|---:|---|---|---|---|
| 134 | `GET` | `/health` | 🔓 public | 1. Live System Health Probe + Real-Time Backend TX/RX & High-Traffic Pool Telemetry |
| 156 | `GET` | `/system/telemetry` | 🔓 public |  |
| 175 | `GET` | `/system/settings` | 🔓 public | 2. Full Frontend <-> Backend Synced Engine Settings API (IDM, Speed Limiter, TeraBox, Proxy/DoH |
| 190 | `PUT` | `/system/settings` | 🔓 public |  |
| 211 | `GET` | `/system/db-diagnostics` | 🔓 public | Live MySQL Database Diagnostics & 1-Click Maintenance (Optimize Tables / Clear Cache / Clean Co |
| 227 | `POST` | `/system/db-maintenance` | 🔓 public |  |
| 263 | `POST` | `/system/cookies` | 🔓 public | Save Enrolled Course / TeraBox Netscape Cookies Encrypted in MySQL (AES-256-GCM) directly from  |
| 297 | `POST` | `/system/clear-cache` | 🔓 public |  |
| 306 | `GET` | `/config/bootstrap` | 🔓 public | 3. Unified Frontend Bootstrap Config |
| 341 | `POST` | `/auth/register` | 🔓 public | 4. Public User Registration & Login (Real Bcrypt + SQL Persistence) |
| 378 | `POST` | `/auth/login` | 🔓 public |  |
| 401 | `GET` | `/auth/me` | 🔓 public |  |
| 420 | `POST` | `/auth/logout` | 🔓 public |  |
| 426 | `GET` | `/user/favorites` | 🔓 public | 5. User Synced Favorites (Real SQL CRUD) |
| 448 | `POST` | `/user/favorites` | 🔓 public |  |
| 497 | `POST` | `/intake/paste-capture` | 🔓 public | 6. ZERO-AUTO-DB SILENT PASTE CAPTURE -> RAM ONLY + REAL BACKGROUND ENRICH! |
| 569 | `GET` | `/search` | 🔓 public | 7. Real Live Search via `yt-dlp ytsearch:` |
| 587 | `POST` | `/analysis` | 🔓 public | 8. Full Multi-Engine URL Analysis (TeraPlay Free + yt-dlp + Deep Movie/Course Sniffer) |
| 635 | `GET` | `/stream/terabox-hls` | 🔓 public | 9. Instant Online Browser Players: TeraPlay HLS + Range Proxy + Live Pipe + Subtitles |
| 651 | `GET` | `/stream/terabox-direct` | 🔓 public |  |
| 658 | `GET` | `/stream/direct-download` | 🔓 public |  |
| 665 | `GET` | `/stream/direct-download/:fileHint` | 🔓 public |  |
| 672 | `GET` | `/stream/hls-download` | 🔓 public |  |
| 681 | `GET` | `/stream/hls-download/:fileHint` | 🔓 public | instantly recognises the extension (e.g. `/stream/direct-download/Movie_720p.mp4`). |
| 688 | `GET` | `/stream/proxy` | 🔓 public |  |
| 695 | `GET` | `/stream/live-pipe` | 🔓 public |  |
| 702 | `GET` | `/stream/subtitle` | 🔓 public |  |
| 735 | `POST` | `/downloads` | 🔓 public |  |
| 736 | `POST` | `/downloads/trigger` | 🔓 public |  |
| 739 | `GET` | `/downloads` | 🔓 public | Strictly returns ONLY the logged-in user's download history (`[]` when logged out!) |
| 748 | `DELETE` | `/downloads` | 🔓 public | Clean All History (`DELETE /api/v1/downloads`) — removes ALL history rows for logged-in user! |
| 760 | `POST` | `/downloads/batch` | 🔓 public | Batch Toolbar Actions: `clean`, `delete_all`, `delete_completed` |
| 770 | `POST` | `/downloads/send-direct-idm` | 🔓 public | Instant Direct Send to Windows PC `IDMan.exe` (0 Server Wait -> Full Line Speed!) |
| 802 | `GET` | `/downloads/:id` | 🔓 public |  |
| 813 | `PATCH` | `/downloads/:id` | 🔓 public |  |
| 825 | `DELETE` | `/downloads/:id` | 🔓 public |  |
| 833 | `GET` | `/downloads/:id/file` | 🔓 public |  |
| 856 | `GET` | `/downloads/:id/idm-export` | 🔓 public | 1-Click IDM `.ef2` Export File (Internet Download Manager Native Multi-Connection Import) |
| 879 | `POST` | `/downloads/:id/open-in-idm` | 🔓 public | Direct Windows `IDMan.exe` Trigger Endpoint |
| 904 | `GET` | `/files/library` | 🔓 public | - GET  /files/library          -> authorized public file catalogue |
| 911 | `POST` | `/files/download-ticket` | 🔓 public |  |
| 934 | `HEAD` | `/files/download` | 🔓 public |  |
| 935 | `GET` | `/files/download` | 🔓 public |  |
| 936 | `HEAD` | `/files/download/:fileHint` | 🔓 public |  |
| 937 | `GET` | `/files/download/:fileHint` | 🔓 public |  |
| 941 | `GET` | `/files/:fileId/download` | 🔓 public | for plain links; the endpoint still re-validates the registry + file on disk). |
| 956 | `POST` | `/share` | 🔓 public | 11. Viral Watch-Link Sharing (/v/:shortCode) |
| 986 | `GET` | `/share/:shortCode` | 🔓 public |  |
| 1014 | `GET` | `/ads/waterfall` | 🔓 public | 12. 4-Stage Ad Waterfall Config & Hit-Tracked SEO Landing Metadata |
| 1022 | `GET` | `/seo/landing/:slug` | 🔓 public |  |
| 1057 | `POST` | `/events/track` | 🔓 public | 13. Event Tracker & Fake-404 Honeypot Trap Logger |
| 1070 | `POST` | `/security/honeypot` | 🔓 public |  |

#### Admin API — `/api/v1/admin` — 32 routes

| Line | Method | Path | Auth | Purpose (from code comment) |
|---:|---|---|---|---|
| 52 | `POST` | `/padlock/verify` | 🔓 pre-auth (gate 1/2) | ============================================================================ |
| 92 | `POST` | `/auth/login` | 🔓 pre-auth (gate 1/2) | ============================================================================ |
| 153 | `POST` | `/auth/logout` | 🔓 pre-auth (gate 1/2) |  |
| 165 | `GET` | `/live-cards/stream` | 🔒 super-admin JWT | 1. REAL-TIME UNBUFFERED SSE LIVE CARD STREAM & 3-BUTTON (`VIEW` / `SAVE` / `CLOSE`) ENGINE |
| 169 | `GET` | `/live-cards` | 🔒 super-admin JWT | 1. REAL-TIME UNBUFFERED SSE LIVE CARD STREAM & 3-BUTTON (`VIEW` / `SAVE` / `CLOSE`) ENGINE |
| 174 | `GET` | `/live-cards/:cardId/view` | 🔒 super-admin JWT | [ VIEW ] BUTTON -> Streams Live Video in Center Modal (0 SQL Rows & 0 Disk Bytes!) |
| 189 | `POST` | `/live-cards/:cardId/save` | 🔒 super-admin JWT | [ SAVE ] BUTTON -> Commits Card to Permanent SQL `saved_vault_videos` + Archives Real MP4 to Di |
| 299 | `DELETE` | `/live-cards/:cardId/close` | 🔒 super-admin JWT | [ CLOSE ] BUTTON -> Wipes Card Immediately from RAM (`0` SQL Rows, `0` Disk Bytes!) |
| 304 | `DELETE` | `/live-cards` | 🔒 super-admin JWT | [ CLOSE ] BUTTON -> Wipes Card Immediately from RAM (`0` SQL Rows, `0` Disk Bytes!) |
| 343 | `GET` | `/vault` | 🔒 super-admin JWT |  |
| 351 | `DELETE` | `/vault/:id` | 🔒 super-admin JWT |  |
| 375 | `GET` | `/vault/:id/stream` | 🔒 super-admin JWT |  |
| 390 | `GET` | `/analytics/overview` | 🔒 super-admin JWT | ============================================================================ |
| 501 | `GET` | `/traffic/sources-funnel` | 🔒 super-admin JWT |  |
| 524 | `GET` | `/ai-recommendations` | 🔒 super-admin JWT | Real System Health & Configuration Diagnostics (Zero Fake Revenue Claims!) |
| 572 | `GET` | `/seo/keywords` | 🔒 super-admin JWT | Real SQL SEO Routes & Hit Counters |
| 596 | `POST` | `/seo/keywords` | 🔒 super-admin JWT |  |
| 619 | `DELETE` | `/seo/keywords/:id` | 🔒 super-admin JWT |  |
| 629 | `GET` | `/finance` | 🔒 super-admin JWT | Real SQL Smart Financial Ledger |
| 649 | `POST` | `/finance` | 🔒 super-admin JWT |  |
| 677 | `DELETE` | `/finance/:id` | 🔒 super-admin JWT |  |
| 687 | `GET` | `/websites` | 🔒 super-admin JWT | Multi-Website Portfolio, Custom SVG Platforms, 4-Stage Ad Waterfall & AES-256 Cookies |
| 694 | `POST` | `/websites` | 🔒 super-admin JWT |  |
| 713 | `GET` | `/platforms` | 🔒 super-admin JWT |  |
| 720 | `POST` | `/platforms` | 🔒 super-admin JWT |  |
| 761 | `PUT` | `/ads/waterfall` | 🔒 super-admin JWT |  |
| 788 | `PUT` | `/settings` | 🔒 super-admin JWT |  |
| 802 | `GET` | `/cookies` | 🔒 super-admin JWT |  |
| 820 | `POST` | `/cookies` | 🔒 super-admin JWT |  |
| 859 | `DELETE` | `/cookies/:id` | 🔒 super-admin JWT |  |
| 868 | `GET` | `/audit-logs` | 🔒 super-admin JWT |  |
| 889 | `POST` | `/security/unlock-ip` | 🔒 super-admin JWT |  |

#### SEO / root — 2 routes

| Line | Method | Path | Auth | Purpose (from code comment) |
|---:|---|---|---|---|
| 10 | `GET` | `/robots.txt` | 🔓 public | Clean Google-Safe robots.txt (NEVER discloses secret admin path!) |
| 26 | `GET` | `/sitemap.xml` | 🔓 public | Dynamic XML Sitemap indexing Homepage + Supported Sites + All SQL Programmatic /tools/:slug Pag |


### 10.2 Complete tracked-file inventory

**86 tracked files.** `LOC` = newline count; binary/asset files show byte size.

#### `Backend/` — 5 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `.env` | 30 lines | 1,229 B |
| `.env.example` | 26 lines | 943 B |
| `ecosystem.config.cjs` | 17 lines | 401 B |
| `package-lock.json` | 3,875 lines | 137,286 B |
| `package.json` | 34 lines | 871 B |

#### `Backend/database/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `ultradownloader_xampp.sql` | 586 lines | 99,133 B |

#### `Backend/nginx/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `ultradownloader.conf` | 49 lines | 1,551 B |

#### `Backend/src/` — 2 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `app.js` | 94 lines | 2,816 B |
| `server.js` | 54 lines | 1,698 B |

#### `Backend/src/config/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `env.js` | 65 lines | 2,498 B |

#### `Backend/src/data/` — 2 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `downloadLibrary.js` | 122 lines | 3,486 B |
| `platformDefinitions.js` | 358 lines | 31,409 B |

#### `Backend/src/db/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `database.js` | 803 lines | 31,736 B |

#### `Backend/src/middleware/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `securityMiddleware.js` | 184 lines | 6,151 B |

#### `Backend/src/routes/` — 3 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `adminRoutes.js` | 896 lines | 30,442 B |
| `publicRoutes.js` | 1,082 lines | 35,574 B |
| `seoSitemapRoutes.js` | 63 lines | 1,917 B |

#### `Backend/src/security/` — 2 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `antiSsrfGuard.js` | 194 lines | 6,439 B |
| `cryptoVault.js` | 130 lines | 4,142 B |

#### `Backend/src/services/` — 10 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `deepPageSniffer.js` | 232 lines | 9,089 B |
| `downloadJobManager.js` | 500 lines | 17,800 B |
| `extendedEmbedExtractors.js` | 346 lines | 12,114 B |
| `extractorEngine.js` | 1,648 lines | 60,849 B |
| `fileDownloadService.js` | 364 lines | 12,299 B |
| `idmTurboDownloader.js` | 419 lines | 14,385 B |
| `liveCardBus.js` | 159 lines | 4,590 B |
| `streamProxyService.js` | 344 lines | 12,693 B |
| `teraboxEngine.js` | 803 lines | 28,323 B |
| `trafficEngine.js` | 336 lines | 11,353 B |

#### `Backend/src/utils/` — 2 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `errors.js` | 34 lines | 825 B |
| `logger.js` | 19 lines | 436 B |

#### `Backend/storage/files/` — 3 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `UltraDownloader_Pro_Pack.zip` | 786 B (binary) | 786 B |
| `UltraDownloader_Sample_Guide.pdf` | 42 lines | 1,346 B |
| `UltraDownloader_Sample_Pack.zip` | 762 B (binary) | 762 B |

#### `Backend/storage/tmp/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `.gitkeep` | 0 lines | 0 B |

#### `Backend/storage/vault/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `.gitkeep` | 0 lines | 0 B |

#### `Backend/test/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `backend.test.js` | 558 lines | 23,277 B |

#### `Frontend/` — 8 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `.env` | 4 lines | 147 B |
| `.env.example` | 5 lines | 213 B |
| `index.html` | 19 lines | 797 B |
| `package-lock.json` | 5,604 lines | 188,509 B |
| `package.json` | 33 lines | 852 B |
| `postcss.config.js` | 6 lines | 81 B |
| `tailwind.config.js` | 27 lines | 825 B |
| `vite.config.js` | 178 lines | 5,174 B |

#### `Frontend/public/` — 3 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `favicon.svg` | 11 lines | 616 B |
| `manifest.webmanifest` | 26 lines | 649 B |
| `sw.js` | 3 lines | 187 B |

#### `Frontend/src/` — 2 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `App.jsx` | 96 lines | 3,798 B |
| `main.jsx` | 19 lines | 560 B |

#### `Frontend/src/components/admin/` — 7 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `FinanceLedgerTab.jsx` | 224 lines | 9,552 B |
| `LiveNotificationDrawer.jsx` | 156 lines | 6,831 B |
| `OperationsTab.jsx` | 563 lines | 22,961 B |
| `PadlockAuthScreen.jsx` | 223 lines | 9,287 B |
| `ProfitDashboardTab.jsx` | 388 lines | 17,111 B |
| `SavedVaultTab.jsx` | 171 lines | 8,065 B |
| `SeoManagerTab.jsx` | 176 lines | 7,694 B |

#### `Frontend/src/components/downloader/` — 4 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `DownloadQueueDrawer.jsx` | 577 lines | 24,676 B |
| `HeroSmartAnalyzer.jsx` | 816 lines | 36,021 B |
| `LandingSections.jsx` | 300 lines | 12,560 B |
| `SupportedSitesSection.jsx` | 247 lines | 11,732 B |

#### `Frontend/src/components/icons/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `PlatformIcon.jsx` | 152 lines | 6,417 B |

#### `Frontend/src/components/layout/` — 4 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `AnnouncementBar.jsx` | 45 lines | 2,246 B |
| `AppSidebar.jsx` | 92 lines | 3,274 B |
| `Footer.jsx` | 81 lines | 4,661 B |
| `Navbar.jsx` | 493 lines | 19,848 B |

#### `Frontend/src/components/monetization/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `AdWaterfallManager.jsx` | 76 lines | 3,035 B |

#### `Frontend/src/components/player/` — 2 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `CenterTheaterModal.jsx` | 109 lines | 4,585 B |
| `OnlineVideoPlayer.jsx` | 132 lines | 4,203 B |

#### `Frontend/src/components/ui/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `Primitives.jsx` | 145 lines | 5,445 B |

#### `Frontend/src/context/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `AppContext.jsx` | 512 lines | 17,737 B |

#### `Frontend/src/data/` — 1 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `platformRegistry.js` | 52 lines | 1,551 B |

#### `Frontend/src/pages/` — 6 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `HomePage.jsx` | 55 lines | 2,152 B |
| `HoneypotNotFoundPage.jsx` | 39 lines | 1,574 B |
| `SecretAdminPortal.jsx` | 492 lines | 19,831 B |
| `SeoToolLandingPage.jsx` | 91 lines | 3,276 B |
| `SubPages.jsx` | 1,188 lines | 52,924 B |
| `ViralSharePage.jsx` | 113 lines | 5,056 B |

#### `Frontend/src/services/` — 3 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `apiClient.js` | 565 lines | 15,398 B |
| `fileDownload.js` | 182 lines | 6,350 B |
| `instantDownload.js` | 214 lines | 7,841 B |

#### `Frontend/src/styles/` — 3 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `animations.css` | 16 lines | 249 B |
| `globals.css` | 40 lines | 655 B |
| `tokens.css` | 12 lines | 267 B |

#### `Frontend/src/test/` — 2 files

| File | LOC / bytes | Size |
|---|---:|---:|
| `frontend.test.jsx` | 356 lines | 14,920 B |
| `setupTests.js` | 17 lines | 426 B |

**Totals:** 86 files (84 text, 2 binary archive assets), 29,607 newline-delimited lines (`wc -l` reports 29,616), 1,183,468 bytes.


### Reproduction commands

```bash
# Backend
cd Backend && npm ci && npm test && npm audit --omit=dev
node --check src/server.js && node src/server.js      # binds :4000, standby DB if no MySQL

# Frontend
cd Frontend && npm ci && npm run build && npm test
npm run dev                                            # fails on Linux (H7)

# Schema
mysql -u root < Backend/database/ultradownloader_xampp.sql

# Quick checks used in this audit
git ls-files | wc -l                 # 86
git status --short                  # clean (source)
node --input-type=module -e "import('./Backend/src/data/platformDefinitions.js').then(m=>console.log(m.PLATFORM_DEFINITIONS.length))"   # 222
```
