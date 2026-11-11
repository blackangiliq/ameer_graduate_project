// Security dashboard statistics + protected resources (access-control demo).
const express = require('express');
const db = require('../db/database');
const tokens = require('../services/tokens');
const audit = require('../services/audit');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', requirePermission('dashboard:view'), (req, res) => {
  const now = tokens.nowSql();
  const one = (sql, ...p) => db.get(sql, ...p).n;
  const users = {
    total: one('SELECT COUNT(*) AS n FROM users'),
    active: one("SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
    pending: one("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'"),
    suspended: one("SELECT COUNT(*) AS n FROM users WHERE status IN ('suspended','disabled')"),
    locked: one('SELECT COUNT(*) AS n FROM users WHERE locked_until > ?', now),
    mfa: one("SELECT COUNT(*) AS n FROM users WHERE mfa_enabled = 1 AND status = 'active'"),
    mustChange: one('SELECT COUNT(*) AS n FROM users WHERE must_change_password = 1'),
  };
  const activeSessions = one('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at > ?', now);
  const last24 = "created_at >= datetime('now', '-1 day')";
  const logins24 = {
    success: one(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'auth.login' AND status = 'success' AND ${last24}`),
    failure: one(`SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('auth.login','auth.account_locked','auth.mfa.verify') AND status != 'success' AND ${last24}`),
    denied: one(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'access.denied' AND ${last24}`),
  };
  // Logins per day for the last 14 days
  const daily = db.all(
    `SELECT date(created_at) AS day,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
            SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failure
     FROM audit_logs WHERE action IN ('auth.login','auth.account_locked') AND created_at >= date('now', '-13 days')
     GROUP BY day ORDER BY day`,
  );
  const topFailedIps = db.all(
    `SELECT ip_address, COUNT(*) AS n FROM audit_logs
     WHERE action IN ('auth.login','auth.account_locked') AND status = 'failure' AND created_at >= datetime('now','-7 days')
     GROUP BY ip_address ORDER BY n DESC LIMIT 5`,
  );
  const roles = db.all(
    `SELECT r.label, COUNT(ur.user_id) AS n FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
     GROUP BY r.id ORDER BY n DESC`,
  );
  const recent = db.all(
    `SELECT id, created_at, actor_username, action, status, ip_address FROM audit_logs
     WHERE status != 'success' OR action LIKE 'user.%' OR action LIKE 'role.%'
     ORDER BY created_at DESC, id DESC LIMIT 8`,
  );
  res.json({ users, activeSessions, logins24, daily, topFailedIps, roles, recent });
});

const CATEGORIES = {
  public: 'resources:public:read',
  hr: 'resources:hr:read',
  finance: 'resources:finance:read',
  it: 'resources:it:read',
};

// Overview: which categories exist and whether the current user may open them.
router.get('/resources', (req, res) => {
  const counts = db.all('SELECT category, COUNT(*) AS n FROM resources GROUP BY category');
  res.json(Object.entries(CATEGORIES).map(([category, permission]) => ({
    category, permission,
    allowed: req.user.permissions.includes(permission),
    count: counts.find((c) => c.category === category)?.n || 0,
  })));
});

router.get('/resources/:category', (req, res, next) => {
  const permission = CATEGORIES[req.params.category];
  if (!permission) return res.status(404).json({ error: 'القسم غير موجود' });
  return requirePermission(permission)(req, res, () => {
    const rows = db.all('SELECT * FROM resources WHERE category = ? ORDER BY id', req.params.category);
    audit.log(req, { action: 'resource.read', targetType: 'resource', targetId: req.params.category });
    res.json(rows);
  });
});

module.exports = router;
