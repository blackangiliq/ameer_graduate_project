// Authentication & authorization middleware (Policy Enforcement Point).
const db = require('../db/database');
const tokens = require('../services/tokens');
const rbac = require('../services/rbac');
const audit = require('../services/audit');

/**
 * authenticate: "who are you?"
 * 1. reads the Bearer JWT, verifies signature + expiry
 * 2. checks the session still exists and is not revoked (so logout / admin revoke works instantly)
 * 3. checks the account is still active
 * 4. loads roles & permissions FRESH from the DB on every request
 *    (removing a role takes effect immediately, not after the token expires)
 */
function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'غير مصادق: الرجاء تسجيل الدخول', code: 'NO_TOKEN' });

  let payload;
  try {
    payload = tokens.verifyAccessToken(token);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      error: expired ? 'انتهت صلاحية الجلسة' : 'رمز وصول غير صالح',
      code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    });
  }

  const session = tokens.getActiveSession(payload.sid);
  if (!session || String(session.user_id) !== payload.sub) {
    return res.status(401).json({ error: 'تم إنهاء هذه الجلسة', code: 'SESSION_REVOKED' });
  }

  const user = db.get(
    'SELECT id, username, email, full_name, department_id, status, must_change_password, mfa_enabled FROM users WHERE id = ?',
    Number(payload.sub),
  );
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'الحساب غير مفعّل', code: 'ACCOUNT_INACTIVE' });
  }

  user.roles = rbac.getUserRoles(user.id);
  user.permissions = rbac.getUserPermissions(user.id);
  req.user = user;
  req.session = session;
  next();
}

/**
 * Users created by an admin (or reset by IT) get a temporary password and must
 * change it before using anything else.
 */
function requirePasswordChanged(req, res, next) {
  if (req.user?.must_change_password) {
    return res.status(403).json({ error: 'يجب تغيير كلمة المرور المؤقتة أولاً', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

/**
 * authorize: "are you allowed to do this?"
 * Deny by default. Every denial is written to the audit log.
 */
function requirePermission(...needed) {
  return (req, res, next) => {
    const has = new Set(req.user?.permissions || []);
    const missing = needed.filter((p) => !has.has(p));
    if (missing.length === 0) return next();
    audit.log(req, {
      action: 'access.denied',
      status: 'denied',
      targetType: 'endpoint',
      targetId: `${req.method} ${req.baseUrl}${req.path}`,
      details: { required: needed, missing },
    });
    return res.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء', code: 'FORBIDDEN', required: missing });
  };
}

/**
 * requireAny: at least ONE of the listed permissions. Used for screens that have
 * several data scopes (e.g. leave:read:own OR leave:read:department OR leave:read:all);
 * the route then narrows the data to the widest scope the user holds.
 */
function requireAny(...options) {
  return (req, res, next) => {
    const has = new Set(req.user?.permissions || []);
    if (options.some((p) => has.has(p))) return next();
    audit.log(req, {
      action: 'access.denied', status: 'denied', targetType: 'endpoint',
      targetId: `${req.method} ${req.baseUrl}${req.path}`, details: { requiredAnyOf: options },
    });
    return res.status(403).json({ error: 'ليس لديك صلاحية للوصول إلى هذه الوحدة', code: 'FORBIDDEN', required: options });
  };
}

module.exports = { authenticate, requirePasswordChanged, requirePermission, requireAny };
