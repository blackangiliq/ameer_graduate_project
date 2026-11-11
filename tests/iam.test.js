// Automated tests for the IAM flows. Run: npm test
// Each run uses a fresh temporary database (the real data/ folder is untouched).
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iam-test-'));
process.env.DATA_DIR = tmp;
process.env.BCRYPT_COST = '4';          // fast hashing for tests only
process.env.AUTH_RATE_LIMIT = '10000';
process.env.API_RATE_LIMIT = '100000';

const { seed, DEMO_PASSWORD, DEMO_MFA_SECRET, DEMO_RECOVERY_CODES } = require('../src/db/seed');
const totp = require('../src/services/totp');
const db = require('../src/db/database');
const app = require('../src/app');

let server;
let base;

before(async () => {
  await seed({ reset: true });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// Minimal client that keeps the refresh cookie like a browser would.
function client() {
  let cookie = '';
  let token = null;
  async function call(method, url, body) {
    const headers = { 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  return {
    call,
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
    setToken(t) { token = t; },
    async login(username, password = DEMO_PASSWORD) {
      const r = await call('POST', '/api/auth/login', { username, password });
      if (r.data.mfaRequired) {
        const v = await call('POST', '/api/auth/mfa/verify', { challengeToken: r.data.challengeToken, code: totp.generate(DEMO_MFA_SECRET) });
        token = v.data.accessToken;
        return v;
      }
      token = r.data.accessToken;
      return r;
    },
  };
}

describe('TOTP (RFC 6238)', () => {
  test('matches the RFC 6238 SHA-1 test vectors', () => {
    // RFC secret "12345678901234567890" in base32; expected values are the last 6 digits.
    const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
    assert.equal(totp.generate(secret, 59 * 1000), '287082');
    assert.equal(totp.generate(secret, 1111111109 * 1000), '081804');
    assert.equal(totp.generate(secret, 1234567890 * 1000), '005924');
    assert.equal(totp.generate(secret, 2000000000 * 1000), '279037');
  });
  test('accepts ±1 time step and rejects older codes', () => {
    const s = totp.generateSecret();
    const now = Date.now();
    assert.ok(totp.verify(s, totp.generate(s, now - 30000), now));
    assert.ok(!totp.verify(s, totp.generate(s, now - 120000), now));
    assert.ok(!totp.verify(s, 'abcdef', now));
  });
});

describe('Authentication', () => {
  test('passwords are stored as bcrypt hashes, never plain text', () => {
    const row = db.get("SELECT password_hash FROM users WHERE username = 'omar.alani'");
    assert.match(row.password_hash, /^\$2[aby]\$\d{2}\$/);
    assert.ok(!row.password_hash.includes(DEMO_PASSWORD));
  });

  test('valid login returns an access token and an HttpOnly SameSite=Strict refresh cookie', async () => {
    const c = client();
    const r = await c.call('POST', '/api/auth/login', { username: 'omar.alani', password: DEMO_PASSWORD });
    assert.equal(r.status, 200);
    assert.ok(r.data.accessToken);
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  });

  test('unknown user and wrong password give the same generic message', async () => {
    const c = client();
    const a = await c.call('POST', '/api/auth/login', { username: 'nobody.here', password: 'x' });
    const b = await c.call('POST', '/api/auth/login', { username: 'fatima.alrubaie', password: 'WrongPass#123' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.data.error, b.data.error);
    await client().login('fatima.alrubaie'); // reset counter
  });

  test('account locks after 5 failed attempts, even with the right password afterwards', async () => {
    const c = client();
    for (let i = 0; i < 5; i++) await c.call('POST', '/api/auth/login', { username: 'zahraa.alhilli', password: 'Bad#Password1' });
    const r = await c.call('POST', '/api/auth/login', { username: 'zahraa.alhilli', password: DEMO_PASSWORD });
    assert.equal(r.status, 423);
    const ev = db.get("SELECT * FROM audit_logs WHERE action = 'auth.account_locked' AND actor_username = 'zahraa.alhilli'");
    assert.ok(ev, 'lockout is audited');
  });

  test('pending, suspended and disabled accounts cannot log in', async () => {
    for (const [u, code] of [['hiba.alnuaimi', 'ACCOUNT_PENDING'], ['dalia.alazzawi', 'ACCOUNT_SUSPENDED'], ['karrar.alzubaidi', 'ACCOUNT_DISABLED']]) {
      const r = await client().call('POST', '/api/auth/login', { username: u, password: DEMO_PASSWORD });
      assert.equal(r.status, 403);
      assert.equal(r.data.code, code);
    }
  });

  test('MFA users get a challenge instead of a session; wrong code rejected; right code accepted', async () => {
    const c = client();
    const r = await c.call('POST', '/api/auth/login', { username: 'zainab.alobaidi', password: DEMO_PASSWORD });
    assert.equal(r.data.mfaRequired, true);
    assert.equal(r.data.accessToken, undefined);
    const bad = await c.call('POST', '/api/auth/mfa/verify', { challengeToken: r.data.challengeToken, code: '000000' });
    assert.equal(bad.status, 401);
    const ok = await c.call('POST', '/api/auth/mfa/verify', { challengeToken: r.data.challengeToken, code: totp.generate(DEMO_MFA_SECRET) });
    assert.equal(ok.status, 200);
    assert.ok(ok.data.accessToken);
  });

  test('the MFA challenge token cannot be used as an access token', async () => {
    const c = client();
    const r = await c.call('POST', '/api/auth/login', { username: 'laith.alobaidi', password: DEMO_PASSWORD });
    c.setToken(r.data.challengeToken);
    const me = await c.call('GET', '/api/auth/me');
    assert.equal(me.status, 401);
  });

  test('recovery codes work exactly once', async () => {
    const c = client();
    const code = DEMO_RECOVERY_CODES[0];
    const r1 = await c.call('POST', '/api/auth/login', { username: 'ali.alsaadi', password: DEMO_PASSWORD });
    const v1 = await c.call('POST', '/api/auth/mfa/verify', { challengeToken: r1.data.challengeToken, recoveryCode: code });
    assert.equal(v1.status, 200);
    const r2 = await c.call('POST', '/api/auth/login', { username: 'ali.alsaadi', password: DEMO_PASSWORD });
    const v2 = await c.call('POST', '/api/auth/mfa/verify', { challengeToken: r2.data.challengeToken, recoveryCode: code });
    assert.equal(v2.status, 401);
  });

  test('registration enforces the password policy and creates a pending employee', async () => {
    const weak = await client().call('POST', '/api/auth/register', { username: 'test.user', email: 'test.user@x.iq', fullName: 'مستخدم تجريبي', password: 'password123' });
    assert.equal(weak.status, 400);
    assert.ok(weak.data.details.length >= 2);
    const ok = await client().call('POST', '/api/auth/register', { username: 'test.user', email: 'test.user@x.iq', fullName: 'مستخدم تجريبي', password: 'Strong#Pass2026' });
    assert.equal(ok.status, 201);
    const u = db.get("SELECT status FROM users WHERE username = 'test.user'");
    assert.equal(u.status, 'pending');
    const roles = db.all("SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id WHERE u.username = 'test.user'");
    assert.deepEqual(roles.map((r) => r.name), ['employee']);
  });
});

describe('Sessions & tokens', () => {
  test('refresh rotates the token; replaying the old token revokes the whole session', async () => {
    const c = client();
    await c.login('ahmed.albayati');
    const oldCookie = c.cookie;
    const r1 = await c.call('POST', '/api/auth/refresh');
    assert.equal(r1.status, 200);
    assert.notEqual(c.cookie, oldCookie);
    const newCookie = c.cookie;

    // attacker replays the stolen (old) token
    const attacker = client();
    attacker.cookie = oldCookie;
    const r2 = await attacker.call('POST', '/api/auth/refresh');
    assert.equal(r2.status, 401);
    assert.equal(r2.data.code, 'SESSION_REUSE');

    // the legitimate token is now dead as well (session revoked)
    c.cookie = newCookie;
    const r3 = await c.call('POST', '/api/auth/refresh');
    assert.equal(r3.status, 401);
  });

  test('logout revokes the session immediately, even though the JWT has not expired', async () => {
    const c = client();
    await c.login('rusul.alkarkhi');
    assert.equal((await c.call('GET', '/api/auth/me')).status, 200);
    await c.call('POST', '/api/auth/logout');
    const me = await c.call('GET', '/api/auth/me');
    assert.equal(me.status, 401);
    assert.equal(me.data.code, 'SESSION_REVOKED');
  });

  test('tampered JWT is rejected', async () => {
    const c = client();
    const r = await c.login('omar.alani');
    const [h, p, s] = r.data.accessToken.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url'));
    payload.sub = '1'; // try to become the super admin
    c.setToken([h, Buffer.from(JSON.stringify(payload)).toString('base64url'), s].join('.'));
    assert.equal((await c.call('GET', '/api/auth/me')).status, 401);
  });
});

describe('Authorization (RBAC)', () => {
  test('employee is denied admin APIs (403) and the denial is audited', async () => {
    const c = client();
    await c.login('omar.alani');
    const before = db.get("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'access.denied' AND actor_username = 'omar.alani'").n;
    for (const url of ['/api/users', '/api/audit', '/api/roles', '/api/dashboard/stats', '/api/dashboard/resources/finance']) {
      assert.equal((await c.call('GET', url)).status, 403, url);
    }
    const after = db.get("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'access.denied' AND actor_username = 'omar.alani'").n;
    assert.equal(after - before, 5);
    assert.equal((await c.call('GET', '/api/dashboard/resources/public')).status, 200);
  });

  test('each department reads only its own resources', async () => {
    const fin = client(); await fin.login('haider.altamimi');
    assert.equal((await fin.call('GET', '/api/dashboard/resources/finance')).status, 200);
    assert.equal((await fin.call('GET', '/api/dashboard/resources/hr')).status, 403);
    const hr = client(); await hr.login('noor.alhashimi');
    assert.equal((await hr.call('GET', '/api/dashboard/resources/hr')).status, 200);
    assert.equal((await hr.call('GET', '/api/dashboard/resources/finance')).status, 403);
  });

  test('auditor is read-only: can read and export the audit log but cannot change users', async () => {
    const c = client(); await c.login('mustafa.aljubouri');
    assert.equal((await c.call('GET', '/api/audit')).status, 200);
    const csv = await c.call('GET', '/api/audit/export');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.equal((await c.call('PATCH', '/api/users/15/status', { status: 'suspended' })).status, 403);
  });

  test('IAM admin cannot change own roles or touch the super admin (no privilege escalation)', async () => {
    const c = client(); await c.login('zainab.alobaidi');
    const me = (await c.call('GET', '/api/auth/me')).data;
    const superRole = db.get("SELECT id FROM roles WHERE name = 'super_admin'");
    assert.equal((await c.call('PUT', `/api/users/${me.user.id}/roles`, { roleIds: [superRole.id] })).status, 403);
    assert.equal((await c.call('PATCH', '/api/users/1/status', { status: 'suspended' })).status, 403);
    // and cannot edit role policies (separation of duties)
    assert.equal((await c.call('PUT', `/api/roles/${superRole.id + 1}/permissions`, { permissions: ['audit:export'] })).status, 403);
  });

  test('removing a role takes effect on the very next request', async () => {
    const admin = client(); await admin.login('ali.alsaadi');
    const user = client(); await user.login('sara.almusawi');
    assert.equal((await user.call('GET', '/api/dashboard/resources/it')).status, 200);
    const sara = db.get("SELECT id FROM users WHERE username = 'sara.almusawi'");
    const employee = db.get("SELECT id FROM roles WHERE name = 'employee'");
    assert.equal((await admin.call('PUT', `/api/users/${sara.id}/roles`, { roleIds: [employee.id] })).status, 200);
    assert.equal((await user.call('GET', '/api/dashboard/resources/it')).status, 403); // same token, new decision
  });
});

describe('Identity lifecycle (Joiner / Mover / Leaver)', () => {
  test('joiner: admin-created account must change its temporary password first', async () => {
    const admin = client(); await admin.login('zainab.alobaidi');
    const created = await admin.call('POST', '/api/users', { username: 'new.joiner', email: 'new.joiner@alrafidain-tech.iq', fullName: 'موظف جديد', departmentId: 6 });
    assert.equal(created.status, 201);
    const temp = created.data.temporaryPassword;

    const u = client();
    const login = await u.login('new.joiner', temp);
    assert.equal(login.data.mustChangePassword, true);
    assert.equal((await u.call('GET', '/api/dashboard/resources/public')).data.code, 'PASSWORD_CHANGE_REQUIRED');
    const reuse = await u.call('POST', '/api/auth/change-password', { currentPassword: temp, newPassword: temp });
    assert.equal(reuse.status, 400); // cannot reuse
    const ok = await u.call('POST', '/api/auth/change-password', { currentPassword: temp, newPassword: 'Joiner#Pass2026' });
    assert.equal(ok.status, 200);
    assert.equal((await u.call('GET', '/api/dashboard/resources/public')).status, 200);
  });

  test('approving a pending account lets the user log in', async () => {
    const admin = client(); await admin.login('zainab.alobaidi');
    const id = db.get("SELECT id FROM users WHERE username = 'ali.alfatlawi'").id;
    assert.equal((await admin.call('PATCH', `/api/users/${id}/status`, { status: 'active' })).status, 200);
    assert.equal((await client().login('ali.alfatlawi')).status, 200);
  });

  test('leaver: disabling an account kills its live sessions at once', async () => {
    const victim = client(); await victim.login('yasir.alshammari');
    assert.equal((await victim.call('GET', '/api/auth/me')).status, 200);
    const admin = client(); await admin.login('zainab.alobaidi');
    const id = db.get("SELECT id FROM users WHERE username = 'yasir.alshammari'").id;
    await admin.call('PATCH', `/api/users/${id}/status`, { status: 'disabled', reason: 'test' });
    assert.equal((await victim.call('GET', '/api/auth/me')).status, 401);
    assert.equal((await victim.call('POST', '/api/auth/refresh')).status, 401);
  });
});

describe('Security headers', () => {
  test('CSP, frame protection and no-sniff are set', async () => {
    const res = await fetch(`${base}/login`);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});

// =====================================================================
// Business modules: the same IAM layer protecting real content
// =====================================================================
const idOf = (u) => db.get('SELECT id FROM users WHERE username = ?', u).id;

describe('Data scope (own / department / all)', () => {
  test('leave: employee sees only own, manager sees his department, HR sees everyone', async () => {
    const emp = client(); await emp.login('omar.alani');
    const own = (await emp.call('GET', '/api/hr/leave')).data;
    assert.equal(own.scope, 'own');
    assert.ok(own.rows.every((r) => r.user_id === idOf('omar.alani')));
    // asking for a wider scope than you hold silently falls back to your own
    assert.equal((await emp.call('GET', '/api/hr/leave?scope=all')).data.scope, 'own');

    const mgr = client(); await mgr.login('ahmed.albayati');
    const dept = (await mgr.call('GET', '/api/hr/leave')).data;
    assert.equal(dept.scope, 'department');
    const salesDept = db.get("SELECT id FROM departments WHERE code = 'SAL'").id;
    assert.ok(dept.rows.every((r) => r.department_id === salesDept));

    const hr = client(); await hr.login('noor.alhashimi');
    const all = (await hr.call('GET', '/api/hr/leave')).data;
    assert.equal(all.scope, 'all');
    assert.equal(all.rows.length, db.get('SELECT COUNT(*) n FROM leave_requests').n);
  });

  test('deals: a sales rep cannot read or edit a colleague\'s deal', async () => {
    const rep = client(); await rep.login('omar.alani');
    const mine = (await rep.call('GET', '/api/ops/deals')).data;
    assert.ok(mine.rows.every((d) => d.owner_id === idOf('omar.alani')));
    const other = db.get('SELECT id FROM deals WHERE owner_id != ? LIMIT 1', idOf('omar.alani'));
    const r = await rep.call('PATCH', `/api/ops/deals/${other.id}`, { stage: 'won' });
    assert.equal(r.status, 403);
    const own = mine.rows[0];
    assert.equal((await rep.call('PATCH', `/api/ops/deals/${own.id}`, { stage: 'negotiation' })).status, 200);
    // re-assigning even his own deal requires the manager permission
    assert.equal((await rep.call('PATCH', `/api/ops/deals/${own.id}`, { ownerId: idOf('shahad.aljanabi') })).status, 403);
  });
});

describe('Business rules on top of RBAC', () => {
  test('leave: a manager cannot approve his own request or another department\'s', async () => {
    const mgr = client(); await mgr.login('ahmed.albayati');
    const own = db.get("SELECT id FROM leave_requests WHERE user_id = ? AND status = 'pending'", idOf('ahmed.albayati'));
    assert.equal((await mgr.call('POST', `/api/hr/leave/${own.id}/decision`, { decision: 'approve' })).status, 403);
    const foreign = db.get(`SELECT l.id FROM leave_requests l JOIN users u ON u.id = l.user_id
      WHERE l.status = 'pending' AND u.department_id != (SELECT department_id FROM users WHERE username = 'ahmed.albayati')`);
    assert.equal((await mgr.call('POST', `/api/hr/leave/${foreign.id}/decision`, { decision: 'approve' })).status, 403);
    const team = db.get("SELECT id FROM leave_requests WHERE user_id = ? AND status = 'pending'", idOf('omar.alani'));
    assert.equal((await mgr.call('POST', `/api/hr/leave/${team.id}/decision`, { decision: 'approve' })).status, 200);
    // and the employee himself has no approve permission at all
    const emp = client(); await emp.login('omar.alani');
    assert.equal((await emp.call('POST', `/api/hr/leave/${own.id}/decision`, { decision: 'approve' })).status, 403);
  });

  test('invoices: maker-checker and approval limit', async () => {
    const acc = client(); await acc.login('haider.altamimi');
    const ownInv = db.get("SELECT id FROM invoices WHERE status = 'pending' AND created_by = ? AND amount <= 10000000", idOf('haider.altamimi'));
    assert.equal((await acc.call('POST', `/api/finance/invoices/${ownInv.id}/decision`, { decision: 'approve' })).status, 403);
    const big = db.get("SELECT id FROM invoices WHERE status = 'pending' AND created_by != ? AND amount > 10000000", idOf('haider.altamimi'));
    const r = await acc.call('POST', `/api/finance/invoices/${big.id}/decision`, { decision: 'approve' });
    assert.equal(r.status, 403);
    assert.deepEqual(r.data.required, ['invoices:approve_unlimited']);
    const mgr = client(); await mgr.login('hussein.alkhafaji');
    assert.equal((await mgr.call('POST', `/api/finance/invoices/${big.id}/decision`, { decision: 'approve' })).status, 200);
    const ev = db.get("SELECT details FROM audit_logs WHERE action = 'access.denied' AND actor_username = 'haider.altamimi' ORDER BY id DESC LIMIT 1");
    assert.match(ev.details, /10,000,000|يتجاوز/);
  });

  test('payroll: the preparer cannot approve; employees see only their own payslips', async () => {
    const run = db.get("SELECT id FROM payroll_runs WHERE status = 'draft'");
    const acc = client(); await acc.login('haider.altamimi');
    assert.equal((await acc.call('POST', `/api/hr/payroll/runs/${run.id}/approve`)).status, 403);
    const emp = client(); await emp.login('rusul.alkarkhi');
    assert.equal((await emp.call('GET', '/api/hr/payroll/runs')).status, 403);
    const mine = (await emp.call('GET', '/api/hr/payroll/mine')).data;
    assert.ok(mine.length >= 1);
    const mgr = client(); await mgr.login('hussein.alkhafaji');
    assert.equal((await mgr.call('POST', `/api/hr/payroll/runs/${run.id}/approve`)).status, 200);
  });

  test('tickets: an agent cannot close tickets or work on someone else\'s', async () => {
    const agent = client(); await agent.login('fatima.alrubaie');
    const others = db.get("SELECT id FROM tickets WHERE assigned_to IS NOT NULL AND assigned_to != ? AND status IN ('open','in_progress')", idOf('fatima.alrubaie'));
    assert.equal((await agent.call('PATCH', `/api/ops/tickets/${others.id}`, { action: 'resolve' })).status, 403);
    const resolved = db.get("SELECT id FROM tickets WHERE status = 'resolved'");
    assert.equal((await agent.call('PATCH', `/api/ops/tickets/${resolved.id}`, { action: 'close' })).status, 403);
  });
});

describe('Field-level security', () => {
  test('salary and IBAN are hidden without salary:read even when the HR record is readable', async () => {
    const officer = client(); await officer.login('maryam.aldulaimi');
    const r = (await officer.call('GET', '/api/hr/records')).data;
    assert.equal(r.salaryVisible, false);
    assert.ok(r.rows.every((x) => x.base_salary === null && x.bank_iban.startsWith('•')));
    // and cannot write them either
    assert.equal((await officer.call('PATCH', `/api/hr/records/${idOf('omar.alani')}`, { base_salary: 9000000 })).status, 403);

    const manager = client(); await manager.login('noor.alhashimi');
    const m = (await manager.call('GET', '/api/hr/records')).data;
    assert.equal(m.salaryVisible, true);
    assert.ok(m.rows.every((x) => Number.isInteger(x.base_salary)));
  });

  test('announcements targeted at a department are invisible to other departments', async () => {
    const sales = client(); await sales.login('omar.alani');
    const rows = (await sales.call('GET', '/api/hr/announcements')).data.rows;
    const salesId = db.get("SELECT id FROM departments WHERE code = 'SAL'").id;
    assert.ok(rows.every((a) => a.department_id === null || a.department_id === salesId));
    assert.ok(rows.some((a) => a.department_id === salesId));
  });
});
