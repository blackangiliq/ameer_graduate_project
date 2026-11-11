// Builds the application shell (sidebar + header) for protected pages.
// The menu is generated from the user's permissions: a user only SEES what
// they are allowed to use. (The server still checks every request – hiding a
// link is UX, not security.)
const ICONS = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  users: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 1c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4ZM8 14c-.3 0-.7 0-1.1.1A5 5 0 0 1 9 17v3H1v-2.5C1 15.2 5.7 14 8 14Z',
  roles: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6Z',
  audit: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Z',
  sessions: 'M4 6h16v10H4V6Zm-2 12h20v2H2v-2ZM2 4v14h20V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
  resources: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z',
  profile: 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5Z',
};

const NAV = [
  { group: 'المراقبة' },
  { href: '/dashboard', key: 'dashboard', label: 'لوحة المراقبة الأمنية', perm: 'dashboard:view' },
  { group: 'إدارة الهوية والوصول' },
  { href: '/users', key: 'users', label: 'المستخدمون ودورة الحياة', perm: 'users:read' },
  { href: '/roles', key: 'roles', label: 'الأدوار والصلاحيات', perm: 'roles:read' },
  { href: '/sessions', key: 'sessions', label: 'الجلسات النشطة', perm: null },
  { href: '/audit', key: 'audit', label: 'سجل التدقيق', perm: 'audit:read' },
  { group: 'مساحة العمل' },
  { href: '/resources', key: 'resources', label: 'موارد المؤسسة', perm: null },
  { href: '/profile', key: 'profile', label: 'حسابي والأمان', perm: null },
];

const icon = (k) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ICONS[k]}"/></svg>`;

async function bootPage() {
  const page = document.body.dataset.page;
  const needed = document.body.dataset.permission || null;
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
  const can = (p) => !p || me.permissions.includes(p);

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
      <p>هذه الصفحة تتطلب الصلاحية <span class="badge b-perm">${UI.esc(needed)}</span> وهي غير موجودة ضمن أدوارك.</p>
      <p class="muted">تم تسجيل محاولة الوصول في سجل التدقيق.</p></div>`;
    // Touch the protected API so the server records the denied attempt.
    const probe = { 'users:read': '/api/users', 'roles:read': '/api/roles', 'audit:read': '/api/audit', 'dashboard:view': '/api/dashboard/stats' }[needed];
    if (probe) Api.get(probe).catch(() => {});
    return;
  }
  document.dispatchEvent(new CustomEvent('app:ready', { detail: me }));
}

document.addEventListener('DOMContentLoaded', bootPage);
