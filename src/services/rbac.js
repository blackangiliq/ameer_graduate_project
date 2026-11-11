// Role-Based Access Control: user -> roles -> permissions.
const db = require('../db/database');

function getUserRoles(userId) {
  return db.all(
    `SELECT r.id, r.name, r.label FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? ORDER BY r.id`, userId,
  );
}

// Effective permissions = union of the permissions of all the user's roles.
function getUserPermissions(userId) {
  return db.all(
    `SELECT DISTINCT p.name FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = ? ORDER BY p.name`, userId,
  ).map((r) => r.name);
}

function getRolePermissions(roleId) {
  return db.all(
    `SELECT p.name FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ? ORDER BY p.name`, roleId,
  ).map((r) => r.name);
}

module.exports = { getUserRoles, getUserPermissions, getRolePermissions };
