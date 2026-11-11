-- IAM Gateway database schema (SQLite)
-- Identity:        departments, users, password_history
-- Authentication:  sessions, mfa_recovery_codes
-- Authorization:   roles, permissions, role_permissions, user_roles
-- Accountability:  audit_logs
-- Protected data:  resources

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  code        TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name             TEXT NOT NULL,
  job_title             TEXT,
  department_id         INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  password_hash         TEXT NOT NULL,                 -- bcrypt, never plain text
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','active','suspended','disabled')),
  must_change_password  INTEGER NOT NULL DEFAULT 0,
  password_changed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  failed_attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,                          -- temporary lockout (brute force)
  mfa_enabled           INTEGER NOT NULL DEFAULT 0,
  mfa_secret_enc        TEXT,                          -- TOTP secret, AES-256-GCM encrypted
  last_login_at         TEXT,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,          -- machine name, e.g. iam_admin
  label       TEXT NOT NULL,                 -- display name
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0     -- system roles cannot be deleted
);

CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,          -- resource:action, e.g. users:create
  label       TEXT NOT NULL,
  category    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id                 TEXT PRIMARY KEY,                -- random UUID, also the JWT "sid" claim
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,                   -- SHA-256 of the refresh token
  ip_address         TEXT,
  user_agent         TEXT,
  mfa_verified       INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at       TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at         TEXT NOT NULL,
  revoked_at         TEXT,
  revoke_reason      TEXT
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,                           -- SHA-256, single use
  used_at    TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  actor_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT,                                -- kept even if the user is removed
  action         TEXT NOT NULL,                       -- e.g. auth.login, user.create
  target_type    TEXT,
  target_id      TEXT,
  status         TEXT NOT NULL CHECK (status IN ('success','failure','denied')),
  ip_address     TEXT,
  user_agent     TEXT,
  details        TEXT                                 -- JSON
);

CREATE TABLE IF NOT EXISTS resources (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  category       TEXT NOT NULL CHECK (category IN ('public','hr','finance','it')),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  classification TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_status       ON users(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user      ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created      ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor        ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action       ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_pwd_history_user   ON password_history(user_id);
