document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['hr_records:read', 'hr_records:update', 'salary:read'], me);
  const r = await Api.get('/api/hr/records');
  $('#salaryNote').innerHTML = r.salaryVisible
    ? '<span class="badge b-success">الحقول المالية ظاهرة (salary:read)</span>'
    : '<span class="badge b-failure">الحقول المالية محجوبة — تتطلب salary:read</span>';
  const hidden = '<span class="masked" title="يتطلب salary:read">•••••••• 🔒</span>';
  const render = () => {
    const q = $('#q').value.trim();
    Mod.table($('#table'), [
      { label: 'الرقم', html: (x) => `<span class="mono">${esc(x.employee_no)}</span>` },
      { label: 'الموظف', html: (x) => `<div class="user-cell"><b>${esc(x.full_name)}</b><span class="muted" style="font-size:12px">${esc(x.job_title || '')}</span></div>` },
      { label: 'القسم', html: (x) => esc(x.department || '') },
      { label: 'التعيين / العقد', html: (x) => `${Mod.day(x.hire_date)}<div class="muted" style="font-size:12px">${esc(x.contract_type)} · الدرجة ${esc(x.grade)}</div>` },
      { label: 'رقم الهوية الوطنية', html: (x) => `<span class="mono">${esc(x.national_id)}</span>` },
      { label: 'الراتب الأساسي', html: (x) => (x.salaryVisible ? Mod.iqd(x.base_salary) : hidden) },
      { label: 'المخصصات', html: (x) => (x.salaryVisible ? Mod.iqd(x.allowances) : hidden) },
      { label: 'IBAN', html: (x) => `<span class="mono" style="font-size:12px">${esc(x.bank_iban || '')}</span>` },
      { label: 'الحالة', html: (x) => UI.statusBadge(x.status) },
    ], r.rows.filter((x) => !q || `${x.full_name} ${x.employee_no} ${x.department}`.includes(q)), { actions: false });
  };
  $('#q').addEventListener('input', render);
  render();
});
