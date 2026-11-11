// Human resources: announcements, employee directory, employee records (field-level security),
// leave requests (own / department / all scope), payroll (preparer ≠ approver).
const express = require('express');
const db = require('../../db/database');
const audit = require('../../services/audit');
const { requirePermission, requireAny } = require('../../middleware/auth');
const { can, scopesOf, resolveScope, scopeWhere, deny, today, nowSql } = require('./_helpers');

const router = express.Router();

// =============================== Announcements ===============================
// Attribute rule: an announcement targeted at a department is only visible to that department
// (announcement managers see everything).
router.get('/announcements', requirePermission('announcements:read'), (req, res) => {
  const manage = can(req.user, 'announcements:manage');
  const rows = db.all(
    `SELECT a.*, d.name AS department, u.full_name AS author
     FROM announcements a LEFT JOIN departments d ON d.id = a.department_id LEFT JOIN users u ON u.id = a.created_by
     WHERE a.department_id IS NULL OR a.department_id = ? OR ? = 1
     ORDER BY a.pinned DESC, a.created_at DESC`, req.user.department_id, manage ? 1 : 0,
  );
  res.json({ canManage: manage, rows });
});

router.post('/announcements', requirePermission('announcements:manage'), (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  if (title.length < 5 || body.length < 10) return res.status(400).json({ error: 'العنوان والنص مطلوبان' });
  const dept = req.body?.departmentId ? Number(req.body.departmentId) : null;
  const { lastInsertRowid } = db.run('INSERT INTO announcements (title, body, department_id, pinned, created_by) VALUES (?, ?, ?, ?, ?)',
    title, body, dept, req.body?.pinned ? 1 : 0, req.user.id);
  audit.log(req, { action: 'announcement.create', targetType: 'announcement', targetId: lastInsertRowid, details: { title, departmentId: dept } });
  res.status(201).json({ id: Number(lastInsertRowid) });
});

router.delete('/announcements/:id', requirePermission('announcements:manage'), (req, res) => {
  const a = db.get('SELECT id, title FROM announcements WHERE id = ?', Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'غير موجود' });
  db.run('DELETE FROM announcements WHERE id = ?', a.id);
  audit.log(req, { action: 'announcement.delete', targetType: 'announcement', targetId: a.id, details: { title: a.title } });
  res.json({ message: 'تم الحذف' });
});

// =============================== Directory ===============================
// Everyone sees contact data only – no HR fields.
router.get('/directory', requirePermission('directory:read'), (req, res) => {
  res.json(db.all(
    `SELECT u.id, u.full_name, u.job_title, u.email, d.name AS department, d.code AS department_code, p.phone, p.extension
     FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN employee_profiles p ON p.user_id = u.id
     WHERE u.status = 'active' ORDER BY d.id, u.full_name`,
  ));
});

// =============================== Employee records ===============================
// Field-level security: hr_records:read gives the HR file; salary & IBAN additionally need salary:read.
function shapeRecord(row, user) {
  const salaryVisible = can(user, 'salary:read');
  const mask = (v) => (v ? `${'•'.repeat(Math.max(0, String(v).length - 4))}${String(v).slice(-4)}` : null);
  return {
    ...row,
    base_salary: salaryVisible ? row.base_salary : null,
    allowances: salaryVisible ? row.allowances : null,
    bank_iban: salaryVisible ? row.bank_iban : mask(row.bank_iban),
    salaryVisible,
  };
}

const RECORD_SQL = `SELECT u.id, u.full_name, u.username, u.email, u.job_title, u.status, d.name AS department,
  p.employee_no, p.phone, p.extension, p.hire_date, p.birth_date, p.gender, p.national_id, p.address, p.emergency_contact,
  p.contract_type, p.grade, p.base_salary, p.allowances, p.bank_iban, p.annual_leave_days
  FROM users u JOIN employee_profiles p ON p.user_id = u.id LEFT JOIN departments d ON d.id = u.department_id`;

router.get('/records', requirePermission('hr_records:read'), (req, res) => {
  const rows = db.all(`${RECORD_SQL} ORDER BY u.department_id, p.employee_no`);
  res.json({ salaryVisible: can(req.user, 'salary:read'), canUpdate: can(req.user, 'hr_records:update'), rows: rows.map((r) => shapeRecord(r, req.user)) });
});

router.get('/records/:id', requirePermission('hr_records:read'), (req, res) => {
  const row = db.get(`${RECORD_SQL} WHERE u.id = ?`, Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'غير موجود' });
  // Reading a personnel file is itself a sensitive event.
  audit.log(req, { action: 'hr_record.view', targetType: 'user', targetId: row.id, details: { employee: row.username, salaryVisible: can(req.user, 'salary:read') } });
  res.json(shapeRecord(row, req.user));
});

router.patch('/records/:id', requirePermission('hr_records:update'), (req, res) => {
  const row = db.get('SELECT user_id FROM employee_profiles WHERE user_id = ?', Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'غير موجود' });
  const allowed = ['phone', 'extension', 'address', 'emergency_contact', 'contract_type', 'grade'];
  if (can(req.user, 'salary:read')) allowed.push('base_salary', 'allowances', 'bank_iban');
  const tried = Object.keys(req.body || {});
  const blocked = tried.filter((k) => !allowed.includes(k));
  if (blocked.length) return deny(req, res, 'تعديل الحقول المالية يتطلب صلاحية رؤية الرواتب', { required: ['salary:read'], details: { fields: blocked } });
  if (!tried.length) return res.status(400).json({ error: 'لا توجد تغييرات' });
  db.raw.prepare(`UPDATE employee_profiles SET ${tried.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(...tried.map((k) => req.body[k]), row.user_id);
  audit.log(req, { action: 'hr_record.update', targetType: 'user', targetId: row.user_id, details: { fields: tried } });
  res.json({ message: 'تم الحفظ' });
});

// =============================== Leave ===============================
const LEAVE_READ = ['leave:read:own', 'leave:read:department', 'leave:read:all'];

function leaveBalance(userId) {
  const year = today().slice(0, 4);
  const p = db.get('SELECT annual_leave_days FROM employee_profiles WHERE user_id = ?', userId);
  const used = db.get(`SELECT COALESCE(SUM(days),0) n FROM leave_requests WHERE user_id = ? AND type = 'annual' AND status = 'approved' AND substr(start_date,1,4) = ?`, userId, year).n;
  const pending = db.get(`SELECT COALESCE(SUM(days),0) n FROM leave_requests WHERE user_id = ? AND type = 'annual' AND status = 'pending'`, userId).n;
  const entitled = p?.annual_leave_days ?? 24;
  return { entitled, used, pending, remaining: entitled - used - pending };
}

/** Can `user` approve/reject this request? Returns null if yes, otherwise the reason. */
function leaveDecisionBlock(user, r) {
  if (r.status !== 'pending') return 'الطلب ليس قيد الانتظار';
  if (r.user_id === user.id) return 'لا يمكنك اعتماد طلب إجازتك بنفسك (فصل المهام)';
  if (can(user, 'leave:approve:all')) return null;
  if (can(user, 'leave:approve:department') && r.department_id === user.department_id) return null;
  if (can(user, 'leave:approve:department')) return 'يمكنك اعتماد إجازات موظفي قسمك فقط';
  return 'ليس لديك صلاحية اعتماد الإجازات';
}

router.get('/leave', requireAny(...LEAVE_READ, 'leave:create'), (req, res) => {
  const scopes = scopesOf(req.user, 'leave:read');
  const scope = resolveScope(req.user, 'leave:read', req.query.scope);
  const where = scope ? scopeWhere(scope, req.user, 'l.user_id', 'u.department_id') : { sql: '0', params: [] };
  const params = [...where.params];
  let extra = '';
  if (['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status)) { extra = ' AND l.status = ?'; params.push(req.query.status); }
  const rows = db.raw.prepare(
    `SELECT l.*, u.full_name AS employee, u.username, u.department_id, d.name AS department, r.full_name AS reviewer
     FROM leave_requests l JOIN users u ON u.id = l.user_id LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN users r ON r.id = l.reviewed_by
     WHERE ${where.sql}${extra} ORDER BY CASE l.status WHEN 'pending' THEN 0 ELSE 1 END, l.start_date DESC`,
  ).all(...params);
  res.json({
    scope, scopes,
    canCreate: can(req.user, 'leave:create'),
    balance: leaveBalance(req.user.id),
    rows: rows.map((r) => {
      const block = leaveDecisionBlock(req.user, r);
      const canReview = can(req.user, 'leave:approve:all') || can(req.user, 'leave:approve:department');
      return {
        ...r,
        _actions: [
          ...(!block ? ['approve', 'reject'] : []),
          ...(r.user_id === req.user.id && r.status === 'pending' ? ['cancel'] : []),
        ],
        _note: block && canReview && r.status === 'pending' ? block : null,
      };
    }),
  });
});

router.post('/leave', requirePermission('leave:create'), (req, res) => {
  const { type, startDate, endDate, reason } = req.body || {};
  if (!['annual', 'sick', 'emergency', 'unpaid'].includes(type)) return res.status(400).json({ error: 'نوع الإجازة غير صالح' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '') || endDate < startDate) {
    return res.status(400).json({ error: 'التواريخ غير صالحة' });
  }
  let days = 0;
  for (let d = new Date(`${startDate}T00:00:00Z`); d <= new Date(`${endDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (![5, 6].includes(d.getUTCDay())) days++;
  }
  if (!days) return res.status(400).json({ error: 'الفترة تقع بالكامل في عطلة نهاية الأسبوع' });
  if (type === 'annual' && leaveBalance(req.user.id).remaining < days) return res.status(400).json({ error: 'رصيد الإجازات السنوية غير كافٍ' });
  const { lastInsertRowid } = db.run('INSERT INTO leave_requests (user_id, type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?)',
    req.user.id, type, startDate, endDate, days, String(reason || '').slice(0, 300));
  audit.log(req, { action: 'leave.request', targetType: 'leave', targetId: lastInsertRowid, details: { type, days } });
  res.status(201).json({ id: Number(lastInsertRowid), days });
});

router.post('/leave/:id/decision', requireAny('leave:approve:department', 'leave:approve:all'), (req, res) => {
  const r = db.get('SELECT l.*, u.department_id, u.username FROM leave_requests l JOIN users u ON u.id = l.user_id WHERE l.id = ?', Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود' });
  const block = leaveDecisionBlock(req.user, r);
  if (block) return deny(req, res, block, { target: { type: 'leave', id: r.id }, details: { employee: r.username } });
  const decision = req.body?.decision === 'approve' ? 'approved' : 'rejected';
  db.run('UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?',
    decision, req.user.id, nowSql(), String(req.body?.note || '').slice(0, 200) || null, r.id);
  audit.log(req, { action: decision === 'approved' ? 'leave.approve' : 'leave.reject', targetType: 'leave', targetId: r.id, details: { employee: r.username, days: r.days } });
  res.json({ message: decision === 'approved' ? 'تم اعتماد الإجازة' : 'تم رفض الطلب' });
});

router.post('/leave/:id/cancel', requirePermission('leave:create'), (req, res) => {
  const r = db.get('SELECT * FROM leave_requests WHERE id = ?', Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (r.user_id !== req.user.id) return deny(req, res, 'لا يمكنك إلغاء طلب موظف آخر', { target: { type: 'leave', id: r.id } });
  if (r.status !== 'pending') return res.status(400).json({ error: 'لا يمكن إلغاء طلب تمت معالجته' });
  db.run("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", r.id);
  audit.log(req, { action: 'leave.cancel', targetType: 'leave', targetId: r.id });
  res.json({ message: 'تم إلغاء الطلب' });
});

// =============================== Payroll ===============================
router.get('/payroll/mine', requirePermission('payroll:read:own'), (req, res) => {
  res.json(db.all(
    `SELECT r.period, r.status, s.base, s.allowances, s.overtime, s.deductions, s.tax, s.net
     FROM payslips s JOIN payroll_runs r ON r.id = s.run_id
     WHERE s.user_id = ? AND r.status IN ('approved','paid') ORDER BY r.period DESC`, req.user.id,
  ));
});

function runActions(user, run) {
  if (run.status !== 'draft') return { actions: [], note: null };
  if (!can(user, 'payroll:approve')) return { actions: [], note: can(user, 'payroll:prepare') ? 'بانتظار اعتماد المدير المالي' : null };
  if (run.prepared_by === user.id) return { actions: [], note: 'لا يمكنك اعتماد مسيّر أعددته بنفسك' };
  return { actions: ['approve'], note: null };
}

router.get('/payroll/runs', requirePermission('payroll:read'), (req, res) => {
  const runs = db.all(
    `SELECT r.*, p.full_name AS prepared_by_name, a.full_name AS approved_by_name,
            COUNT(s.id) AS employees, SUM(s.base + s.allowances + s.overtime) AS gross, SUM(s.net) AS net
     FROM payroll_runs r LEFT JOIN payslips s ON s.run_id = r.id
     LEFT JOIN users p ON p.id = r.prepared_by LEFT JOIN users a ON a.id = r.approved_by
     GROUP BY r.id ORDER BY r.period DESC`,
  );
  res.json(runs.map((r) => { const x = runActions(req.user, r); return { ...r, _actions: x.actions, _note: x.note }; }));
});

router.get('/payroll/runs/:id', requirePermission('payroll:read'), (req, res) => {
  const run = db.get('SELECT * FROM payroll_runs WHERE id = ?', Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'غير موجود' });
  const slips = db.all(
    `SELECT s.*, u.full_name, d.name AS department, p.employee_no FROM payslips s JOIN users u ON u.id = s.user_id
     LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN employee_profiles p ON p.user_id = u.id
     WHERE s.run_id = ? ORDER BY u.department_id, p.employee_no`, run.id,
  );
  audit.log(req, { action: 'payroll.view', targetType: 'payroll', targetId: run.period });
  res.json({ run, slips });
});

router.post('/payroll/runs/:id/approve', requirePermission('payroll:approve'), (req, res) => {
  const run = db.get('SELECT * FROM payroll_runs WHERE id = ?', Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'غير موجود' });
  if (run.status !== 'draft') return res.status(400).json({ error: 'المسيّر معتمد مسبقاً' });
  if (run.prepared_by === req.user.id) return deny(req, res, 'لا يمكنك اعتماد مسيّر أعددته بنفسك (فصل المهام)', { target: { type: 'payroll', id: run.period } });
  db.run("UPDATE payroll_runs SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?", req.user.id, nowSql(), run.id);
  audit.log(req, { action: 'payroll.approve', targetType: 'payroll', targetId: run.period });
  res.json({ message: 'تم اعتماد مسيّر الرواتب' });
});

module.exports = router;
