document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, $$, esc } = UI;
  Mod.permPanel($('#perms'), ['tickets:read', 'tickets:create', 'tickets:work', 'tickets:assign'], me);
  const PR = { urgent: 'عاجلة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
  const ST = { open: ['مفتوحة', 'b-pending'], in_progress: ['قيد المعالجة', 'b-info'], resolved: ['محلولة', 'b-active'], closed: ['مغلقة', 'b-muted'] };
  let view = Mod.params().get('view') || '';
  let data;
  $$('#view button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
  async function load() {
    data = await Api.get(`/api/ops/tickets?view=${view}&status=${$('#status').value}`);
    if (data.canCreate && !$('#newBtn')) {
      $('#headActions').innerHTML = '<button class="btn btn-accent" id="newBtn">+ تذكرة جديدة</button>';
      $('#newBtn').addEventListener('click', () => Mod.form('تذكرة جديدة', [
        { name: 'customerId', label: 'العميل', type: 'select', options: data.customers.map((c) => [c.id, c.name]) },
        { name: 'subject', label: 'الموضوع' }, { name: 'priority', label: 'الأولوية', type: 'select', options: Object.entries(PR), value: 'medium' },
        { name: 'description', label: 'التفاصيل', type: 'textarea' },
      ], async (d) => { const x = await Api.post('/api/ops/tickets', d); UI.toast(`تم فتح ${x.number}`); load(); }, 'فتح'));
    }
    Mod.table($('#table'), [
      { label: 'الرقم', html: (x) => `<span class="mono">${esc(x.number)}</span>` },
      { label: 'الموضوع', html: (x) => `<b style="font-weight:600">${esc(x.subject)}</b><div class="muted" style="font-size:12.5px">${esc(x.customer || '')}</div>` },
      { label: 'الأولوية', html: (x) => `<span class="badge pr-${x.priority}">${PR[x.priority]}</span>` },
      { label: 'الحالة', html: (x) => `<span class="badge ${ST[x.status][1]}">${ST[x.status][0]}</span>` },
      { label: 'المسند إليه', html: (x) => (x.assignee ? `${esc(x.assignee)}${x.assigned_to === me.user.id ? ' <span class="badge b-info">أنت</span>' : ''}` : '<span class="muted">غير مسندة</span>') },
      { label: 'فُتحت', html: (x) => UI.ago(x.created_at) },
    ], data.rows);
  }
  Mod.onAction($('#table'), async (act, id) => {
    if (act === 'assign') {
      Mod.form('إسناد التذكرة', [{ name: 'assignTo', label: 'الموظف', type: 'select', options: data.agents.map((a) => [a.id, a.full_name]) }],
        async (d) => { await Api.patch(`/api/ops/tickets/${id}`, { action: 'assign', assignTo: Number(d.assignTo) }); UI.toast('تم الإسناد'); load(); }, 'إسناد');
      return;
    }
    if (await Mod.run(Api.patch(`/api/ops/tickets/${id}`, { action: act }))) load();
  });
  $('#view').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    view = b.dataset.v;
    $$('#view button').forEach((x) => x.classList.toggle('on', x === b));
    load();
  });
  $('#status').addEventListener('change', load);
  load();
});
