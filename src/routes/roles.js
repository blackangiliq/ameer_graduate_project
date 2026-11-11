// Roles & permissions administration (RBAC policy management).
const express = require('express');
const db = require('../db/database');
const audit = require('../services/audit');
const rbac = require('../services/rbac');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', requirePermission('roles:read'), (req, res) => {
  const roles = db.all(
    `SELECT r.*, (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
     FROM roles r ORDER BY r.id`,
  );
  for (const r of roles) r.permissions = rbac.getRolePermissions(r.id);
  res.json(roles);
});

router.get('/permissions', requirePermission('roles:read'), (req, res) => {
  res.json(db.all('SELECT id, name, label, category FROM permissions ORDER BY id'));
});

// Access review matrix: who has which role (used by auditors for periodic recertification)
router.get('/matrix', requirePermission('roles:read'), (req, res) => {
  const roles = db.all('SELECT id, name, label FROM roles ORDER BY id');
  const users = db.all(
    `SELECT u.id, u.full_name, u.username, u.status, d.name AS department
     FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.status != 'pending' ORDER BY u.department_id, u.id`,
  );
  const links = db.all('SELECT user_id, role_id FROM user_roles');
  const map = new Map();
  for (const l of links) {
    if (!map.has(l.user_id)) map.set(l.user_id, []);
    map.get(l.user_id).push(l.role_id);
  }
  res.json({ roles, users: users.map((u) => ({ ...u, roleIds: map.get(u.id) || [] })) });
});

router.post('/', requirePermission('roles:manage'), (req, res) => {
  const name = String(req.body?.name || '').trim().toLowerCase();
  const label = String(req.body?.label || '').trim();
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(name) || !label) return res.status(400).json({ error: 'اسم الدور أو عنوانه غير صالح' });
  if (db.get('SELECT 1 FROM roles WHERE name = ?', name)) return res.status(409).json({ error: 'الدور موجود مسبقاً' });
  const { lastInsertRowid } = db.run('INSERT INTO roles (name, label, description) VALUES (?, ?, ?)', name, label, req.body?.description || null);
  audit.log(req, { action: 'role.create', targetType: 'role', targetId: lastInsertRowid, details: { name } });
  res.status(201).json(db.get('SELECT * FROM roles WHERE id = ?', lastInsertRowid));
});

router.put('/:id/permissions', requirePermission('roles:manage'), (req, res) => {
  const role = db.get('SELECT * FROM roles WHERE id = ?', Number(req.params.id));
  if (!role) return res.status(404).json({ error: 'الدور غير موجود' });
  if (role.name === 'super_admin') return res.status(403).json({ error: 'صلاحيات المدير العام ثابتة ولا يمكن تعديلها' });
  const names = (req.body?.permissions || []).map(String);
  const perms = names.length
    ? db.raw.prepare(`SELECT id, name FROM permissions WHERE name IN (${names.map(() => '?').join(',')})`).all(...names)
    : [];
  const before = rbac.getRolePermissions(role.id);
  db.transaction(() => {
    db.run('DELETE FROM role_permissions WHERE role_id = ?', role.id);
    for (const p of perms) db.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', role.id, p.id);
  });
  const after = perms.map((p) => p.name);
  audit.log(req, {
    action: 'role.permissions.update', targetType: 'role', targetId: role.id,
    details: { role: role.name, granted: after.filter((p) => !before.includes(p)), revoked: before.filter((p) => !after.includes(p)) },
  });
  res.json({ ...role, permissions: rbac.getRolePermissions(role.id) });
});

router.delete('/:id', requirePermission('roles:manage'), (req, res) => {
  const role = db.get('SELECT * FROM roles WHERE id = ?', Number(req.params.id));
  if (!role) return res.status(404).json({ error: 'الدور غير موجود' });
  if (role.is_system) return res.status(403).json({ error: 'لا يمكن حذف أدوار النظام الأساسية' });
  db.run('DELETE FROM roles WHERE id = ?', role.id);
  audit.log(req, { action: 'role.delete', targetType: 'role', targetId: role.id, details: { name: role.name } });
  res.json({ message: 'تم حذف الدور' });
});

module.exports = router;
