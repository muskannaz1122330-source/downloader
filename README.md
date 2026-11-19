# UltraDownloader

Pure-Node.js (zero `yt-dlp` / zero FFmpeg binary) media URL analyser, HTTP 206 range
streamer and download manager, with an Express API (`Backend/`) and a React + Vite
frontend (`Frontend/`). Version 10.0.0.

---

## Quick start

Requirements: Node.js 20+ (tested on 22), npm. Optional: XAMPP/MySQL 8 — the app
runs in an in-memory standby mode when MySQL is unavailable.

```bash
# Backend
cd Backend
cp .env.example .env          # replace EVERY CHANGE_ME value
npm ci
npm start                     # http://127.0.0.1:4000

# Frontend (separate terminal)
cd Frontend
cp .env.example .env
npm ci
npm run dev                   # http://localhost:5173 (proxies /api to :4000)
```

`npm run dev` in `Frontend/` auto-installs and starts the Backend companion if it
is not already listening on port 4000. The path is resolved case-sensitively, so
this works on Linux/macOS as well as Windows.

### Production secrets (required)

`Backend/src/config/env.js` **refuses to boot** in `NODE_ENV=production` unless
`JWT_ADMIN_SECRET`, `JWT_USER_SECRET`, `PADLOCK_TICKET_SECRET`,
`AES_256_VAULT_KEY`, `ADMIN_TOTP_SECRET`, `ADMIN_PASSWORD` and `ADMIN_PIN` are
set. No secret or admin credential is compiled into the source. `.env` files are
gitignored; only `.env.example` (placeholders) is tracked.

Generate values with `openssl rand -hex 32` (use 64 hex characters for the AES
key). Admin 2FA is **mandatory in every environment** — there is no dev bypass
and no fixed code. In development, random one-off credentials are generated per
process and printed once to the console.

### Database

MySQL is optional. On a fresh database, either import
`Backend/database/ultradownloader_xampp.sql` manually (the dump is now
non-destructive: no `DROP TABLE`, `CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`)
or set `AUTO_IMPORT_SQL=1` to apply `Backend/database/schema.sql`. The automatic
import never drops tables and never overwrites an existing admin password.
`GET /api/v1/system/db-diagnostics` (admin only) reports `standbyMode` and
`mysqlConnected` honestly.

---

## Tests & build

```bash
cd Backend  && npm ci && npm test        # 24 passed (15 integration + 9 security regressions)
cd Frontend && npm ci && npm test        # 10/10, starts a fixture-mode API
cd Frontend && npm run build             # production bundle
```

Both suites are **deterministic and offline by default**: `ULTRA_FIXTURES=1`
serves in-memory MP4/MPEG-TS byte ranges and canned extraction metadata, so no
YouTube/TeraBox/Vimeo/MDN/yt-search network call is needed. The real extractors
are unchanged and can be exercised manually with `LIVE=1 npm run test:live`
(`Backend/test/live.smoke.test.js`). Fixture routes are mounted only when
`ULTRA_FIXTURES=1` and are unreachable in production.

The frontend test runner (`Frontend/scripts/run-tests.mjs`) owns the companion
API process lifecycle, so `npm test` exits cleanly with no orphan on port 4000.

CI runs on every push/PR: `.github/workflows/ci.yml` installs both packages,
runs syntax checks, both test suites, the production build and `npm audit`.

---

## Security fixes applied (see `PROJECT_AUDIT.md`)

- Removed committed `.env` secrets, hardcoded JWT/AES/TOTP fallbacks and
  pre-filled admin credentials; production fails closed on missing secrets.
- Mandatory RFC-6238 TOTP; no `ADMIN_ALLOW_DEV_TOTP_CODE` bypass.
- Strict CORS allow-list (unknown origins rejected), `req.ip` with a
  configurable trusted-proxy hop count (default 0), no JWT in query strings —
  SSE now uses the httpOnly `ud_admin_jwt` cookie.
- Five `/system/*` control endpoints require `requireSuperAdminAuth`; three
  `/downloads/:id/*` routes require a registered user and use user-scoped SQL.
- Anti-SSRF hardening: obfuscated IPv4 literals rejected, DNS failures fail
  closed, no DoH override of private DNS answers, final redirect hop
  revalidated, stored `streamUrl` / IDM targets validated.
- Idempotent SQL migrations; honest standby DB status; strict user-scoped
  standby queries; `secure` cookies in production.
- Dependency advisories resolved: `yt-search` (ReDoS chain) replaced by the
  already-installed `youtubei.js`, `zod` 4, `express`/`body-parser`,
  `react-router-dom` 7. `npm audit --omit=dev` reports **0 vulnerabilities** in
  both packages.

---

## Honest note about "supported sources"

`Backend/src/data/platformDefinitions.js` is a **catalogue of 222 platform
entries** used for the UI, SEO and URL classification. A catalogue entry is not
a verified working extractor. Dedicated extractors exist for a subset
(YouTube/InnerTube, TeraBox mirrors, Dailymotion, Vimeo, PeerTube, SoundCloud,
direct MP4/HLS files, plus a universal deep-page sniffer for embedded media).
Everything else falls back to that generic sniffer.

DRM-protected services (Netflix, Disney+, Prime Video, …) return an explicit
`422 DRM_PROTECTED` and are never bypassed. Login-gated, geo-blocked and
anti-bot sites may fail with a clear error. `GET /api/v1/admin/sources-health`
(admin only) reports real per-platform attempt counts, success rate, p95 latency
and last verification timestamp — unverified sources are labelled
`unverified`, never claimed as working.

Only download content you are legally entitled to download, and respect each
site's Terms of Service and robots.txt.

---

## Deployment

`Backend/nginx/ultradownloader.conf` proxies the SPA and `/api` (including SSE).
Configure TLS and set `PUBLIC_SITE_URL` to your real HTTPS origin so
`sitemap.xml` / `robots.txt` do not emit localhost URLs. `Backend/ecosystem.config.cjs`
starts the API under PM2; inject secrets from the environment, not from a
committed file.

## License

MIT — see [LICENSE](LICENSE). Sample files in `Backend/storage/files/` are
placeholders for the download-ticket tests.
