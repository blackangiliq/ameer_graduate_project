// Builds the application shell (sidebar + header) for protected pages.
// The menu is generated from the user's permissions: a user only SEES what
// they are allowed to use. (The server still checks every request – hiding a
// link is UX, not security.)
const ICONS = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  announcements: 'M18 11v2h4v-2h-4Zm-2 6.6 3.2 2.4 1.2-1.6-3.2-2.4-1.2 1.6ZM20.4 5.6 19.2 4 16 6.4l1.2 1.6 3.2-2.4ZM4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v4h2v-4h1l5 3V6L8 9H4Zm11.5 3A4.5 4.5 0 0 0 13 8v8a4.5 4.5 0 0 0 2.5-4Z',
  directory: 'M20 0H4v2h16V0ZM4 24h16v-2H4v2ZM20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm-8 2.8A2.2 2.2 0 1 1 9.8 9 2.2 2.2 0 0 1 12 6.8ZM17 17H7v-1.5c0-1.7 3.3-2.5 5-2.5s5 .8 5 2.5V17Z',
  leave: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 16H5V10h14v10Zm-7-8h5v5h-5v-5Z',
  records: 'M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm-5 3a2 2 0 1 1-2 2 2 2 0 0 1 2-2Zm4 8h-8v-1c0-1.3 2.7-2 4-2s4 .7 4 2v1Z',
  payroll: 'M11.8 10.9c-2.3-.6-3-1.2-3-2.1 0-1.1 1-1.9 2.7-1.9 1.8 0 2.4.8 2.5 2.1h2.2a4 4 0 0 0-3.2-3.8V3h-3v2.2C8.1 5.6 6.6 6.8 6.6 8.8c0 2.3 1.9 3.5 4.8 4.2 2.6.6 3.1 1.5 3.1 2.5 0 .7-.5 1.9-2.7 1.9-2.1 0-2.9-.9-3-2.1H6.6c.1 2.2 1.8 3.5 3.7 3.9V21h3v-2.1c2-.4 3.5-1.5 3.5-3.6 0-2.8-2.4-3.8-5-4.4Z',
  invoices: 'M18 17H6v-2h12v2Zm0-4H6v-2h12v2Zm0-4H6V7h12v2ZM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20Z',
  expenses: 'M21 18v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9Zm-9-2h10V8H12v8Zm4-2.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5Z',
  customers: 'M12 7V3H2v18h20V7H12ZM6 19H4v-2h2v2Zm0-4H4v-2h2v2Zm0-4H4V9h2v2Zm0-4H4V5h2v2Zm4 12H8v-2h2v2Zm0-4H8v-2h2v2Zm0-4H8V9h2v2Zm0-4H8V5h2v2Zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10Zm-2-8h-2v2h2v-2Zm0 4h-2v2h2v-2Z',
  deals: 'M16 6l2.3 2.3-4.9 4.9-4-4L2 16.6 3.4 18l6-6 4 4 6.3-6.3L22 12V6h-6Z',
  tickets: 'M22 10V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4a2 2 0 0 1 0 4v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 1 0-4Zm-9 7.5h-2v-2h2v2Zm0-4.5h-2v-2h2v2Zm0-4.5h-2v-2h2v2Z',
  assets: 'M20 18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2H0v2h24v-2h-4ZM4 6h16v10H4V6Z',
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  users: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 1c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4ZM8 14c-.3 0-.7 0-1.1.1A5 5 0 0 1 9 17v3H1v-2.5C1 15.2 5.7 14 8 14Z',
  roles: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6Z',
  audit: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Z',
  sessions: 'M4 6h16v10H4V6Zm-2 12h20v2H2v-2ZM2 4v14h20V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
  resources: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z',
  profile: 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5Z',
};

const NAV = [
  { href: '/home', key: 'home', label: 'الرئيسية', perm: null },
  { href: '/announcements', key: 'announcements', label: 'الإعلانات', perm: 'announcements:read' },
  { href: '/directory', key: 'directory', label: 'دليل الموظفين', perm: 'directory:read' },
  { group: 'الموارد البشرية' },
  { href: '/leave', key: 'leave', label: 'الإجازات', perm: ['leave:create', 'leave:read:own', 'leave:read:department', 'leave:read:all'] },
  { href: '/hr-records', key: 'records', label: 'ملفات الموظفين', perm: 'hr_records:read' },
  { href: '/payroll', key: 'payroll', label: 'الرواتب', perm: ['payroll:read:own', 'payroll:read'] },
  { group: 'المالية' },
  { href: '/invoices', key: 'invoices', label: 'فواتير الموردين', perm: 'invoices:read' },
  { href: '/expenses', key: 'expenses', label: 'المصروفات', perm: ['expenses:read:own', 'expenses:read:all'] },
  { group: 'المبيعات وخدمة العملاء' },
  { href: '/customers', key: 'customers', label: 'العملاء', perm: 'customers:read' },
  { href: '/deals', key: 'deals', label: 'الصفقات', perm: ['deals:read:own', 'deals:read:all'] },
  { href: '/tickets', key: 'tickets', label: 'تذاكر الدعم', perm: 'tickets:read' },
  { group: 'تقنية المعلومات' },
  { href: '/assets', key: 'assets', label: 'الأجهزة والأصول', perm: ['assets:read:own', 'assets:read:all'] },
  { href: '/resources', key: 'resources', label: 'مكتبة المستندات', perm: null },
  { group: 'إدارة الهوية والوصول' },
  { href: '/dashboard', key: 'dashboard', label: 'لوحة المراقبة الأمنية', perm: 'dashboard:view' },
  { href: '/users', key: 'users', label: 'المستخدمون ودورة الحياة', perm: 'users:read' },
  { href: '/roles', key: 'roles', label: 'الأدوار والصلاحيات', perm: 'roles:read' },
  { href: '/sessions', key: 'sessions', label: 'الجلسات النشطة', perm: null },
  { href: '/audit', key: 'audit', label: 'سجل التدقيق', perm: 'audit:read' },
  { group: 'حسابي' },
  { href: '/profile', key: 'profile', label: 'حسابي والأمان', perm: null },
];

const icon = (k) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ICONS[k]}"/></svg>`;

async function bootPage() {
  const page = document.body.dataset.page;
  const neededRaw = document.body.dataset.permission || '';
  const needed = neededRaw.includes(',') ? neededRaw.split(',') : (neededRaw || null);
  const main = document.getElementById('main');

  // 1) Silent refresh: exchange the HttpOnly cookie for an access token.
  const session = await Api.refresh();
  if (!session) {
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    return;
  }
  // 2) Load identity, roles and effective permissions.
  let me;
  try {
    me = await Api.get('/api/auth/me');
  } catch {
    return;
  }
  if (me.user.mustChangePassword) { location.href = '/change-password'; return; }
  window.ME = me;
  const can = (p) => !p || (Array.isArray(p) ? p.some((x) => me.permissions.includes(x)) : me.permissions.includes(p));

  // 3) Build the shell.
  const links = NAV.filter((n) => n.group || can(n.perm));
  const cleaned = links.filter((n, i) => !n.group || (links[i + 1] && !links[i + 1].group));
  const shell = document.createElement('div');
  shell.className = 'shell';
  shell.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><img class="logo" src="/img/logo.svg" alt=""><div>IAM Gateway<small>شركة الرافدين للحلول التقنية</small></div></div>
      <nav class="nav">${cleaned.map((n) => n.group
        ? `<div class="group">${n.group}</div>`
        : `<a href="${n.href}" class="${n.key === page ? 'active' : ''}">${icon(n.key)}<span>${n.label}</span></a>`).join('')}
      </nav>
      <div class="me">
        <b>${UI.esc(me.user.fullName)}</b>
        <span class="mono">${UI.esc(me.user.username)}</span>
        <div class="chips" style="margin-top:6px">${me.roles.filter((r) => r.name !== 'employee' || me.roles.length === 1).map((r) => `<span class="badge b-role" style="background:rgba(255,255,255,.08);color:#dfe5f2;border-color:transparent">${UI.esc(r.label)}</span>`).join('')}</div>
        <button class="btn" id="logoutBtn" type="button">تسجيل الخروج</button>
      </div>
    </aside>`;
  document.body.prepend(shell);
  shell.appendChild(main);
  main.hidden = false;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    location.href = '/login?logged_out=1';
  });

  // 4) Page-level authorization.
  if (!can(needed)) {
    main.innerHTML = `<div class="card forbidden"><div class="code">403</div><h2>غير مصرّح بالوصول</h2>
      <p>هذه الصفحة تتطلب ${Array.isArray(needed) ? 'إحدى الصلاحيات' : 'الصلاحية'} ${[].concat(needed).map((p) => `<span class="badge b-perm">${UI.esc(p)}</span>`).join(' ')} وهي غير موجودة ضمن أدوارك.</p>
      <p class="muted">تم تسجيل محاولة الوصول في سجل التدقيق.</p></div>`;
    // Touch the protected API so the server records the denied attempt.
    const probe = document.body.dataset.probe || { 'users:read': '/api/users', 'roles:read': '/api/roles', 'audit:read': '/api/audit', 'dashboard:view': '/api/dashboard/stats' }[needed];
    if (probe) Api.get(probe).catch(() => {});
    return;
  }
  document.dispatchEvent(new CustomEvent('app:ready', { detail: me }));
}

document.addEventListener('DOMContentLoaded', bootPage);
