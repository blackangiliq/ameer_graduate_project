// Small cryptography helpers built on Node's crypto module.
const crypto = require('node:crypto');
const config = require('../config');

// SHA-256 is used for values that are already random and long
// (refresh tokens, recovery codes) – they do not need a slow hash like bcrypt.
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

// Constant-time comparison: prevents timing attacks on secret comparison.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// AES-256-GCM: authenticated encryption for the TOTP secret stored in the DB.
// If the database file leaks, the MFA secrets are useless without the key.
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.mfa.encryptionKey, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString('base64')).join('.');
}

function decrypt(payload) {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', config.mfa.encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { sha256, randomToken, safeEqual, encrypt, decrypt };
