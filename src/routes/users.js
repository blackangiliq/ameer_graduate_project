// Identity lifecycle management (Joiner – Mover – Leaver).
const express = require('express');
const db = require('../db/database');
const password = require('../services/password');
const tokens = require('../services/tokens');
const audit = require('../services/audit');
const rbac = require('../services/rbac');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();
const STATUSES = ['pending', 'active', 'suspended', 'disabled'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z][a-z0-9._-]{2,31}$/;

function loadUser(id) {
  const u = db.get(
    `SELECT u.id, u.username, u.email, u.full_name, u.job_title, u.department_id, d.name AS department,
            u.status, u.mfa_enabled, u.must_change_password, u.failed_attempts, u.locked_until,
            u.last_login_at, u.password_changed_at, u.created_at, u.updated_at
     FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`, Number(id),
  );
  if (!u) return null;
  u.roles = rbac.getUserRoles(u.id);
  u.permissions = rbac.getUserPermissions(u.id);
  u.locked = !!(u.locked_until && u.locked_until > tokens.nowSql());
  u.activeSessions = db.get(
    'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?', u.id, tokens.nowSql(),
  ).n;
  return u;
}

const isSuperAdmin = (user) => user.roles.some((r) => r.name === 'super_admin');

// List with search / filters
router.get('/', requirePermission('users:read'), (req, res) => {
  const { q = '', status = '', role = '', department = '' } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ? OR u.job_title LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (STATUSES.includes(status)) { where.push('u.status = ?'); params.push(status); }
  if (department) { where.push('u.department_id = ?'); params.push(Number(department)); }
  if (role) { where.push('EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = ?)'); params.push(role); }

  const rows = db.raw.prepare(
    `SELECT u.id, u.username, u.email, u.full_name, u.job_title, d.name AS department, u.status,
            u.mfa_enabled, u.locked_until, u.last_login_at, u.created_at,
            (SELECT group_concat(r.label, '، ') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.id`,
  ).all(...params);
  const now = tokens.nowSql();
  res.json(rows.map((r) => ({ ...r, locked: !!(r.locked_until && r.locked_until > now) })));
});

router.get('/:id', requirePermission('users:read'), (req, res) => {
  const u = loadUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json(u);
});

// Joiner: admin creates an account with a temporary password
router.post('/', requirePermission('users:create'), async (req, res) => {
  const { username, email, fullName, jobTitle, departmentId, roleIds = [] } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  const mail = String(email || '').trim().toLowerCase();
  const errors = [];
  if (!USERNAME_RE.test(uname)) errors.push('اسم المستخدم غير صالح');
  if (!EMAIL_RE.test(mail)) errors.push('البريد الإلكتروني غير صالح');
  if (String(fullName || '').trim().length < 3) errors.push('الاسم الكامل مطلوب');
  if (errors.length) return res.status(400).json({ error: 'بيانات غير صالحة', details: errors });
  if (db.get('SELECT 1 FROM users WHERE username = ? OR email = ?', uname, mail)) {
    return res.status(409).json({ error: 'اسم المستخدم أو البريد مستخدم مسبقاً' });
  }

  const roles = roleIds.length
    ? db.raw.prepare(`SELECT id, name FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`).all(...roleIds.map(Number))
    : [db.get("SELECT id, name FROM roles WHERE name = 'employee'")];
  if (roles.some((r) => r.name === 'super_admin') && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'فقط المدير العام يمكنه منح دور المدير العام' });
  }

  const temp = password.generateTemporary();
  const hashed = await password.hash(temp);
  const id = db.transaction(() => {
    const { lastInsertRowid } = db.run(
      `INSERT INTO users (username, email, full_name, job_title, department_id, password_hash, status, must_change_password, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 1, ?)`,
      uname, mail, String(fullName).trim(), jobTitle || null, departmentId ? Number(departmentId) : null, hashed, req.user.id,
    );
    password.addToHistory(lastInsertRowid, hashed);
    for (const r of roles) db.run('INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)', lastInsertRowid, r.id, req.user.id);
    return Number(lastInsertRowid);
  });
  audit.log(req, { action: 'user.create', targetType: 'user', targetId: id, details: { username: uname, roles: roles.map((r) => r.name) } });
  res.status(201).json({ user: loadUser(id), temporaryPassword: temp });
});

// Mover: update profile data
router.patch('/:id', requirePermission('users:update'), (req, res) => {
  const u = loadUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { fullName, email, jobTitle, departmentId } = req.body || {};
  const changes = {};
  if (fullName !== undefined) changes.full_name = String(fullName).trim();
  if (email !== undefined) {
    const mail = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    if (db.get('SELECT 1 FROM users WHERE email = ? AND id != ?', mail, u.id)) return res.status(409).json({ error: 'البريد مستخدم' });
    changes.email = mail;
  }
  if (jobTitle !== undefined) changes.job_title = jobTitle || null;
  if (departmentId !== undefined) changes.department_id = departmentId ? Number(departmentId) : null;
  const keys = Object.keys(changes);
  if (!keys.length) return res.status(400).json({ error: 'لا توجد تغييرات' });
  db.raw.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...keys.map((k) => changes[k]), u.id);
  audit.log(req, { action: 'user.update', targetType: 'user', targetId: u.id, details: { fields: keys } });
  res.json(loadUser(u.id));
});

// Lifecycle status: approve (pending->active), suspend, disable (Leaver), re-activate
router.patch('/:id/status', requirePermission('users:disable'), (req, res) => {
  const u = loadUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { status, reason = '' } = req.body || {};
  if (!STATUSES.includes(status) || status === 'pending') return res.status(400).json({ error: 'حالة غير صالحة' });
  if (u.id === req.user.id) return res.status(403).json({ error: 'لا يمكنك تغيير حالة حسابك بنفسك' });
  if (isSuperAdmin(u) && !isSuperAdmin(req.user)) return res.status(403).json({ error: 'لا يمكنك تعديل حساب المدير العام' });

  db.run("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?", status, u.id);
  let revoked = 0;
  if (status !== 'active') revoked = tokens.revokeAllForUser(u.id, `account_${status}`); // immediate de-provisioning
  const action = u.status === 'pending' && status === 'active' ? 'user.approve' : 'user.status_change';
  audit.log(req, { action, targetType: 'user', targetId: u.id, details: { from: u.status, to: status, reason, sessionsRevoked: revoked } });
  res.json(loadUser(u.id));
});

// Role assignment
router.put('/:id/roles', requirePermission('roles:assign'), (req, res) => {
  const u = loadUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (u.id === req.user.id) return res.status(403).json({ error: 'لا يمكنك تعديل أدوارك بنفسك (منع تصعيد الصلاحيات)' });
  const ids = (req.body?.roleIds || []).map(Number);
  const roles = ids.length ? db.raw.prepare(`SELECT id, name FROM roles WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
  const touchesSuper = roles.some((r) => r.name === 'super_admin') || isSuperAdmin(u);
  if (touchesSuper && !isSuperAdmin(req.user)) return res.status(403).json({ error: 'فقط المدير العام يمكنه إدارة دور المدير العام' });

  const before = u.roles.map((r) => r.name);
  db.transaction(() => {
    db.run('DELETE FROM user_roles WHERE user_id = ?', u.id);
    for (const r of roles) db.run('INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)', u.id, r.id, req.user.id);
  });
  const after = roles.map((r) => r.name);
  audit.log(req, {
    action: 'user.roles.update', targetType: 'user', targetId: u.id,
    details: { added: after.filter((r) => !before.includes(r)), removed: before.filter((r) => !after.includes(r)) },
  });
  res.json(loadUser(u.id));
});

// Admin / IT password reset -> temporary password + force change + kill sessions
router.post('/:id/reset-password', requirePermission('users:reset_password'), async (req, res) => {
  const u = loadUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'استخدم صفحة الملف الشخصي لتغيير كلمة مرورك' });
  if (isSuperAdmin(u) && !isSuperAdmin(req.user)) return res.status(403).json({ error: 'لا يمكنك إعادة تعيين كلمة مرور المدير العام' });
  const temp = password.generateTemporary();
  const hashed = await password.hash(temp);
  db.transaction(() => {
    db.run(`UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL,
            password_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, hashed, u.id);
    password.addToHistory(u.id, hashed);
  });
  const revoked = tokens.revokeAllForUser(u.id, 'password_reset');
  audit.log(req, { action: 'user.password.reset', targetType: 'user', targetId: u.id, details: { sessionsRevoked: revoked } });
  res.json({ temporaryPassword: temp, sessionsRevoked: revoked });
});

router.post('/:id/unlock', requirePermission('users:unlock'), (req, res) => {
  const u = loadUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', u.id);
  audit.log(req, { action: 'user.unlock', targetType: 'user', targetId: u.id });
  res.json(loadUser(u.id));
});

// Reset MFA (lost phone) – user must enrol again
router.post('/:id/reset-mfa', requirePermission('users:reset_password'), (req, res) => {
  const u = loadUser(req.params.id);
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (isSuperAdmin(u) && !isSuperAdmin(req.user)) return res.status(403).json({ error: 'غير مسموح' });
  db.transaction(() => {
    db.run('UPDATE users SET mfa_enabled = 0, mfa_secret_enc = NULL WHERE id = ?', u.id);
    db.run('DELETE FROM mfa_recovery_codes WHERE user_id = ?', u.id);
  });
  tokens.revokeAllForUser(u.id, 'mfa_reset');
  audit.log(req, { action: 'user.mfa.reset', targetType: 'user', targetId: u.id });
  res.json(loadUser(u.id));
});

module.exports = router;
