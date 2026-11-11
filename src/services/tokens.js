// Session & token management.
//
//  - Access token:  short-lived JWT (15 min) sent as "Authorization: Bearer ...".
//                   Kept in browser memory only (not localStorage) -> safer against XSS.
//  - Refresh token: long-lived random value (7 days) in an HttpOnly, SameSite=Strict
//                   cookie. Only its SHA-256 hash is stored in the "sessions" table.
//  - Rotation:      every refresh issues a NEW refresh token and invalidates the old one.
//                   If an old (already rotated) token is presented again, it means it was
//                   stolen -> the whole session is revoked (reuse detection).
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/database');
const { sha256, randomToken, safeEqual } = require('./crypto');

const REFRESH_COOKIE = 'iam_refresh';

const isoIn = (seconds) => new Date(Date.now() + seconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function signAccessToken(user, sessionId) {
  return jwt.sign(
    { sub: String(user.id), username: user.username, sid: sessionId, typ: 'access' },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: config.jwt.accessTtlSeconds, issuer: config.jwt.issuer },
  );
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'], issuer: config.jwt.issuer });
  if (payload.typ !== 'access') throw new Error('Wrong token type');
  return payload;
}

// Step-1 token after a correct password when MFA is on. It only allows calling /mfa/verify.
function signMfaChallenge(user) {
  return jwt.sign(
    { sub: String(user.id), typ: 'mfa_challenge' },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: config.jwt.mfaChallengeTtlSeconds, issuer: config.jwt.issuer },
  );
}

function verifyMfaChallenge(token) {
  const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'], issuer: config.jwt.issuer });
  if (payload.typ !== 'mfa_challenge') throw new Error('Wrong token type');
  return payload;
}

function createSession(user, req, { mfaVerified = false } = {}) {
  const id = crypto.randomUUID();
  const secret = randomToken(32);
  db.run(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, ip_address, user_agent, mfa_verified, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, user.id, sha256(secret),
    (req.ip || '').replace(/^::ffff:/, ''), req.get('user-agent')?.slice(0, 255) ?? null,
    mfaVerified ? 1 : 0, isoIn(config.session.refreshTtlSeconds),
  );
  return { sessionId: id, refreshToken: `${id}.${secret}`, accessToken: signAccessToken(user, id) };
}

/**
 * Validates and rotates a refresh token.
 * Returns { session, refreshToken } or { error: 'invalid' | 'expired' | 'revoked' | 'reuse' }.
 */
function rotateRefreshToken(raw) {
  const [id, secret] = String(raw || '').split('.');
  if (!id || !secret) return { error: 'invalid' };
  const session = db.get('SELECT * FROM sessions WHERE id = ?', id);
  if (!session) return { error: 'invalid' };
  if (session.revoked_at) return { error: 'revoked', session };
  if (session.expires_at < nowSql()) return { error: 'expired', session };
  if (!safeEqual(session.refresh_token_hash, sha256(secret))) {
    // Valid session id but an old token -> token theft. Kill the session.
    revokeSession(session.id, 'refresh_token_reuse');
    return { error: 'reuse', session };
  }
  const next = randomToken(32);
  db.run('UPDATE sessions SET refresh_token_hash = ?, last_used_at = ? WHERE id = ?', sha256(next), nowSql(), id);
  return { session, refreshToken: `${id}.${next}` };
}

function getActiveSession(id) {
  return db.get(
    'SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?', id, nowSql(),
  );
}

function revokeSession(id, reason) {
  return db.run(
    'UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL',
    nowSql(), reason, id,
  ).changes;
}

function revokeAllForUser(userId, reason, exceptSessionId = null) {
  return db.run(
    'UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE user_id = ? AND revoked_at IS NULL AND id IS NOT ?',
    nowSql(), reason, userId, exceptSessionId,
  ).changes;
}

function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,                  // JavaScript cannot read it (XSS protection)
    secure: config.isProduction,     // HTTPS only in production
    sameSite: 'strict',              // not sent on cross-site requests (CSRF protection)
    path: '/api/auth',               // only sent to the auth endpoints
    maxAge: config.session.refreshTtlSeconds * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth', httpOnly: true, sameSite: 'strict', secure: config.isProduction });
}

module.exports = {
  REFRESH_COOKIE, nowSql, isoIn,
  signAccessToken, verifyAccessToken, signMfaChallenge, verifyMfaChallenge,
  createSession, rotateRefreshToken, getActiveSession, revokeSession, revokeAllForUser,
  setRefreshCookie, clearRefreshCookie,
};
