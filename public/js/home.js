document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  const h = await Api.get('/api/portal/home');
  const first = me.user.fullName.split(' ')[0];
  document.querySelector('.page-head h1').textContent = `مرحباً، ${first}`;

  const kpi = (label, value) => `<div class="card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  $('#me').innerHTML = [
    kpi('الرقم الوظيفي', `<span class="mono" style="font-size:18px">${esc(h.me.employeeNo || '—')}</span>`),
    kpi('رصيد الإجازة السنوية', h.me.leaveRemaining == null ? '—' : `${h.me.leaveRemaining} <small class="muted">يوم</small>`),
    kpi('طلباتي قيد الانتظار', `${h.me.leavePending + h.me.expensesPending}`),
    kpi('أجهزة مسلّمة لي', h.me.devices),
    kpi(h.me.lastNet ? `صافي راتب ${esc(h.me.lastNet.period)}` : 'آخر راتب', h.me.lastNet ? Mod.iqd(h.me.lastNet.net) : '—'),
  ].join('');

  $('#tasks').innerHTML = h.tasks.length
    ? h.tasks.map((t) => `<a class="task" href="${esc(t.href)}"><span>${esc(t.label)}</span><span class="n">${t.count}</span></a>`).join('')
    : '<p class="muted" style="margin:0">لا توجد مهام بانتظارك. أدوارك الحالية لا تتضمن صلاحيات اعتماد، أو لا توجد طلبات جديدة.</p>';

  $('#ann').innerHTML = h.announcements.map((a) => `<div class="ann"><h4>${a.pinned ? '<span class="badge b-failure">مثبّت</span>' : ''}${esc(a.title)}</h4>
    <p>${esc(a.body.length > 140 ? `${a.body.slice(0, 140)}…` : a.body)}</p>
    <small>${esc(a.author || '')} · ${UI.ago(a.created_at)} · ${a.department ? `لقسم ${esc(a.department)}` : 'لجميع الموظفين'}</small></div>`).join('') || '<p class="muted">لا توجد إعلانات</p>';

  const has = (p) => [].concat(p).some((x) => me.permissions.includes(x));
  const apps = [
    ['/leave', 'الإجازات', 'تقديم واعتماد', ['leave:create', 'leave:read:all']],
    ['/payroll', 'الرواتب', 'قسائم ومسيّرات', ['payroll:read:own', 'payroll:read']],
    ['/expenses', 'المصروفات', 'طلبات الصرف', ['expenses:read:own', 'expenses:read:all']],
    ['/directory', 'دليل الموظفين', 'بيانات الاتصال', 'directory:read'],
    ['/hr-records', 'ملفات الموظفين', 'hr_records:read', 'hr_records:read'],
    ['/invoices', 'فواتير الموردين', 'invoices:read', 'invoices:read'],
    ['/customers', 'العملاء', 'customers:read', 'customers:read'],
    ['/deals', 'الصفقات', 'صفقاتي / الكل', ['deals:read:own', 'deals:read:all']],
    ['/tickets', 'تذاكر الدعم', 'tickets:read', 'tickets:read'],
    ['/assets', 'الأجهزة', 'أجهزتي / الأصول', ['assets:read:own', 'assets:read:all']],
    ['/users', 'إدارة المستخدمين', 'users:read', 'users:read'],
    ['/audit', 'سجل التدقيق', 'audit:read', 'audit:read'],
  ];
  $('#apps').innerHTML = apps.map(([href, label, sub, perm]) => `<a class="app-tile ${has(perm) ? '' : 'off'}" href="${href}">${label}<small>${esc(sub)}</small></a>`).join('');
});
