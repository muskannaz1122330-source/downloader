// Runs before any test module imports src/config/env.js.
// Deterministic secrets + an explicit one-hop trusted proxy so the
// 3-strike IP-lockout test can simulate distinct client IPs via XFF.
process.env.NODE_ENV = 'test';
// Opt-in LIVE=1 disables fixtures so the smoke suite hits real extractors.
process.env.ULTRA_FIXTURES = process.env.LIVE === '1' ? '' : '1';
process.env.TRUST_PROXY_HOPS = process.env.TRUST_PROXY_HOPS || '1';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ultradownloader.pro';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'FixtureOnly_Admin!2026';
process.env.ADMIN_PIN = process.env.ADMIN_PIN || '2580';
process.env.ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET || 'JBSWY3DPEHPK3PXP';
process.env.JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || 'fixture-only-admin-jwt-secret-0123456789';
process.env.JWT_USER_SECRET = process.env.JWT_USER_SECRET || 'fixture-only-user-jwt-secret-0123456789';
process.env.PADLOCK_TICKET_SECRET = process.env.PADLOCK_TICKET_SECRET || 'fixture-only-padlock-secret-0123456789';
process.env.AES_256_VAULT_KEY = process.env.AES_256_VAULT_KEY || ('ab'.repeat(32));
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
