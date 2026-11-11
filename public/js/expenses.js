document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['expenses:create', 'expenses:read:own', 'expenses:read:all', 'expenses:approve'], me);
  const CAT = { transport: 'نقل', hospitality: 'ضيافة', training: 'تدريب', equipment: 'مستلزمات', telecom: 'اتصالات' };
  const STATUS = { pending: ['قيد المراجعة', 'b-pending'], approved: ['معتمد', 'b-active'], rejected: ['مرفوض', 'b-disabled'] };
  let scope = Mod.params().get('scope');
  async function load() {
    const r = await Api.get(`/api/finance/expenses?scope=${scope || ''}`);
    scope = r.scope;
    Mod.scopeTabs($('#scope'), { scopes: r.scopes, scope, base: 'expenses:read', onChange: (s) => { scope = s; load(); } });
    if (r.canCreate && !$('#newBtn')) {
      $('#headActions').innerHTML = '<button class="btn btn-accent" id="newBtn">+ طلب صرف</button>';
      $('#newBtn').addEventListener('click', () => Mod.form('طلب صرف مصروفات', [
        { name: 'category', label: 'الفئة', type: 'select', options: Object.entries(CAT) },
        { name: 'amount', label: 'المبلغ (د.ع)', type: 'number', ltr: true }, { name: 'expenseDate', label: 'تاريخ المصروف', type: 'date' },
        { name: 'description', label: 'الوصف', type: 'textarea' },
      ], async (d) => { d.amount = Number(d.amount); await Api.post('/api/finance/expenses', d); UI.toast('تم تقديم الطلب'); load(); }, 'تقديم'));
    }
    Mod.table($('#table'), [
      ...(scope !== 'own' ? [{ label: 'الموظف', html: (x) => `<div class="user-cell"><b>${esc(x.employee)}</b><span class="muted" style="font-size:12px">${esc(x.department)}</span></div>` }] : []),
      { label: 'الفئة', html: (x) => CAT[x.category] }, { label: 'الوصف', html: (x) => esc(x.description) },
      { label: 'التاريخ', html: (x) => Mod.day(x.expense_date) }, { label: 'المبلغ', html: (x) => Mod.iqd(x.amount) },
      { label: 'الحالة', html: (x) => `<span class="badge ${STATUS[x.status][1]}">${STATUS[x.status][0]}</span>${x.review_note ? `<div class="muted" style="font-size:12px">${esc(x.review_note)}</div>` : ''}` },
    ], r.rows);
  }
  Mod.onAction($('#table'), async (act, id) => {
    const note = act === 'reject' ? prompt('سبب الرفض:') : '';
    if (note !== null && await Mod.run(Api.post(`/api/finance/expenses/${id}/decision`, { decision: act, note }))) load();
  });
  load();
});
