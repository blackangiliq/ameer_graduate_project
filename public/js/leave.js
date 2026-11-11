document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['leave:create', 'leave:read:own', 'leave:read:department', 'leave:read:all', 'leave:approve:department', 'leave:approve:all'], me);
  const TYPE = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية', unpaid: 'بدون راتب' };
  const STATUS = { pending: ['قيد الانتظار', 'b-pending'], approved: ['معتمدة', 'b-active'], rejected: ['مرفوضة', 'b-disabled'], cancelled: ['ملغاة', 'b-muted'] };
  let scope = Mod.params().get('scope');
  if (Mod.params().get('status')) $('#status').value = Mod.params().get('status');

  async function load() {
    const r = await Api.get(`/api/hr/leave?scope=${scope || ''}&status=${$('#status').value}`);
    scope = r.scope;
    const b = r.balance;
    $('#balance').innerHTML = [['الرصيد السنوي المستحق', b.entitled], ['المستخدم هذا العام', b.used], ['قيد الانتظار', b.pending], ['المتبقي', b.remaining]]
      .map(([l, v]) => `<div class="card"><div class="label">${l} (أنا)</div><div class="value">${v} <small class="muted">يوم</small></div></div>`).join('');
    if (r.canCreate && !$('#newBtn')) {
      $('#headActions').innerHTML = '<button class="btn btn-accent" id="newBtn">+ طلب إجازة</button>';
      $('#newBtn').addEventListener('click', () => Mod.form('طلب إجازة', [
        { name: 'type', label: 'النوع', type: 'select', options: Object.entries(TYPE) },
        { name: 'startDate', label: 'من', type: 'date' }, { name: 'endDate', label: 'إلى', type: 'date' },
        { name: 'reason', label: 'السبب', type: 'textarea' },
      ], async (d) => { const x = await Api.post('/api/hr/leave', d); UI.toast(`تم تقديم الطلب (${x.days} يوم عمل)`); load(); }, 'تقديم'));
    }
    if (r.scopes.length) Mod.scopeTabs($('#scope'), { scopes: r.scopes, scope, base: 'leave:read', onChange: (s) => { scope = s; load(); } });
    const showEmp = scope !== 'own';
    Mod.table($('#table'), [
      ...(showEmp ? [{ label: 'الموظف', html: (x) => `<div class="user-cell"><b>${esc(x.employee)}</b><span class="muted" style="font-size:12px">${esc(x.department)}</span></div>` }] : []),
      { label: 'النوع', html: (x) => TYPE[x.type] },
      { label: 'الفترة', html: (x) => `${Mod.day(x.start_date)} ← ${Mod.day(x.end_date)}` },
      { label: 'الأيام', html: (x) => x.days },
      { label: 'السبب', html: (x) => esc(x.reason || '') },
      { label: 'الحالة', html: (x) => `<span class="badge ${STATUS[x.status][1]}">${STATUS[x.status][0]}</span>` },
      { label: 'المراجِع', html: (x) => (x.reviewer ? `${esc(x.reviewer)}${x.review_note ? `<div class="muted" style="font-size:12px">${esc(x.review_note)}</div>` : ''}` : '—') },
    ], r.rows);
  }
  Mod.onAction($('#table'), async (act, id) => {
    if (act === 'cancel') { if (await Mod.run(Api.post(`/api/hr/leave/${id}/cancel`))) load(); return; }
    const note = act === 'reject' ? prompt('سبب الرفض:') : '';
    if (note === null) return;
    if (await Mod.run(Api.post(`/api/hr/leave/${id}/decision`, { decision: act, note }))) load();
  });
  $('#status').addEventListener('change', load);
  load();
});
