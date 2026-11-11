document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['deals:read:own', 'deals:read:all', 'deals:manage:own', 'deals:manage:all'], me);
  const STAGE = { lead: 'عميل محتمل', proposal: 'عرض سعر', negotiation: 'تفاوض', won: 'ربح', lost: 'خسارة' };
  let scope = Mod.params().get('scope');
  let data;
  async function load() {
    data = await Api.get(`/api/ops/deals?scope=${scope || ''}`);
    scope = data.scope;
    Mod.scopeTabs($('#scope'), { scopes: data.scopes, scope, base: 'deals:read', onChange: (s) => { scope = s; load(); } });
    const open = data.rows.filter((d) => !['won', 'lost'].includes(d.stage));
    const won = data.rows.filter((d) => d.stage === 'won');
    $('#pipeline').innerHTML = [['صفقات مفتوحة', open.length], ['قيمة الصفقات المفتوحة', Mod.iqd(open.reduce((a, d) => a + d.value, 0))], ['صفقات رابحة', won.length], ['قيمة الصفقات الرابحة', Mod.iqd(won.reduce((a, d) => a + d.value, 0))]]
      .map(([l, v]) => `<div class="card"><div class="label">${l}</div><div class="value" style="font-size:18px">${v}</div></div>`).join('');
    if (data.canCreate && !$('#newBtn')) {
      $('#headActions').innerHTML = '<button class="btn btn-accent" id="newBtn">+ صفقة جديدة</button>';
      $('#newBtn').addEventListener('click', () => Mod.form('صفقة جديدة', [
        { name: 'customerId', label: 'العميل', type: 'select', options: data.customers.map((c) => [c.id, c.name]) },
        { name: 'title', label: 'العنوان' }, { name: 'value', label: 'القيمة (د.ع)', type: 'number', ltr: true },
        { name: 'expectedClose', label: 'الإغلاق المتوقع', type: 'date' },
        ...(data.canReassign ? [{ name: 'ownerId', label: 'المسؤول', type: 'select', options: data.reps.map((u) => [u.id, u.full_name]), value: me.user.id }] : []),
      ], async (d) => { d.value = Number(d.value); await Api.post('/api/ops/deals', d); UI.toast('تمت الإضافة'); load(); }, 'إضافة'));
    }
    Mod.table($('#table'), [
      { label: 'الصفقة', html: (x) => `<b style="font-weight:600">${esc(x.title)}</b><div class="muted" style="font-size:12.5px">${esc(x.customer)} — ${esc(x.city)}</div>` },
      { label: 'القيمة', html: (x) => Mod.iqd(x.value) },
      { label: 'المرحلة', html: (x) => `<span class="stage st-${x.stage}">${STAGE[x.stage]}</span>` },
      { label: 'المسؤول', html: (x) => `${esc(x.owner || '—')}${x.owner_id === me.user.id ? ' <span class="badge b-info">أنت</span>' : ''}${x.owner_status === 'disabled' ? ' <span class="badge b-disabled">موظف سابق</span>' : ''}` },
      { label: 'الإغلاق المتوقع', html: (x) => Mod.day(x.expected_close) },
    ], data.rows);
  }
  Mod.onAction($('#table'), (act, id) => {
    const d = data.rows.find((x) => x.id === id);
    Mod.form(`تحديث: ${d.title}`, [
      { name: 'stage', label: 'المرحلة', type: 'select', options: Object.entries(STAGE), value: d.stage },
      { name: 'value', label: 'القيمة (د.ع)', type: 'number', ltr: true, value: d.value },
      ...(data.canReassign ? [{ name: 'ownerId', label: 'إعادة الإسناد إلى', type: 'select', options: data.reps.map((u) => [u.id, u.full_name]), value: d.owner_id }] : []),
    ], async (f) => { f.value = Number(f.value); await Api.patch(`/api/ops/deals/${id}`, f); UI.toast('تم التحديث'); load(); });
  });
  load();
});
