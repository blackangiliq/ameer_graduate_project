document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['assets:read:own', 'assets:read:all', 'assets:manage'], me);
  const TYPE = { laptop: 'حاسبة محمولة', desktop: 'حاسبة مكتبية', phone: 'هاتف', monitor: 'شاشة', server: 'خادم', network: 'شبكات', printer: 'طابعة' };
  const ST = { in_use: ['مستخدم', 'b-active'], in_stock: ['في المخزن', 'b-info'], repair: ['صيانة', 'b-pending'], retired: ['خارج الخدمة', 'b-muted'] };
  let scope = Mod.params().get('scope');
  let data;
  async function load() {
    data = await Api.get(`/api/ops/assets?scope=${scope || ''}&type=${$('#type').value}&status=${$('#status').value}`);
    scope = data.scope;
    Mod.scopeTabs($('#scope'), { scopes: data.scopes, scope, base: 'assets:read', onChange: (s) => { scope = s; load(); } });
    Mod.table($('#table'), [
      { label: 'الوسم', html: (x) => `<span class="mono">${esc(x.tag)}</span>` },
      { label: 'الجهاز', html: (x) => `<b style="font-weight:600">${esc(x.model)}</b><div class="muted" style="font-size:12.5px">${TYPE[x.type]} · <span class="mono">${esc(x.serial)}</span></div>` },
      { label: 'الحالة', html: (x) => `<span class="badge ${ST[x.status][1]}">${ST[x.status][0]}</span>` },
      { label: 'المستلم', html: (x) => (x.holder ? `${esc(x.holder)}<div class="muted" style="font-size:12px">${esc(x.department || '')}</div>` : '—') + (x._flag ? `<div class="row-note">⚠ ${esc(x._flag)}</div>` : '') },
      { label: 'الموقع', html: (x) => esc(x.location || '') },
      { label: 'نهاية الضمان', html: (x) => Mod.day(x.warranty_end) },
    ], data.rows, { rowClass: (x) => (x._flag ? 'flag' : '') });
  }
  Mod.onAction($('#table'), (act, id) => {
    const a = data.rows.find((x) => x.id === id);
    Mod.form(`تحديث ${a.tag}`, [
      { name: 'status', label: 'الحالة', type: 'select', options: Object.entries(ST).map(([k, v]) => [k, v[0]]), value: a.status },
      { name: 'assignedTo', label: 'تسليم إلى (عند الاستخدام)', type: 'select', options: [['', '—'], ...data.users.map((u) => [u.id, u.full_name])], value: a.assigned_to || '' },
      { name: 'location', label: 'الموقع', value: a.location || '' },
    ], async (d) => { await Api.patch(`/api/ops/assets/${id}`, d); UI.toast('تم التحديث'); load(); });
  });
  ['#type', '#status'].forEach((s) => $(s).addEventListener('change', load));
  load();
});
