// Authentication endpoints: register, login, MFA, refresh, logout, me, change password.
const express = require('express');
const db = require('../db/database');
const config = require('../config');
const password = require('../services/password');
const tokens = require('../services/tokens');
const totp = require('../services/totp');
const audit = require('../services/audit');
const { sha256, decrypt } = require('../services/crypto');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const GENERIC_LOGIN_ERROR = 'اسم المستخدم أو كلمة المرور غير صحيحة';

const USERNAME_RE = /^[a-z][a-z0-9._-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    jobTitle: user.job_title ?? null,
    department: user.department ?? null,
    status: user.status,
    mfaEnabled: !!user.mfa_enabled,
    mustChangePassword: !!user.must_change_password,
    lastLoginAt: user.last_login_at ?? null,
    passwordChangedAt: user.password_changed_at ?? null,
  };
}

function completeLogin(req, res, user, { mfaVerified }) {
  db.run(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?',
    tokens.nowSql(), user.id,
  );
  const session = tokens.createSession(user, req, { mfaVerified });
  tokens.setRefreshCookie(res, session.refreshToken);
  audit.log(req, {
    action: 'auth.login', actor: user, targetType: 'session', targetId: session.sessionId,
    details: { mfa: mfaVerified },
  });
  res.json({
    accessToken: session.accessToken,
    expiresIn: config.jwt.accessTtlSeconds,
    user: publicUser(user),
    mustChangePassword: !!user.must_change_password,
  });
}

// ---------- Self registration (account starts as "pending" until an admin approves) ----------
router.post('/register', async (req, res) => {
  const { username, email, fullName, password: plain, departmentId } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  const mail = String(email || '').trim().toLowerCase();
  const name = String(fullName || '').trim();

  const errors = [];
  if (!USERNAME_RE.test(uname)) errors.push('اسم المستخدم: 3-32 حرفاً إنجليزياً صغيراً أو أرقام أو . _ - ويبدأ بحرف');
  if (!EMAIL_RE.test(mail)) errors.push('البريد الإلكتروني غير صالح');
  if (name.length < 3 || name.length > 80) errors.push('الاسم الكامل مطلوب (3-80 حرفاً)');
  errors.push(...password.validatePolicy(plain, { username: uname, email: mail }));
  if (errors.length) return res.status(400).json({ error: 'بيانات غير صالحة', details: errors });

  if (db.get('SELECT 1 FROM users WHERE username = ? OR email = ?', uname, mail)) {
    return res.status(409).json({ error: 'اسم المستخدم أو البريد الإلكتروني مستخدم مسبقاً' });
  }

  const dept = departmentId ? db.get('SELECT id FROM departments WHERE id = ?', Number(departmentId)) : null;
  const hashed = await password.hash(plain);
  const employeeRole = db.get("SELECT id FROM roles WHERE name = 'employee'");

  const userId = db.transaction(() => {
    const { lastInsertRowid } = db.run(
      `INSERT INTO users (username, email, full_name, department_id, password_hash, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      uname, mail, name, dept?.id ?? null, hashed,
    );
    password.addToHistory(lastInsertRowid, hashed);
    // Least privilege: a new account only gets the basic "employee" role.
    db.run('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', lastInsertRowid, employeeRole.id);
    return Number(lastInsertRowid);
  });

  audit.log(req, {
    action: 'user.register', actor: { id: userId, username: uname }, targetType: 'user', targetId: userId,
  });
  res.status(201).json({ message: 'تم إنشاء الحساب بنجاح وهو بانتظار موافقة مدير الهويات' });
});

// ---------- Login (step 1: something you know) ----------
router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const plain = String(req.body?.password || '');
  if (!username || !plain) return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });

  const user = db.get(
    `SELECT u.*, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.username = ? OR u.email = ?`, username, username,
  );

  if (!user) {
    await password.dummyCompare(plain); // same timing as a real check
    audit.log(req, { action: 'auth.login', status: 'failure', actor: { id: null, username }, details: { reason: 'unknown_user' } });
    return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
  }

  // Lockout check happens BEFORE the password is checked.
  if (user.locked_until && user.locked_until > tokens.nowSql()) {
    audit.log(req, { action: 'auth.login', status: 'denied', actor: user, details: { reason: 'account_locked' } });
    return res.status(423).json({
      error: 'الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة متكررة. حاول لاحقاً أو تواصل مع الدعم الفني',
      lockedUntil: user.locked_until,
    });
  }

  const ok = await password.compare(plain, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= config.lockout.maxFailedAttempts;
    db.run(
      'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
      lock ? 0 : attempts, lock ? tokens.isoIn(config.lockout.lockMinutes * 60) : null, user.id,
    );
    audit.log(req, {
      action: lock ? 'auth.account_locked' : 'auth.login', status: 'failure', actor: user,
      details: { reason: 'bad_password', attempt: attempts },
    });
    return res.status(401).json({
      error: GENERIC_LOGIN_ERROR,
      remainingAttempts: lock ? 0 : config.lockout.maxFailedAttempts - attempts,
    });
  }

  // Correct password, but the lifecycle state may still block access.
  if (user.status !== 'active') {
    const messages = {
      pending: 'حسابك بانتظار موافقة مدير الهويات',
      suspended: 'الحساب معلّق. تواصل مع مدير النظام',
      disabled: 'الحساب معطّل',
    };
    audit.log(req, { action: 'auth.login', status: 'denied', actor: user, details: { reason: `status_${user.status}` } });
    return res.status(403).json({ error: messages[user.status], code: `ACCOUNT_${user.status.toUpperCase()}` });
  }

  if (user.mfa_enabled) {
    // Do not create a session yet: the user must prove the second factor.
    db.run('UPDATE users SET failed_attempts = 0 WHERE id = ?', user.id);
    audit.log(req, { action: 'auth.mfa.challenge', actor: user });
    return res.json({ mfaRequired: true, challengeToken: tokens.signMfaChallenge(user) });
  }

  completeLogin(req, res, user, { mfaVerified: false });
});

// ---------- Login (step 2: something you have) ----------
router.post('/mfa/verify', (req, res) => {
  const { challengeToken, code, recoveryCode } = req.body || {};
  let payload;
  try {
    payload = tokens.verifyMfaChallenge(challengeToken);
  } catch {
    return res.status(401).json({ error: 'انتهت مهلة التحقق، سجّل الدخول من جديد', code: 'CHALLENGE_EXPIRED' });
  }

  const user = db.get(
    `SELECT u.*, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`,
    Number(payload.sub),
  );
  if (!user || user.status !== 'active' || !user.mfa_enabled) return res.status(401).json({ error: 'طلب غير صالح' });
  if (user.locked_until && user.locked_until > tokens.nowSql()) return res.status(423).json({ error: 'الحساب مقفل مؤقتاً' });

  let valid = false;
  let method = 'totp';
  if (recoveryCode) {
    method = 'recovery_code';
    const normalized = String(recoveryCode).trim().toUpperCase();
    const row = db.get(
      'SELECT id FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
      user.id, sha256(normalized),
    );
    if (row) {
      db.run('UPDATE mfa_recovery_codes SET used_at = ? WHERE id = ?', tokens.nowSql(), row.id); // single use
      valid = true;
    }
  } else {
    valid = totp.verify(decrypt(user.mfa_secret_enc), code);
  }

  if (!valid) {
    // Wrong codes also count towards lockout (stops brute-forcing the 6 digits).
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= config.lockout.maxFailedAttempts;
    db.run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
      lock ? 0 : attempts, lock ? tokens.isoIn(config.lockout.lockMinutes * 60) : null, user.id);
    audit.log(req, { action: 'auth.mfa.verify', status: 'failure', actor: user, details: { method, attempt: attempts } });
    return res.status(401).json({ error: 'رمز التحقق غير صحيح' });
  }

  audit.log(req, { action: 'auth.mfa.verify', actor: user, details: { method } });
  completeLogin(req, res, user, { mfaVerified: true });
});

// ---------- Refresh: rotate refresh token, issue new access token ----------
router.post('/refresh', (req, res) => {
  const raw = req.cookies?.[tokens.REFRESH_COOKIE];
  if (!raw) return res.status(401).json({ error: 'لا توجد جلسة', code: 'NO_SESSION' });

  const result = tokens.rotateRefreshToken(raw);
  if (result.error) {
    tokens.clearRefreshCookie(res);
    if (result.error === 'reuse') {
      const owner = db.get('SELECT id, username FROM users WHERE id = ?', result.session.user_id);
      audit.log(req, {
        action: 'auth.refresh_token_reuse', status: 'denied', actor: owner,
        targetType: 'session', targetId: result.session.id,
        details: { note: 'Possible token theft – session revoked' },
      });
    }
    return res.status(401).json({ error: 'انتهت الجلسة، الرجاء تسجيل الدخول', code: `SESSION_${result.error.toUpperCase()}` });
  }

  const user = db.get(
    `SELECT u.*, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`,
    result.session.user_id,
  );
  if (!user || user.status !== 'active') {
    tokens.revokeSession(result.session.id, 'account_inactive');
    tokens.clearRefreshCookie(res);
    return res.status(401).json({ error: 'الحساب غير مفعّل', code: 'ACCOUNT_INACTIVE' });
  }

  tokens.setRefreshCookie(res, result.refreshToken);
  res.json({
    accessToken: tokens.signAccessToken(user, result.session.id),
    expiresIn: config.jwt.accessTtlSeconds,
    user: publicUser(user),
  });
});

// ---------- Logout ----------
router.post('/logout', (req, res) => {
  const raw = req.cookies?.[tokens.REFRESH_COOKIE];
  if (raw) {
    const [sessionId] = raw.split('.');
    const session = db.get('SELECT s.id, u.id AS uid, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?', sessionId);
    if (session && tokens.revokeSession(session.id, 'logout')) {
      audit.log(req, {
        action: 'auth.logout', actor: { id: session.uid, username: session.username },
        targetType: 'session', targetId: session.id,
      });
    }
  }
  tokens.clearRefreshCookie(res);
  res.json({ message: 'تم تسجيل الخروج' });
});

// ---------- Current identity ----------
router.get('/me', authenticate, (req, res) => {
  const user = db.get(
    `SELECT u.*, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`,
    req.user.id,
  );
  res.json({
    user: publicUser(user),
    roles: req.user.roles,
    permissions: req.user.permissions,
    session: { id: req.session.id, createdAt: req.session.created_at, mfaVerified: !!req.session.mfa_verified },
    passwordPolicy: {
      minLength: config.password.minLength, historySize: config.password.historySize, maxAgeDays: config.password.maxAgeDays,
    },
  });
});

// ---------- Change own password ----------
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = db.get('SELECT * FROM users WHERE id = ?', req.user.id);

  if (!(await password.compare(String(currentPassword || ''), user.password_hash))) {
    audit.log(req, { action: 'auth.password.change', status: 'failure', details: { reason: 'wrong_current' } });
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  const errors = password.validatePolicy(newPassword, { username: user.username, email: user.email });
  if (errors.length) return res.status(400).json({ error: 'كلمة المرور لا تستوفي السياسة', details: errors });
  if (await password.isReused(user.id, newPassword)) {
    return res.status(400).json({ error: `لا يمكن إعادة استخدام آخر ${config.password.historySize} كلمات مرور` });
  }

  const hashed = await password.hash(newPassword);
  db.transaction(() => {
    db.run(
      `UPDATE users SET password_hash = ?, password_changed_at = ?, must_change_password = 0, updated_at = ? WHERE id = ?`,
      hashed, tokens.nowSql(), tokens.nowSql(), user.id,
    );
    password.addToHistory(user.id, hashed);
  });
  // Sign out every OTHER device: if the old password was stolen, the attacker loses access.
  const revoked = tokens.revokeAllForUser(user.id, 'password_changed', req.session.id);
  audit.log(req, { action: 'auth.password.change', targetType: 'user', targetId: user.id, details: { otherSessionsRevoked: revoked } });
  res.json({ message: 'تم تغيير كلمة المرور بنجاح', otherSessionsRevoked: revoked });
});

// Departments list for the registration form (public, non-sensitive).
router.get('/departments', (req, res) => {
  res.json(db.all('SELECT id, name FROM departments ORDER BY id'));
});

module.exports = router;
module.exports.publicUser = publicUser;
