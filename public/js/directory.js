document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['directory:read', 'hr_records:read', 'salary:read'], me);
  const rows = await Api.get('/api/hr/directory');
  const depts = [...new Map(rows.map((r) => [r.department_code, r.department])).entries()];
  $('#dept').innerHTML += depts.map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('');
  function render() {
    const q = $('#q').value.trim();
    const list = rows.filter((r) => (!$('#dept').value || r.department_code === $('#dept').value) && (!q || `${r.full_name} ${r.job_title}`.includes(q)));
    $('#count').textContent = `${list.length} موظف`;
    $('#list').innerHTML = list.map((r) => `<div class="card person"><div class="avatar">${esc(r.full_name[0])}</div><div>
      <b>${esc(r.full_name)}</b><small>${esc(r.job_title || '')} — ${esc(r.department || '')}</small>
      <small class="mono">${esc(r.email)}</small><small><span class="mono">${esc(r.phone || '')}</span> · داخلي <span class="mono">${esc(r.extension || '')}</span></small></div></div>`).join('');
  }
  $('#q').addEventListener('input', render);
  $('#dept').addEventListener('change', render);
  render();
});
