// Audit trail: every security-relevant event is written here
// (who, what, on which target, result, from where, when).
const db = require('../db/database');

function clientIp(req) {
  return (req?.ip || req?.socket?.remoteAddress || '').replace(/^::ffff:/, '') || null;
}

function log(req, { action, status = 'success', actor, targetType = null, targetId = null, details = null }) {
  const who = actor ?? req?.user ?? null;
  db.run(
    `INSERT INTO audit_logs (actor_id, actor_username, action, target_type, target_id, status, ip_address, user_agent, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    who?.id ?? null,
    who?.username ?? null,
    action,
    targetType,
    targetId == null ? null : String(targetId),
    status,
    clientIp(req),
    req?.get?.('user-agent')?.slice(0, 255) ?? null,
    details ? JSON.stringify(details) : null,
  );
}

module.exports = { log, clientIp };
