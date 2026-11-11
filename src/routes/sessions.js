// Session management: users see/revoke their own devices; admins can see/revoke anyone's.
const express = require('express');
const db = require('../db/database');
const tokens = require('../services/tokens');
const audit = require('../services/audit');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/mine', (req, res) => {
  const rows = db.all(
    `SELECT id, ip_address, user_agent, mfa_verified, created_at, last_used_at, expires_at
     FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_used_at DESC`,
    req.user.id, tokens.nowSql(),
  );
  res.json(rows.map((s) => ({ ...s, current: s.id === req.session.id })));
});

router.get('/', requirePermission('sessions:read_all'), (req, res) => {
  const rows = db.all(
    `SELECT s.id, s.ip_address, s.user_agent, s.mfa_verified, s.created_at, s.last_used_at, s.expires_at,
            u.id AS user_id, u.username, u.full_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL AND s.expires_at > ? ORDER BY s.last_used_at DESC`, tokens.nowSql(),
  );
  res.json(rows.map((s) => ({ ...s, current: s.id === req.session.id })));
});

router.delete('/:id', (req, res) => {
  const s = db.get('SELECT * FROM sessions WHERE id = ?', req.params.id);
  if (!s || s.revoked_at) return res.status(404).json({ error: 'الجلسة غير موجودة' });
  const own = s.user_id === req.user.id;
  if (!own && !req.user.permissions.includes('sessions:revoke_any')) {
    audit.log(req, { action: 'access.denied', status: 'denied', targetType: 'session', targetId: s.id, details: { required: ['sessions:revoke_any'] } });
    return res.status(403).json({ error: 'ليس لديك صلاحية إنهاء جلسات الآخرين' });
  }
  tokens.revokeSession(s.id, own ? 'user_revoked' : 'admin_revoked');
  audit.log(req, { action: 'session.revoke', targetType: 'session', targetId: s.id, details: { owner: s.user_id } });
  res.json({ message: 'تم إنهاء الجلسة' });
});

module.exports = router;
