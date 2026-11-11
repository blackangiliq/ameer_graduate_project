// Central configuration. Every security-related number lives here so it can
// be explained (and changed) in one place.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Load .env if present (built into Node, no dotenv package needed).
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* .env is optional */ }

// Secrets are never hard-coded. If they are not supplied through the
// environment, they are generated once and kept in data/secrets.json
// (which is git-ignored).
function loadSecrets() {
  const file = path.join(DATA_DIR, 'secrets.json');
  let stored = {};
  if (fs.existsSync(file)) stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  const secrets = {
    jwtSecret: process.env.JWT_SECRET || stored.jwtSecret || crypto.randomBytes(48).toString('hex'),
    mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY || stored.mfaEncryptionKey || crypto.randomBytes(32).toString('hex'),
  };
  if (JSON.stringify(secrets) !== JSON.stringify(stored)) {
    fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  }
  return secrets;
}

const secrets = loadSecrets();
const int = (name, fallback) => Number.parseInt(process.env[name] ?? fallback, 10);

module.exports = {
  root: ROOT,
  dataDir: DATA_DIR,
  dbFile: process.env.DB_FILE || path.join(DATA_DIR, 'iam.db'),
  port: int('PORT', 3000),
  isProduction: process.env.NODE_ENV === 'production',
  appName: 'IAM Gateway',
  organization: 'شركة الرافدين للحلول التقنية',

  jwt: {
    secret: secrets.jwtSecret,
    issuer: 'iam-gateway',
    accessTtlSeconds: int('ACCESS_TOKEN_TTL', 15 * 60),        // 15 minutes
    mfaChallengeTtlSeconds: 5 * 60,                            // 5 minutes to enter the code
  },
  session: {
    refreshTtlSeconds: int('REFRESH_TOKEN_TTL', 7 * 24 * 3600), // 7 days
  },
  password: {
    bcryptCost: int('BCRYPT_COST', 12),
    minLength: 10,
    historySize: 5,          // cannot reuse the last 5 passwords
    maxAgeDays: 90,          // informational: shown in the profile
  },
  lockout: {
    maxFailedAttempts: 5,
    lockMinutes: 15,
  },
  mfa: {
    encryptionKey: Buffer.from(secrets.mfaEncryptionKey, 'hex'),
    issuer: 'IAM Gateway',
    digits: 6,
    periodSeconds: 30,
    window: 1,               // accept the previous/next 30s step (clock drift)
    recoveryCodes: 8,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    authMax: int('AUTH_RATE_LIMIT', 30),   // login/register attempts per IP per window
    apiMax: int('API_RATE_LIMIT', 600),
  },
};
