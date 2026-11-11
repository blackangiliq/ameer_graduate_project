// Personal home page: "my work" built only from what the caller is authorised to see.
const express = require('express');
const db = require('../../db/database');
const { can } = require('./_helpers');

const router = express.Router();

router.get('/home', (req, res) => {
  const u = req.user;
  const one = (sql, ...p) => db.get(sql, ...p).n;
  const tasks = [];
  const add = (key, label, count, href) => { if (count > 0) tasks.push({ key, label, count, href }); };

  // Approvals waiting for ME – each counted with the same rules the API enforces.
  if (can(u, 'leave:approve:all')) {
    add('leave', 'طلبات إجازة بانتظار اعتمادك', one("SELECT COUNT(*) n FROM leave_requests WHERE status = 'pending' AND user_id != ?", u.id), '/leave?scope=all&status=pending');
  } else if (can(u, 'leave:approve:department')) {
    add('leave', 'طلبات إجازة من قسمك بانتظار اعتمادك', one(`SELECT COUNT(*) n FROM leave_requests l JOIN users x ON x.id = l.user_id
      WHERE l.status = 'pending' AND l.user_id != ? AND x.department_id = ?`, u.id, u.department_id), '/leave?scope=department&status=pending');
  }
  if (can(u, 'invoices:approve')) {
    add('invoices', 'فواتير ضمن حد اعتمادك', one(`SELECT COUNT(*) n FROM invoices WHERE status = 'pending' AND created_by != ? AND (amount <= 10000000 OR ? = 1)`,
      u.id, can(u, 'invoices:approve_unlimited') ? 1 : 0), '/invoices?status=pending');
  }
  if (can(u, 'expenses:approve')) add('expenses', 'طلبات مصروفات للمراجعة', one("SELECT COUNT(*) n FROM expense_claims WHERE status = 'pending' AND user_id != ?", u.id), '/expenses?scope=all');
  if (can(u, 'payroll:approve')) add('payroll', 'مسيّر رواتب بانتظار الاعتماد', one("SELECT COUNT(*) n FROM payroll_runs WHERE status = 'draft' AND prepared_by != ?", u.id), '/payroll');
  if (can(u, 'tickets:work')) add('tickets_mine', 'تذاكر مسندة إليك', one("SELECT COUNT(*) n FROM tickets WHERE assigned_to = ? AND status IN ('open','in_progress')", u.id), '/tickets?view=mine');
  if (can(u, 'tickets:assign')) add('tickets_unassigned', 'تذاكر غير مسندة', one("SELECT COUNT(*) n FROM tickets WHERE assigned_to IS NULL AND status = 'open'"), '/tickets?view=unassigned');
  if (can(u, 'users:disable')) add('accounts', 'حسابات بانتظار الموافقة', one("SELECT COUNT(*) n FROM users WHERE status = 'pending'"), '/users');
  if (can(u, 'users:unlock')) add('locked', 'حسابات مقفلة', one('SELECT COUNT(*) n FROM users WHERE locked_until > ?', new Date().toISOString().replace('T', ' ').slice(0, 19)), '/users');
  if (can(u, 'assets:manage')) add('assets', 'أجهزة لدى موظفين سابقين', one("SELECT COUNT(*) n FROM assets a JOIN users x ON x.id = a.assigned_to WHERE x.status = 'disabled'"), '/assets?scope=all');
  if (can(u, 'deals:read:own') && !can(u, 'deals:read:all')) add('deals', 'صفقاتك المفتوحة', one("SELECT COUNT(*) n FROM deals WHERE owner_id = ? AND stage NOT IN ('won','lost')", u.id), '/deals');

  // Self-service summary
  const year = new Date().toISOString().slice(0, 4);
  const profile = db.get('SELECT annual_leave_days, employee_no, hire_date FROM employee_profiles WHERE user_id = ?', u.id);
  const usedLeave = one(`SELECT COALESCE(SUM(days),0) n FROM leave_requests WHERE user_id = ? AND type='annual' AND status='approved' AND substr(start_date,1,4) = ?`, u.id, year);
  const me = {
    employeeNo: profile?.employee_no ?? null,
    leaveRemaining: profile ? profile.annual_leave_days - usedLeave : null,
    leavePending: one("SELECT COUNT(*) n FROM leave_requests WHERE user_id = ? AND status = 'pending'", u.id),
    expensesPending: one("SELECT COUNT(*) n FROM expense_claims WHERE user_id = ? AND status = 'pending'", u.id),
    devices: one("SELECT COUNT(*) n FROM assets WHERE assigned_to = ? AND status = 'in_use'", u.id),
    lastNet: can(u, 'payroll:read:own') ? db.get(`SELECT s.net, r.period FROM payslips s JOIN payroll_runs r ON r.id = s.run_id
      WHERE s.user_id = ? AND r.status IN ('approved','paid') ORDER BY r.period DESC LIMIT 1`, u.id) ?? null : null,
  };

  const announcements = can(u, 'announcements:read') ? db.all(
    `SELECT a.id, a.title, a.body, a.pinned, a.created_at, d.name AS department, x.full_name AS author
     FROM announcements a LEFT JOIN departments d ON d.id = a.department_id LEFT JOIN users x ON x.id = a.created_by
     WHERE a.department_id IS NULL OR a.department_id = ? ORDER BY a.pinned DESC, a.created_at DESC LIMIT 4`, u.department_id,
  ) : [];

  res.json({ tasks, me, announcements });
});

module.exports = router;
