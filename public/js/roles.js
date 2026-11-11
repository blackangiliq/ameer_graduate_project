document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, $$, esc } = UI;
  const canManage = me.permissions.includes('roles:manage');
  let roles = [];
  let selected = null;
  const permissions = await Api.get('/api/roles/permissions');

  async function loadRoles() {
    roles = await Api.get('/api/roles');
    $('#roleList').innerHTML = roles.map((r) => `<div class="role-item ${r.id === selected ? 'active' : ''}" data-id="${r.id}">
      <b>${esc(r.label)}</b><small class="mono">${esc(r.name)}</small> · <small>${r.user_count} مستخدم · ${r.permissions.length} صلاحية</small></div>`).join('');
    if (!selected) select(roles[0].id);
  }

  function select(id) {
    selected = id;
    const role = roles.find((r) => r.id === id);
    $$('.role-item').forEach((el) => el.classList.toggle('active', Number(el.dataset.id) === id));
    $('#roleTitle').textContent = role.label;
    $('#roleDesc').textContent = role.description || '';
    const editable = canManage && role.name !== 'super_admin';
    $('#saveRole').hidden = !editable;
    const groups = [...new Set(permissions.map((p) => p.category))];
    $('#permEditor').innerHTML = (role.name === 'super_admin' ? '<div class="alert alert-info">صلاحيات المدير العام ثابتة (تشمل كل الصلاحيات) ولا يمكن تعديلها من الواجهة.</div>' : '')
      + (!canManage ? '<div class="alert alert-warn">عرض فقط — تعديل السياسات يتطلب الصلاحية <span class="mono">roles:manage</span> (فصل المهام).</div>' : '')
      + groups.map((g) => `<div class="perm-group"><h4>${esc(g)}</h4>${permissions.filter((p) => p.category === g).map((p) => `
        <label class="perm-row"><span class="checkbox"><input type="checkbox" value="${esc(p.name)}" ${role.permissions.includes(p.name) ? 'checked' : ''} ${editable ? '' : 'disabled'}>${esc(p.label)}</span>
        <span class="badge b-perm">${esc(p.name)}</span></label>`).join('')}</div>`).join('');
  }

  $('#roleList').addEventListener('click', (e) => {
    const el = e.target.closest('.role-item');
    if (el) select(Number(el.dataset.id));
  });

  $('#saveRole').addEventListener('click', async () => {
    const perms = $$('#permEditor input:checked').map((c) => c.value);
    try {
      await Api.put(`/api/roles/${selected}/permissions`, { permissions: perms });
      UI.toast('تم حفظ صلاحيات الدور');
      await loadRoles();
      select(selected);
      loadMatrix();
    } catch (err) { UI.toast(err.message, 'error'); }
  });

  if (canManage) {
    $('#newRole').hidden = false;
    $('#newRole').addEventListener('click', () => {
      const overlay = UI.modal(`<div class="modal"><div class="card-head"><h3>دور جديد</h3><button class="x" data-close>×</button></div>
        <form id="roleForm"><div class="card-body"><div id="rAlert" hidden></div>
          <div class="field"><label>الاسم البرمجي</label><input name="name" type="text" class="ltr" placeholder="sales_manager"></div>
          <div class="field"><label>الاسم المعروض</label><input name="label" type="text" placeholder="مدير المبيعات"></div>
          <div class="field"><label>الوصف</label><input name="description" type="text"></div></div>
          <div class="modal-foot"><button class="btn btn-accent" type="submit">إنشاء</button></div></form></div>`);
      $('#roleForm', overlay).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          const r = await Api.post('/api/roles', Object.fromEntries(f));
          overlay.remove();
          await loadRoles();
          select(r.id);
        } catch (err) { UI.alert($('#rAlert', overlay), err.message); }
      });
    });
  }

  async function loadMatrix() {
    const m = await Api.get('/api/roles/matrix');
    $('#matrix').innerHTML = `<thead><tr><th>الموظف</th><th>القسم</th><th>الحالة</th>${m.roles.map((r) => `<th class="rot">${esc(r.label)}</th>`).join('')}</tr></thead>
      <tbody>${m.users.map((u) => `<tr><td class="user-cell"><b>${esc(u.full_name)}</b><span class="mono">${esc(u.username)}</span></td>
        <td>${esc(u.department || '')}</td><td>${UI.statusBadge(u.status)}</td>
        ${m.roles.map((r) => `<td class="cell"><span class="dot ${u.roleIds.includes(r.id) ? '' : 'off'}" title="${esc(r.label)}"></span></td>`).join('')}</tr>`).join('')}</tbody>`;
  }

  await loadRoles();
  loadMatrix();
});
