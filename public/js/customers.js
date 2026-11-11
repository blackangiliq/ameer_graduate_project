document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['customers:read', 'customers:manage'], me);
  async function load() {
    const r = await Api.get(`/api/ops/customers?q=${encodeURIComponent($('#q').value)}`);
    $('#count').textContent = `${r.rows.length} عميل`;
    if (r.canManage && !$('#newBtn')) {
      $('#headActions').innerHTML = '<button class="btn btn-accent" id="newBtn">+ عميل جديد</button>';
      $('#newBtn').addEventListener('click', () => Mod.form('عميل جديد', [
        { name: 'name', label: 'اسم الجهة' }, { name: 'sector', label: 'القطاع' }, { name: 'city', label: 'المدينة' },
        { name: 'contactName', label: 'جهة الاتصال' }, { name: 'phone', label: 'الهاتف', ltr: true }, { name: 'email', label: 'البريد', ltr: true },
      ], async (d) => { await Api.post('/api/ops/customers', d); UI.toast('تمت الإضافة'); load(); }, 'إضافة'));
    }
    Mod.table($('#table'), [
      { label: 'العميل', html: (x) => `<b style="font-weight:600">${esc(x.name)}</b><div class="muted" style="font-size:12.5px">${esc(x.sector || '')}</div>` },
      { label: 'المدينة', html: (x) => esc(x.city || '') },
      { label: 'جهة الاتصال', html: (x) => `${esc(x.contact_name || '')}<div class="mono muted" style="font-size:12px">${esc(x.phone || '')}</div>` },
      { label: 'مدير الحساب', html: (x) => `${esc(x.account_manager || '—')}${x.account_manager_status === 'disabled' ? ' <span class="badge b-disabled">موظف سابق</span>' : ''}` },
      { label: 'صفقات مفتوحة', html: (x) => x.open_deals },
      { label: 'تذاكر مفتوحة', html: (x) => x.open_tickets },
    ], r.rows, { actions: false });
  }
  let t;
  $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  load();
});
