// Sales (customers, deals: own vs all), customer support tickets (work vs assign), IT assets (own vs all).
const express = require('express');
const db = require('../../db/database');
const audit = require('../../services/audit');
const { requirePermission, requireAny } = require('../../middleware/auth');
const { can, scopesOf, resolveScope, scopeWhere, deny, nowSql } = require('./_helpers');

const router = express.Router();

// =============================== Customers ===============================
router.get('/customers', requirePermission('customers:read'), (req, res) => {
  const params = [];
  let where = '1 = 1';
  if (req.query.q) { where += ' AND (c.name LIKE ? OR c.city LIKE ? OR c.sector LIKE ?)'; const l = `%${req.query.q}%`; params.push(l, l, l); }
  const rows = db.raw.prepare(
    `SELECT c.*, u.full_name AS account_manager, u.status AS account_manager_status,
            (SELECT COUNT(*) FROM deals d WHERE d.customer_id = c.id AND d.stage NOT IN ('won','lost')) AS open_deals,
            (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.status IN ('open','in_progress')) AS open_tickets
     FROM customers c LEFT JOIN users u ON u.id = c.account_manager_id WHERE ${where} ORDER BY c.name`,
  ).all(...params);
  res.json({ canManage: can(req.user, 'customers:manage'), rows });
});

router.post('/customers', requirePermission('customers:manage'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 3) return res.status(400).json({ error: 'اسم العميل مطلوب' });
  const { lastInsertRowid } = db.run(
    'INSERT INTO customers (name, sector, city, contact_name, phone, email, account_manager_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    name, req.body.sector || null, req.body.city || null, req.body.contactName || null, req.body.phone || null, req.body.email || null,
    req.body.accountManagerId ? Number(req.body.accountManagerId) : req.user.id,
  );
  audit.log(req, { action: 'customer.create', targetType: 'customer', targetId: lastInsertRowid, details: { name } });
  res.status(201).json({ id: Number(lastInsertRowid) });
});

// =============================== Deals ===============================
// Ownership rule: a sales rep reads and edits only the deals he owns.
function dealEdit(user, d) {
  if (can(user, 'deals:manage:all')) return true;
  return can(user, 'deals:manage:own') && d.owner_id === user.id;
}

router.get('/deals', requireAny('deals:read:own', 'deals:read:all'), (req, res) => {
  const scopes = scopesOf(req.user, 'deals:read');
  const scope = resolveScope(req.user, 'deals:read', req.query.scope);
  const w = scopeWhere(scope, req.user, 'd.owner_id', 'o.department_id');
  const rows = db.raw.prepare(
    `SELECT d.*, c.name AS customer, c.city, o.full_name AS owner, o.status AS owner_status
     FROM deals d JOIN customers c ON c.id = d.customer_id LEFT JOIN users o ON o.id = d.owner_id
     WHERE ${w.sql} ORDER BY CASE d.stage WHEN 'negotiation' THEN 0 WHEN 'proposal' THEN 1 WHEN 'lead' THEN 2 WHEN 'won' THEN 3 ELSE 4 END, d.value DESC`,
  ).all(...w.params);
  const reps = can(req.user, 'deals:manage:all')
    ? db.all(`SELECT DISTINCT u.id, u.full_name FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
              WHERE r.name IN ('sales_rep','sales_manager') AND u.status = 'active' ORDER BY u.full_name`)
    : [];
  res.json({
    scope, scopes, canCreate: can(req.user, 'deals:manage:own') || can(req.user, 'deals:manage:all'), canReassign: can(req.user, 'deals:manage:all'), reps,
    customers: db.all('SELECT id, name FROM customers ORDER BY name'),
    rows: rows.map((r) => ({ ...r, _actions: dealEdit(req.user, r) ? ['edit'] : [] })),
  });
});

router.post('/deals', requireAny('deals:manage:own', 'deals:manage:all'), (req, res) => {
  const { customerId, title, value, expectedClose } = req.body || {};
  const v = Number(value);
  if (!db.get('SELECT 1 FROM customers WHERE id = ?', Number(customerId)) || !String(title || '').trim() || !Number.isInteger(v) || v <= 0) {
    return res.status(400).json({ error: 'العميل والعنوان والقيمة مطلوبة' });
  }
  const owner = can(req.user, 'deals:manage:all') && req.body.ownerId ? Number(req.body.ownerId) : req.user.id;
  const { lastInsertRowid } = db.run('INSERT INTO deals (customer_id, title, value, stage, owner_id, expected_close) VALUES (?, ?, ?, ?, ?, ?)',
    Number(customerId), String(title).trim(), v, 'lead', owner, expectedClose || null);
  audit.log(req, { action: 'deal.create', targetType: 'deal', targetId: lastInsertRowid, details: { title, value: v } });
  res.status(201).json({ id: Number(lastInsertRowid) });
});

router.patch('/deals/:id', requireAny('deals:manage:own', 'deals:manage:all'), (req, res) => {
  const d = db.get('SELECT * FROM deals WHERE id = ?', Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'الصفقة غير موجودة' });
  if (!dealEdit(req.user, d)) return deny(req, res, 'هذه الصفقة ليست لك — يمكنك تعديل صفقاتك فقط', { target: { type: 'deal', id: d.id }, required: ['deals:manage:all'] });
  const changes = {};
  if (req.body.stage !== undefined) {
    if (!['lead', 'proposal', 'negotiation', 'won', 'lost'].includes(req.body.stage)) return res.status(400).json({ error: 'مرحلة غير صالحة' });
    changes.stage = req.body.stage;
  }
  if (req.body.value !== undefined) changes.value = Number(req.body.value);
  if (req.body.ownerId !== undefined) {
    if (!can(req.user, 'deals:manage:all')) return deny(req, res, 'إعادة إسناد الصفقات لمدير المبيعات فقط', { target: { type: 'deal', id: d.id }, required: ['deals:manage:all'] });
    changes.owner_id = Number(req.body.ownerId);
  }
  const keys = Object.keys(changes);
  if (!keys.length) return res.status(400).json({ error: 'لا توجد تغييرات' });
  db.raw.prepare(`UPDATE deals SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => changes[k]), nowSql(), d.id);
  audit.log(req, { action: 'deal.update', targetType: 'deal', targetId: d.id, details: { from: { stage: d.stage, owner: d.owner_id }, changes } });
  res.json({ message: 'تم تحديث الصفقة' });
});

// =============================== Support tickets ===============================
// Agents work on tickets assigned to them; supervisors assign anything and close tickets.
function ticketActions(user, t) {
  const a = [];
  const supervisor = can(user, 'tickets:assign');
  const mine = t.assigned_to === user.id && can(user, 'tickets:work');
  if (supervisor) a.push('assign');
  if ((mine || supervisor) && t.status === 'open') a.push('start');
  if ((mine || supervisor) && ['open', 'in_progress'].includes(t.status)) a.push('resolve');
  if (supervisor && t.status === 'resolved') a.push('close');
  if (!t.assigned_to && can(user, 'tickets:work') && !supervisor) a.push('take');
  return a;
}

router.get('/tickets', requirePermission('tickets:read'), (req, res) => {
  const params = [];
  let where = '1 = 1';
  if (req.query.view === 'mine') { where += ' AND t.assigned_to = ?'; params.push(req.user.id); }
  if (req.query.view === 'unassigned') where += ' AND t.assigned_to IS NULL';
  if (['open', 'in_progress', 'resolved', 'closed'].includes(req.query.status)) { where += ' AND t.status = ?'; params.push(req.query.status); }
  const rows = db.raw.prepare(
    `SELECT t.*, c.name AS customer, a.full_name AS assignee FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id
     LEFT JOIN users a ON a.id = t.assigned_to WHERE ${where}
     ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
              CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at DESC`,
  ).all(...params);
  const agents = can(req.user, 'tickets:assign')
    ? db.all(`SELECT DISTINCT u.id, u.full_name FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
              WHERE r.name IN ('cs_agent','cs_supervisor') AND u.status = 'active' ORDER BY u.full_name`)
    : [];
  res.json({
    canCreate: can(req.user, 'tickets:create'), canAssign: can(req.user, 'tickets:assign'), agents,
    customers: db.all('SELECT id, name FROM customers ORDER BY name'),
    rows: rows.map((t) => ({ ...t, _actions: ticketActions(req.user, t) })),
  });
});

router.post('/tickets', requirePermission('tickets:create'), (req, res) => {
  const subject = String(req.body?.subject || '').trim();
  if (subject.length < 5 || !['low', 'medium', 'high', 'urgent'].includes(req.body?.priority)) return res.status(400).json({ error: 'الموضوع والأولوية مطلوبان' });
  const last = db.get('SELECT number FROM tickets ORDER BY id DESC LIMIT 1')?.number || 'TCK-2200';
  const number = `TCK-${Number(last.split('-')[1]) + 1}`;
  const { lastInsertRowid } = db.run('INSERT INTO tickets (number, customer_id, subject, description, priority, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    number, req.body.customerId ? Number(req.body.customerId) : null, subject, req.body.description || null, req.body.priority, req.user.id);
  audit.log(req, { action: 'ticket.create', targetType: 'ticket', targetId: number });
  res.status(201).json({ id: Number(lastInsertRowid), number });
});

router.patch('/tickets/:id', requireAny('tickets:work', 'tickets:assign'), (req, res) => {
  const t = db.get('SELECT * FROM tickets WHERE id = ?', Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  const actions = ticketActions(req.user, t);
  const { action, assignTo } = req.body || {};
  if (!actions.includes(action)) {
    const reason = action === 'close' ? 'إغلاق التذاكر لمشرف خدمة العملاء فقط'
      : action === 'assign' ? 'إسناد التذاكر لمشرف خدمة العملاء فقط'
        : 'هذه التذكرة غير مسندة إليك';
    return deny(req, res, reason, { target: { type: 'ticket', id: t.number }, required: ['tickets:assign'] });
  }
  const change = {
    take: ['assigned_to', req.user.id, 'in_progress'], start: [null, null, 'in_progress'], resolve: [null, null, 'resolved'], close: [null, null, 'closed'],
    assign: ['assigned_to', Number(assignTo), t.status === 'open' ? 'in_progress' : t.status],
  }[action];
  if (change[0]) db.run('UPDATE tickets SET assigned_to = ?, status = ?, updated_at = ? WHERE id = ?', change[1], change[2], nowSql(), t.id);
  else db.run('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', change[2], nowSql(), t.id);
  audit.log(req, { action: `ticket.${action}`, targetType: 'ticket', targetId: t.number, details: { from: t.status, to: change[2], assignTo: change[0] ? change[1] : undefined } });
  res.json({ message: 'تم تحديث التذكرة' });
});

// =============================== IT assets ===============================
router.get('/assets', requireAny('assets:read:own', 'assets:read:all'), (req, res) => {
  const scopes = scopesOf(req.user, 'assets:read');
  const scope = resolveScope(req.user, 'assets:read', req.query.scope);
  const w = scopeWhere(scope, req.user, 'a.assigned_to', 'u.department_id');
  const params = [...w.params];
  let extra = '';
  if (req.query.type) { extra += ' AND a.type = ?'; params.push(req.query.type); }
  if (req.query.status) { extra += ' AND a.status = ?'; params.push(req.query.status); }
  const rows = db.raw.prepare(
    `SELECT a.*, u.full_name AS holder, u.status AS holder_status, d.name AS department
     FROM assets a LEFT JOIN users u ON u.id = a.assigned_to LEFT JOIN departments d ON d.id = u.department_id
     WHERE ${w.sql}${extra} ORDER BY (u.status = 'disabled') DESC, a.type, a.tag`,
  ).all(...params);
  const manage = can(req.user, 'assets:manage');
  res.json({
    scope, scopes, canManage: manage,
    users: manage ? db.all("SELECT id, full_name FROM users WHERE status = 'active' ORDER BY full_name") : [],
    rows: rows.map((r) => ({ ...r, _flag: r.holder_status === 'disabled' ? 'يجب استرجاعه من موظف سابق' : null, _actions: manage ? ['edit'] : [] })),
  });
});

router.patch('/assets/:id', requirePermission('assets:manage'), (req, res) => {
  const a = db.get('SELECT * FROM assets WHERE id = ?', Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'غير موجود' });
  const status = req.body?.status;
  if (!['in_use', 'in_stock', 'repair', 'retired'].includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });
  const assigned = status === 'in_use' && req.body.assignedTo ? Number(req.body.assignedTo) : (status === 'in_use' ? a.assigned_to : null);
  const location = req.body.location ?? (status === 'in_stock' ? 'مخزن تقنية المعلومات' : a.location);
  db.run('UPDATE assets SET status = ?, assigned_to = ?, location = ? WHERE id = ?', status, assigned, location, a.id);
  audit.log(req, { action: 'asset.update', targetType: 'asset', targetId: a.tag, details: { from: { status: a.status, holder: a.assigned_to }, to: { status, holder: assigned } } });
  res.json({ message: 'تم تحديث الجهاز' });
});

module.exports = router;
