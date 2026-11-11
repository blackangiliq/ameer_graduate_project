// Audit log viewer & CSV export (Accountability – the third "A" of AAA).
const express = require('express');
const db = require('../db/database');
const audit = require('../services/audit');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

function buildFilter(query) {
  const where = [];
  const params = [];
  if (query.q) { where.push('(actor_username LIKE ? OR action LIKE ? OR ip_address LIKE ? OR details LIKE ?)'); const l = `%${query.q}%`; params.push(l, l, l, l); }
  if (query.action) { where.push('action LIKE ?'); params.push(`${query.action}%`); }
  if (['success', 'failure', 'denied'].includes(query.status)) { where.push('status = ?'); params.push(query.status); }
  if (query.from) { where.push('created_at >= ?'); params.push(`${query.from} 00:00:00`); }
  if (query.to) { where.push('created_at <= ?'); params.push(`${query.to} 23:59:59`); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

router.get('/', requirePermission('audit:read'), (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const total = db.raw.prepare(`SELECT COUNT(*) AS n FROM audit_logs ${sql}`).get(...params).n;
  const rows = db.raw.prepare(
    `SELECT * FROM audit_logs ${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
  ).all(...params, limit, (page - 1) * limit);
  res.json({ total, page, limit, rows: rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })) });
});

router.get('/export', requirePermission('audit:export'), (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const rows = db.raw.prepare(`SELECT * FROM audit_logs ${sql} ORDER BY created_at DESC, id DESC LIMIT 10000`).all(...params);
  const cols = ['id', 'created_at', 'actor_username', 'action', 'target_type', 'target_id', 'status', 'ip_address', 'details'];
  // Prefix formula characters to prevent CSV/Excel formula injection.
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  audit.log(req, { action: 'audit.export', details: { rows: rows.length, filter: req.query } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

module.exports = router;
