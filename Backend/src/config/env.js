import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticator } from 'otplib';

const __filename = fileURLToPath(import.meta.url);
export const BACKEND_ROOT = path.resolve(path.dirname(__filename), '../..');

// dotenv never overrides variables already present in the real environment,
// so a secret manager / CI variable always wins over the local .env file.
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

/**
 * Production refuses to boot without explicitly configured secrets.
 * Development and tests get a random, per-process value instead of a
 * hard-coded default that could be shipped in a public repository.
 */
function resolveSecret(name) {
  const supplied = String(process.env[name] || '').trim();
  if (supplied) return supplied;
  if (isProduction) {
    throw new Error(
      `${name} must be set in production. Copy Backend/.env.example to Backend/.env ` +
        `and replace every CHANGE_ME value (or inject it from a secret manager).`
    );
  }
  return crypto.randomBytes(32).toString('hex');
}

function resolveAdminPin() {
  const supplied = String(process.env.ADMIN_PIN || '').trim();
  if (supplied) return supplied;
  if (isProduction) throw new Error('ADMIN_PIN must be set in production.');
  return String(crypto.randomInt(1000, 10000));
}

function resolveTotpSecret() {
  const supplied = String(process.env.ADMIN_TOTP_SECRET || '').trim();
  if (supplied) return supplied;
  if (isProduction) throw new Error('ADMIN_TOTP_SECRET must be set in production.');
  return authenticator.generateSecret();
}

const rawOrigins = process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';

export const ENV = {
  NODE_ENV,
  isProduction,
  PORT: Number(process.env.PORT || 4000),
  HOST: process.env.HOST || '0.0.0.0',
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || 'http://localhost:5173',
  CORS_ORIGINS: rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Only trust a proxy when the operator explicitly configures the hop count.
  // Default 0 means req.ip is the real socket address and X-Forwarded-For is ignored.
  TRUST_PROXY_HOPS: Number(process.env.TRUST_PROXY_HOPS || 0),
  ALLOW_PREVIEW_ORIGINS: !isProduction,

  // XAMPP MySQL connection (default XAMPP: 127.0.0.1:3306, root, empty password)
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: Number(process.env.DB_PORT || 3306),
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_NAME: process.env.DB_NAME || 'ultradownloader_db',

  // Never auto-import a dump against an existing database.
  AUTO_IMPORT_SQL: process.env.AUTO_IMPORT_SQL === '1',

  VAULT_STORAGE_DIR: path.resolve(
    BACKEND_ROOT,
    process.env.VAULT_STORAGE_DIR || './storage/vault'
  ),
  TEMP_EPHEMERAL_DIR: path.resolve(
    BACKEND_ROOT,
    process.env.TEMP_EPHEMERAL_DIR || './storage/tmp'
  ),

  EXTRACTOR_TIMEOUT_MS: Number(process.env.EXTRACTOR_TIMEOUT_MS || 25000),

  // All signing/encryption material and admin credentials come from the environment.
  JWT_ADMIN_SECRET: resolveSecret('JWT_ADMIN_SECRET'),
  JWT_USER_SECRET: resolveSecret('JWT_USER_SECRET'),
  PADLOCK_TICKET_SECRET: resolveSecret('PADLOCK_TICKET_SECRET'),
  AES_256_VAULT_KEY: resolveSecret('AES_256_VAULT_KEY'),
  ADMIN_EMAIL: String(process.env.ADMIN_EMAIL || 'admin@ultradownloader.pro')
    .trim()
    .toLowerCase(),
  ADMIN_PASSWORD: resolveSecret('ADMIN_PASSWORD'),
  ADMIN_PIN: resolveAdminPin(),
  ADMIN_TOTP_SECRET: resolveTotpSecret(),

  ADMIN_IP_ALLOWLIST: (process.env.ADMIN_IP_ALLOWLIST || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
  ADMIN_MAX_FAILED_ATTEMPTS: Number(process.env.ADMIN_MAX_FAILED_ATTEMPTS || 3),
  ADMIN_BAN_DURATION_MINUTES: Number(process.env.ADMIN_BAN_DURATION_MINUTES || 30),

  GUEST_DAILY_DOWNLOAD_LIMIT: Number(process.env.GUEST_DAILY_DOWNLOAD_LIMIT || 50),
  USER_DAILY_DOWNLOAD_LIMIT: Number(process.env.USER_DAILY_DOWNLOAD_LIMIT || 500),

  // Offline deterministic test fixtures. Never enabled in production.
  FIXTURE_MODE: !isProduction && process.env.ULTRA_FIXTURES === '1',
};

// In dev/test the generated one-off credentials are printed once so a local
// operator can still log in. Nothing predictable is ever compiled into the app.
if (!isProduction && !process.env.ULTRA_FIXTURES) {
  // eslint-disable-next-line no-console
  console.info(
    `[UltraDownloader] Dev-only admin credentials (rotate via .env for deployment): ` +
      `email=${ENV.ADMIN_EMAIL} password=${ENV.ADMIN_PASSWORD} pin=${ENV.ADMIN_PIN} ` +
      `totpSecret=${ENV.ADMIN_TOTP_SECRET}`
  );
}
