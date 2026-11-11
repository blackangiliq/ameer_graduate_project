// Time-based One-Time Password (TOTP) – RFC 6238, implemented from scratch
// so every step can be explained during the defence:
//   1. counter = floor(unix_time / 30)
//   2. hmac    = HMAC-SHA1(secret, counter as 8-byte big-endian)
//   3. dynamic truncation (RFC 4226 §5.3) -> 31-bit integer
//   4. code    = integer mod 10^6, left-padded to 6 digits
// Compatible with Google Authenticator, Microsoft Authenticator, Authy...
const crypto = require('node:crypto');
const config = require('../config');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = str.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const generateSecret = () => base32Encode(crypto.randomBytes(20)); // 160-bit secret

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16)
    | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** config.mfa.digits).padStart(config.mfa.digits, '0');
}

function generate(secret, time = Date.now()) {
  return hotp(secret, Math.floor(time / 1000 / config.mfa.periodSeconds));
}

// Accepts codes from the previous / current / next time step (±30s drift).
function verify(secret, code, time = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ''))) return false;
  const counter = Math.floor(time / 1000 / config.mfa.periodSeconds);
  for (let w = -config.mfa.window; w <= config.mfa.window; w++) {
    const expected = hotp(secret, counter + w);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)))) return true;
  }
  return false;
}

function otpauthUrl(secret, account) {
  const issuer = encodeURIComponent(config.mfa.issuer);
  return `otpauth://totp/${issuer}:${encodeURIComponent(account)}?secret=${secret}`
    + `&issuer=${issuer}&algorithm=SHA1&digits=${config.mfa.digits}&period=${config.mfa.periodSeconds}`;
}

module.exports = { generateSecret, generate, verify, otpauthUrl, base32Encode, base32Decode, hotp };
