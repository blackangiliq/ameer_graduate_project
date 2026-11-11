// Finance: supplier invoices (approval limit + maker-checker) and expense claims (own / all).
const express = require('express');
const db = require('../../db/database');
const audit = require('../../services/audit');
const { requirePermission, requireAny } = require('../../middleware/auth');
const { can, scopesOf, resolveScope, scopeWhere, deny, nowSql } = require('./_helpers');

const router = express.Router();
const APPROVAL_LIMIT = 10_000_000; // IQD – above this needs invoices:approve_unlimited

// =============================== Invoices ===============================
/** Attribute-based rule on top of RBAC: amount and who created the invoice. */
function invoiceBlock(user, inv) {
  if (inv.status !== 'pending') return 'الفاتورة ليست قيد الانتظار';
  if (!can(user, 'invoices:approve')) return 'ليس لديك صلاحية الاعتماد';
  if (inv.created_by === user.id) return 'لا يمكنك اعتماد فاتورة سجّلتها بنفسك (من يُدخل لا يعتمد)';
  if (inv.amount > APPROVAL_LIMIT && !can(user, 'invoices:approve_unlimited')) return 'المبلغ يتجاوز حد اعتمادك (10,000,000 د.ع) — يتطلب المدير المالي';
  return null;
}

router.get('/invoices', requirePermission('invoices:read'), (req, res) => {
  const params = [];
  let where = '1 = 1';
  if (['pending', 'approved', 'rejected', 'paid'].includes(req.query.status)) { where += ' AND i.status = ?'; params.push(req.query.status); }
  if (req.query.q) { where += ' AND (i.vendor LIKE ? OR i.number LIKE ? OR i.description LIKE ?)'; const l = `%${req.query.q}%`; params.push(l, l, l); }
  const rows = db.raw.prepare(
    `SELECT i.*, c.full_name AS created_by_name, a.full_name AS approved_by_name
     FROM invoices i LEFT JOIN users c ON c.id = i.created_by LEFT JOIN users a ON a.id = i.approved_by
     WHERE ${where} ORDER BY CASE i.status WHEN 'pending' THEN 0 ELSE 1 END, i.created_at DESC`,
  ).all(...params);
  const totals = db.get(`SELECT SUM(CASE WHEN status='pending' THEN amount END) pending, SUM(CASE WHEN status='approved' THEN amount END) approved,
                                SUM(CASE WHEN status='paid' THEN amount END) paid FROM invoices`);
  const approver = can(req.user, 'invoices:approve');
  res.json({
    canCreate: can(req.user, 'invoices:create'),
    limit: can(req.user, 'invoices:approve_unlimited') ? null : approver ? APPROVAL_LIMIT : 0,
    totals,
    rows: rows.map((r) => {
      const block = invoiceBlock(req.user, r);
      return { ...r, _actions: block ? [] : ['approve', 'reject'], _note: approver && r.status === 'pending' ? block : null };
    }),
  });
});

router.post('/invoices', requirePermission('invoices:create'), (req, res) => {
  const vendor = String(req.body?.vendor || '').trim();
  const description = String(req.body?.description || '').trim();
  const amount = Number(req.body?.amount);
  if (!vendor || !description || !Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'المورد والوصف والمبلغ (عدد صحيح) مطلوبة' });
  const last = db.get("SELECT number FROM invoices ORDER BY id DESC LIMIT 1")?.number || 'INV-2026-4000';
  const number = `INV-2026-${Number(last.split('-')[2]) + 1}`;
  const { lastInsertRowid } = db.run('INSERT INTO invoices (number, vendor, description, amount, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    number, vendor, description, amount, req.body?.dueDate || null, req.user.id);
  audit.log(req, { action: 'invoice.create', targetType: 'invoice', targetId: number, details: { vendor, amount } });
  res.status(201).json({ id: Number(lastInsertRowid), number });
});

router.post('/invoices/:id/decision', requirePermission('invoices:approve'), (req, res) => {
  const inv = db.get('SELECT * FROM invoices WHERE id = ?', Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'غير موجودة' });
  const block = invoiceBlock(req.user, inv);
  if (block) {
    return deny(req, res, block, {
      target: { type: 'invoice', id: inv.number },
      required: inv.amount > APPROVAL_LIMIT ? ['invoices:approve_unlimited'] : [],
      details: { amount: inv.amount },
    });
  }
  const status = req.body?.decision === 'approve' ? 'approved' : 'rejected';
  db.run('UPDATE invoices SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?', status, req.user.id, nowSql(), inv.id);
  audit.log(req, { action: status === 'approved' ? 'invoice.approve' : 'invoice.reject', targetType: 'invoice', targetId: inv.number, details: { amount: inv.amount, vendor: inv.vendor } });
  res.json({ message: status === 'approved' ? 'تم اعتماد الفاتورة' : 'تم رفض الفاتورة' });
});

// =============================== Expense claims ===============================
function expenseBlock(user, e) {
  if (e.status !== 'pending') return 'الطلب ليس قيد الانتظار';
  if (!can(user, 'expenses:approve')) return 'ليس لديك صلاحية الاعتماد';
  if (e.user_id === user.id) return 'لا يمكنك اعتماد مصروفاتك بنفسك';
  return null;
}

router.get('/expenses', requireAny('expenses:read:own', 'expenses:read:all'), (req, res) => {
  const scopes = scopesOf(req.user, 'expenses:read');
  const scope = resolveScope(req.user, 'expenses:read', req.query.scope);
  const w = scopeWhere(scope, req.user, 'e.user_id', 'u.department_id');
  const rows = db.raw.prepare(
    `SELECT e.*, u.full_name AS employee, d.name AS department, r.full_name AS reviewer
     FROM expense_claims e JOIN users u ON u.id = e.user_id LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN users r ON r.id = e.reviewed_by WHERE ${w.sql}
     ORDER BY CASE e.status WHEN 'pending' THEN 0 ELSE 1 END, e.created_at DESC`,
  ).all(...w.params);
  res.json({
    scope, scopes, canCreate: can(req.user, 'expenses:create'),
    rows: rows.map((r) => {
      const block = expenseBlock(req.user, r);
      return { ...r, _actions: block ? [] : ['approve', 'reject'], _note: can(req.user, 'expenses:approve') && r.status === 'pending' ? block : null };
    }),
  });
});

router.post('/expenses', requirePermission('expenses:create'), (req, res) => {
  const { category, amount, description, expenseDate } = req.body || {};
  if (!['transport', 'hospitality', 'training', 'equipment', 'telecom'].includes(category)) return res.status(400).json({ error: 'الفئة غير صالحة' });
  const n = Number(amount);
  if (!Number.isInteger(n) || n <= 0 || n > 5_000_000) return res.status(400).json({ error: 'المبلغ غير صالح (الحد 5,000,000 د.ع)' });
  if (!String(description || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate || '')) return res.status(400).json({ error: 'الوصف والتاريخ مطلوبان' });
  const { lastInsertRowid } = db.run('INSERT INTO expense_claims (user_id, category, amount, description, expense_date) VALUES (?, ?, ?, ?, ?)',
    req.user.id, category, n, String(description).slice(0, 300), expenseDate);
  audit.log(req, { action: 'expense.submit', targetType: 'expense', targetId: lastInsertRowid, details: { amount: n, category } });
  res.status(201).json({ id: Number(lastInsertRowid) });
});

router.post('/expenses/:id/decision', requirePermission('expenses:approve'), (req, res) => {
  const e = db.get('SELECT * FROM expense_claims WHERE id = ?', Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'غير موجود' });
  const block = expenseBlock(req.user, e);
  if (block) return deny(req, res, block, { target: { type: 'expense', id: e.id } });
  const status = req.body?.decision === 'approve' ? 'approved' : 'rejected';
  db.run('UPDATE expense_claims SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?',
    status, req.user.id, nowSql(), String(req.body?.note || '').slice(0, 200) || null, e.id);
  audit.log(req, { action: status === 'approved' ? 'expense.approve' : 'expense.reject', targetType: 'expense', targetId: e.id, details: { amount: e.amount } });
  res.json({ message: 'تم' });
});

module.exports = router;
