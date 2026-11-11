document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['invoices:read', 'invoices:create', 'invoices:approve', 'invoices:approve_unlimited'], me);
  const STATUS = { pending: ['قيد الانتظار', 'b-pending'], approved: ['معتمدة', 'b-info'], paid: ['مدفوعة', 'b-active'], rejected: ['مرفوضة', 'b-disabled'] };
  if (Mod.params().get('status')) $('#status').value = Mod.params().get('status');
  async function load() {
    const r = await Api.get(`/api/finance/invoices?status=${$('#status').value}&q=${encodeURIComponent($('#q').value)}`);
    $('#totals').innerHTML = [['قيد الانتظار', r.totals.pending], ['معتمدة غير مدفوعة', r.totals.approved], ['مدفوعة', r.totals.paid]]
      .map(([l, v]) => `<div class="card"><div class="label">${l}</div><div class="value" style="font-size:18px">${Mod.iqd(v || 0)}</div></div>`).join('');
    $('#limit').innerHTML = r.limit === null ? 'حد اعتمادك: <b>بلا حد</b>' : r.limit ? `حد اعتمادك: <b>${Mod.iqd(r.limit)}</b>` : 'لا تملك صلاحية الاعتماد (قراءة فقط)';
    if (r.canCreate && !$('#newBtn')) {
      $('#headActions').innerHTML = '<button class="btn btn-accent" id="newBtn">+ تسجيل فاتورة</button>';
      $('#newBtn').addEventListener('click', () => Mod.form('تسجيل فاتورة مورد', [
        { name: 'vendor', label: 'المورد' }, { name: 'description', label: 'الوصف' },
        { name: 'amount', label: 'المبلغ (دينار عراقي)', type: 'number', ltr: true }, { name: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
      ], async (d) => { d.amount = Number(d.amount); const x = await Api.post('/api/finance/invoices', d); UI.toast(`تم تسجيل ${x.number} — يحتاج اعتماد شخص آخر`); load(); }, 'تسجيل'));
    }
    Mod.table($('#table'), [
      { label: 'الرقم', html: (x) => `<span class="mono">${esc(x.number)}</span>` },
      { label: 'المورد والوصف', html: (x) => `<b style="font-weight:600">${esc(x.vendor)}</b><div class="muted" style="font-size:12.5px">${esc(x.description)}</div>` },
      { label: 'المبلغ', html: (x) => `${Mod.iqd(x.amount)}${x.amount > 10000000 ? '<div><span class="badge b-suspended" style="font-size:11px">فوق 10 ملايين</span></div>' : ''}` },
      { label: 'الاستحقاق', html: (x) => Mod.day(x.due_date) },
      { label: 'سجّلها', html: (x) => `${esc(x.created_by_name || '')}${x.created_by === me.user.id ? ' <span class="badge b-info">أنت</span>' : ''}` },
      { label: 'الحالة', html: (x) => `<span class="badge ${STATUS[x.status][1]}">${STATUS[x.status][0]}</span>${x.approved_by_name ? `<div class="muted" style="font-size:12px">${esc(x.approved_by_name)}</div>` : ''}` },
    ], r.rows);
  }
  Mod.onAction($('#table'), async (act, id) => { if (await Mod.run(Api.post(`/api/finance/invoices/${id}/decision`, { decision: act }))) load(); });
  let t;
  $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  $('#status').addEventListener('change', load);
  load();
});
