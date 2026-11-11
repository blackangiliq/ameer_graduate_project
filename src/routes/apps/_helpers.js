// Shared authorization helpers for the business modules.
//
// Three layers decide what a user gets from a module:
//   1. Permission  (RBAC)      – may the user call this action at all?        leave:approve:department
//   2. Scope       (data)      – which rows?  own  <  department  <  all       leave:read:own / :department / :all
//   3. Business rule (context) – is THIS row allowed? not your own request, amount under your limit, ...
// Every rule failure is answered with 403 and written to the audit log.
const audit = require('../../services/audit');

const SCOPE_ORDER = ['all', 'department', 'own'];

const can = (user, permission) => user.permissions.includes(permission);

/** Widest scope the user holds for a permission family, e.g. scopeOf(user, 'leave:read') -> 'department'. */
function scopeOf(user, base) {
  return SCOPE_ORDER.find((s) => can(user, `${base}:${s}`)) || null;
}

/** Every scope the user may switch between, widest first. */
function scopesOf(user, base) {
  return SCOPE_ORDER.filter((s) => can(user, `${base}:${s}`));
}

/** Pick the scope requested in ?scope= if the user holds it, otherwise the widest one. */
function resolveScope(user, base, requested) {
  const allowed = scopesOf(user, base);
  return allowed.includes(requested) ? requested : allowed[0] || null;
}

/** SQL fragment restricting rows to a scope. `userCol` = owner column, `deptCol` = owner's department column. */
function scopeWhere(scope, user, userCol, deptCol) {
  if (scope === 'all') return { sql: '1 = 1', params: [] };
  if (scope === 'department') return { sql: `${deptCol} = ?`, params: [user.department_id] };
  return { sql: `${userCol} = ?`, params: [user.id] };
}

/** Business-rule denial: 403 + audit entry with the reason. */
function deny(req, res, reason, { target, required = [], details = {} } = {}) {
  audit.log(req, {
    action: 'access.denied', status: 'denied',
    targetType: target?.type ?? 'endpoint', targetId: target?.id ?? `${req.method} ${req.baseUrl}${req.path}`,
    details: { reason, required, ...details },
  });
  return res.status(403).json({ error: reason, code: 'FORBIDDEN', required });
}

const today = () => new Date().toISOString().slice(0, 10);
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

module.exports = { can, scopeOf, scopesOf, resolveScope, scopeWhere, deny, today, nowSql };
