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

-- =====================================================================
-- Business content protected by IAM (the "resources" that roles control)
-- =====================================================================

-- HR: extended employee record. Sensitive columns (salary, IBAN, national id)
-- are filtered per field according to the caller's permissions.
CREATE TABLE IF NOT EXISTS employee_profiles (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_no        TEXT NOT NULL UNIQUE,
  phone              TEXT,
  extension          TEXT,
  hire_date          TEXT,
  birth_date         TEXT,
  gender             TEXT CHECK (gender IN ('male','female')),
  national_id        TEXT,
  address            TEXT,
  emergency_contact  TEXT,
  contract_type      TEXT,
  grade              TEXT,
  base_salary        INTEGER,              -- IQD / month
  allowances         INTEGER,
  bank_iban          TEXT,
  annual_leave_days  INTEGER NOT NULL DEFAULT 24
);

CREATE TABLE IF NOT EXISTS announcements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  department_id  INTEGER REFERENCES departments(id) ON DELETE CASCADE, -- NULL = everyone
  pinned         INTEGER NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('annual','sick','emergency','unpaid')),
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  days         INTEGER NOT NULL,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TEXT,
  review_note  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period       TEXT NOT NULL UNIQUE,                 -- YYYY-MM
  status       TEXT NOT NULL CHECK (status IN ('draft','approved','paid')),
  prepared_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payslips (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base        INTEGER NOT NULL,
  allowances  INTEGER NOT NULL,
  overtime    INTEGER NOT NULL DEFAULT 0,
  deductions  INTEGER NOT NULL,       -- social security 5%
  tax         INTEGER NOT NULL,
  net         INTEGER NOT NULL,
  UNIQUE (run_id, user_id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       TEXT NOT NULL UNIQUE,
  vendor       TEXT NOT NULL,
  description  TEXT NOT NULL,
  amount       INTEGER NOT NULL,                     -- IQD
  due_date     TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expense_claims (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN ('transport','hospitality','training','equipment','telecom')),
  amount        INTEGER NOT NULL,
  description   TEXT NOT NULL,
  expense_date  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TEXT,
  review_note   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  sector              TEXT,
  city                TEXT,
  contact_name        TEXT,
  phone               TEXT,
  email               TEXT,
  account_manager_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  value           INTEGER NOT NULL,                  -- IQD
  stage           TEXT NOT NULL CHECK (stage IN ('lead','proposal','negotiation','won','lost')),
  owner_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expected_close  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       TEXT NOT NULL UNIQUE,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  subject      TEXT NOT NULL,
  description  TEXT,
  priority     TEXT NOT NULL CHECK (priority IN ('low','medium','high','urgent')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tag            TEXT NOT NULL UNIQUE,
  type           TEXT NOT NULL CHECK (type IN ('laptop','desktop','phone','monitor','server','network','printer')),
  model          TEXT NOT NULL,
  serial         TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('in_use','in_stock','repair','retired')),
  assigned_to    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  location       TEXT,
  purchase_date  TEXT,
  warranty_end   TEXT
);

CREATE INDEX IF NOT EXISTS idx_leave_user     ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_user   ON expense_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner    ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assign ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_assets_user    ON assets(assigned_to);
