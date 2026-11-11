document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['payroll:read:own', 'payroll:read', 'payroll:prepare', 'payroll:approve'], me);
  const has = (p) => me.permissions.includes(p);
  const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
  const period = (p) => `${MONTHS[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}`;
  const RUN = { draft: ['مسودة — بانتظار الاعتماد', 'b-pending'], approved: ['معتمد', 'b-info'], paid: ['مدفوع', 'b-active'] };

  async function loadRuns() {
    const runs = await Api.get('/api/hr/payroll/runs');
    $('#runsCard').hidden = false;
    Mod.table($('#runs'), [
      { label: 'الشهر', html: (x) => `<b>${period(x.period)}</b>` },
      { label: 'الحالة', html: (x) => `<span class="badge ${RUN[x.status][1]}">${RUN[x.status][0]}</span>` },
      { label: 'الموظفون', html: (x) => x.employees },
      { label: 'الإجمالي', html: (x) => Mod.iqd(x.gross) },
      { label: 'الصافي', html: (x) => Mod.iqd(x.net) },
      { label: 'أعدّه', html: (x) => esc(x.prepared_by_name || '') },
      { label: 'اعتمده', html: (x) => esc(x.approved_by_name || '—') },
      { label: '', html: (x) => `<button class="btn btn-ghost btn-sm" data-view="${x.id}" data-period="${x.period}">عرض القسائم</button>` },
    ], runs);
  }
  if (has('payroll:read')) {
    await loadRuns();
    Mod.onAction($('#runs'), async (act, id) => {
      if (act === 'approve' && confirm('اعتماد مسيّر الرواتب؟') && await Mod.run(Api.post(`/api/hr/payroll/runs/${id}/approve`))) loadRuns();
    });
    $('#runs').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-view]');
      if (!b) return;
      const d = await Api.get(`/api/hr/payroll/runs/${b.dataset.view}`);
      $('#detailCard').hidden = false;
      $('#detailTitle').textContent = `قسائم ${period(d.run.period)} (${d.slips.length} موظف)`;
      Mod.table($('#detail'), [
        { label: 'الرقم', html: (x) => `<span class="mono">${esc(x.employee_no)}</span>` },
        { label: 'الموظف', html: (x) => esc(x.full_name) }, { label: 'القسم', html: (x) => esc(x.department) },
        { label: 'الأساسي', html: (x) => Mod.iqd(x.base) }, { label: 'المخصصات', html: (x) => Mod.iqd(x.allowances) },
        { label: 'إضافي', html: (x) => Mod.iqd(x.overtime) }, { label: 'ضمان 5%', html: (x) => Mod.iqd(x.deductions) },
        { label: 'ضريبة', html: (x) => Mod.iqd(x.tax) }, { label: 'الصافي', html: (x) => `<b>${Mod.iqd(x.net)}</b>` },
      ], d.slips, { actions: false });
      $('#detailCard').scrollIntoView({ behavior: 'smooth' });
    });
  }
  if (has('payroll:read:own')) {
    const mine = await Api.get('/api/hr/payroll/mine');
    $('#mineCard').hidden = false;
    Mod.table($('#mine'), [
      { label: 'الشهر', html: (x) => `<b>${period(x.period)}</b>` },
      { label: 'الأساسي', html: (x) => Mod.iqd(x.base) }, { label: 'المخصصات', html: (x) => Mod.iqd(x.allowances) },
      { label: 'إضافي', html: (x) => Mod.iqd(x.overtime) }, { label: 'الاستقطاعات', html: (x) => Mod.iqd(x.deductions + x.tax) },
      { label: 'الصافي', html: (x) => `<b>${Mod.iqd(x.net)}</b>` },
    ], mine, { actions: false, empty: 'لا توجد قسائم معتمدة بعد' });
  }
});
