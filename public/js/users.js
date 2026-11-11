document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, $$, esc } = UI;
  const can = (p) => me.permissions.includes(p);
  const [roles, departments] = await Promise.all([
    can('roles:read') ? Api.get('/api/roles') : Promise.resolve([]),
    fetch('/api/auth/departments').then((r) => r.json()),
  ]);
  $('#fRole').innerHTML += roles.map((r) => `<option value="${esc(r.name)}">${esc(r.label)}</option>`).join('');
  $('#fDept').innerHTML += departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  if (!can('roles:read')) $('#fRole').hidden = true;

  if (can('users:create')) {
    $('#headActions').innerHTML = '<button class="btn btn-accent" id="createBtn">+ مستخدم جديد</button>';
    $('#createBtn').addEventListener('click', openCreate);
  }

  async function load() {
    const qs = new URLSearchParams({ q: $('#q').value, status: $('#fStatus').value, role: $('#fRole').value, department: $('#fDept').value });
    const rows = await Api.get(`/api/users?${qs}`);
    $('#count').textContent = `${rows.length} مستخدم`;
    $('#rows').innerHTML = rows.length ? rows.map((u) => `<tr class="clickable" data-id="${u.id}">
        <td class="user-cell"><b>${esc(u.full_name)}</b><span class="mono">${esc(u.username)}</span></td>
        <td>${esc(u.department || '—')}<div class="muted" style="font-size:12.5px">${esc(u.job_title || '')}</div></td>
        <td style="max-width:260px">${esc(u.roles || '')}</td>
        <td>${UI.statusBadge(u.status)} ${u.locked ? '<span class="badge b-locked">مقفل</span>' : ''}</td>
        <td>${u.mfa_enabled ? '<span class="badge b-mfa">مفعّلة</span>' : '<span class="muted">—</span>'}</td>
        <td class="muted">${u.last_login_at ? UI.ago(u.last_login_at) : 'لم يسجّل'}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">لا توجد نتائج</td></tr>';
  }

  let timer;
  $('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  ['#fStatus', '#fRole', '#fDept'].forEach((s) => $(s).addEventListener('change', load));
  $('#rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openUser(tr.dataset.id);
  });

  function showSecret(title, value, note) {
    UI.modal(`<div class="modal"><div class="card-head"><h3>${esc(title)}</h3><button class="x" data-close>×</button></div>
      <div class="card-body"><p>${esc(note)}</p><div class="secret-box">${esc(value)}</div>
      <p class="muted" style="font-size:12.5px">تظهر هذه القيمة مرة واحدة فقط ولا تُخزَّن إلا كبصمة bcrypt. سلّمها للموظف بقناة آمنة، وسيُجبر على تغييرها عند أول دخول.</p></div>
      <div class="modal-foot"><button class="btn" data-close>تم</button></div></div>`);
  }

  async function openUser(id) {
    const u = await Api.get(`/api/users/${id}`);
    const isSelf = u.id === me.user.id;
    const act = [];
    if (can('users:disable') && !isSelf) {
      if (u.status === 'pending') act.push('<button class="btn btn-accent btn-sm" data-act="status" data-v="active">الموافقة وتفعيل الحساب</button>');
      if (u.status === 'active') act.push('<button class="btn btn-ghost btn-sm" data-act="status" data-v="suspended">تعليق مؤقت</button>');
      if (['suspended', 'disabled'].includes(u.status)) act.push('<button class="btn btn-accent btn-sm" data-act="status" data-v="active">إعادة التفعيل</button>');
      if (u.status !== 'disabled') act.push('<button class="btn btn-danger btn-sm" data-act="status" data-v="disabled">إيقاف نهائي (Leaver)</button>');
    }
    if (can('users:unlock') && u.locked) act.push('<button class="btn btn-sm" data-act="unlock">فك القفل</button>');
    if (can('users:reset_password') && !isSelf) act.push('<button class="btn btn-ghost btn-sm" data-act="reset">إعادة تعيين كلمة المرور</button>');
    if (can('users:reset_password') && u.mfa_enabled && !isSelf) act.push('<button class="btn btn-ghost btn-sm" data-act="resetmfa">إعادة ضبط MFA</button>');

    const roleEditor = can('roles:assign') && !isSelf
      ? `<div class="card"><div class="card-head"><h3>إسناد الأدوار</h3><button class="btn btn-accent btn-sm" data-act="roles">حفظ</button></div>
         <div class="card-body" style="display:grid;gap:8px">${roles.map((r) => `<label class="checkbox"><input type="checkbox" value="${r.id}" ${u.roles.some((x) => x.id === r.id) ? 'checked' : ''}>
         <span>${esc(r.label)} <span class="mono muted">${esc(r.name)}</span></span></label>`).join('')}</div></div>`
      : `<div class="card"><div class="card-head"><h3>الأدوار</h3></div><div class="card-body chips">${u.roles.map((r) => `<span class="badge b-role">${esc(r.label)}</span>`).join('')}
         ${isSelf ? '<p class="muted" style="width:100%;margin:8px 0 0;font-size:12.5px">لا يمكنك تعديل أدوارك بنفسك (منع تصعيد الصلاحيات).</p>' : ''}</div></div>`;

    const overlay = UI.modal(`<aside class="drawer">
      <div class="drawer-head"><div><h2 style="font-size:19px">${esc(u.full_name)}</h2><span class="mono muted">${esc(u.username)}</span>
        <div class="chips" style="margin-top:6px">${UI.statusBadge(u.status)} ${u.locked ? '<span class="badge b-locked">مقفل</span>' : ''} ${u.mfa_enabled ? '<span class="badge b-mfa">MFA</span>' : ''} ${u.must_change_password ? '<span class="badge b-pending">كلمة مرور مؤقتة</span>' : ''}</div></div>
        <button class="x" data-close>×</button></div>
      <div class="drawer-body">
        <div id="drawerAlert" hidden></div>
        ${act.length ? `<div class="card"><div class="card-head"><h3>إجراءات دورة الحياة</h3></div><div class="card-body actions">${act.join('')}</div></div>` : ''}
        <div class="card"><div class="card-head"><h3>بيانات الهوية</h3></div><div class="card-body"><dl class="kv">
          <dt>البريد</dt><dd class="mono">${esc(u.email)}</dd>
          <dt>القسم</dt><dd>${esc(u.department || '—')}</dd>
          <dt>المسمى الوظيفي</dt><dd>${esc(u.job_title || '—')}</dd>
          <dt>تاريخ الإنشاء</dt><dd>${UI.date(u.created_at)}</dd>
          <dt>آخر دخول</dt><dd>${UI.date(u.last_login_at)}</dd>
          <dt>آخر تغيير لكلمة المرور</dt><dd>${UI.date(u.password_changed_at)}</dd>
          <dt>محاولات فاشلة</dt><dd>${u.failed_attempts}${u.locked ? ` — مقفل حتى ${UI.date(u.locked_until)}` : ''}</dd>
          <dt>الجلسات النشطة</dt><dd>${u.activeSessions}</dd>
        </dl></div></div>
        ${roleEditor}
        <div class="card"><div class="card-head"><h3>الصلاحيات الفعلية (${u.permissions.length})</h3></div><div class="card-body chips">${u.permissions.map((p) => `<span class="badge b-perm">${esc(p)}</span>`).join('') || '<span class="muted">لا شيء</span>'}</div></div>
      </div></aside>`);

    overlay.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const alertEl = $('#drawerAlert', overlay);
      try {
        if (b.dataset.act === 'status') {
          const v = b.dataset.v;
          const reason = v === 'active' ? '' : prompt('سبب الإجراء (يُحفظ في سجل التدقيق):', v === 'disabled' ? 'انتهاء الخدمة' : 'إجراء احترازي');
          if (reason === null) return;
          await Api.patch(`/api/users/${u.id}/status`, { status: v, reason });
          UI.toast(v === 'active' ? 'تم تفعيل الحساب' : 'تم تحديث حالة الحساب وإنهاء جميع جلساته');
        } else if (b.dataset.act === 'unlock') {
          await Api.post(`/api/users/${u.id}/unlock`);
          UI.toast('تم فك قفل الحساب');
        } else if (b.dataset.act === 'reset') {
          if (!confirm('سيتم إصدار كلمة مرور مؤقتة وإنهاء كل جلسات المستخدم. متابعة؟')) return;
          const r = await Api.post(`/api/users/${u.id}/reset-password`);
          overlay.remove();
          showSecret('كلمة المرور المؤقتة', r.temporaryPassword, `تم إنهاء ${r.sessionsRevoked} جلسة للمستخدم ${u.username}.`);
          load();
          return;
        } else if (b.dataset.act === 'resetmfa') {
          if (!confirm('سيُطلب من المستخدم إعداد المصادقة الثنائية من جديد. متابعة؟')) return;
          await Api.post(`/api/users/${u.id}/reset-mfa`);
          UI.toast('تمت إعادة ضبط المصادقة الثنائية');
        } else if (b.dataset.act === 'roles') {
          const ids = $$('.drawer input[type=checkbox]:checked', overlay).map((c) => Number(c.value));
          await Api.put(`/api/users/${u.id}/roles`, { roleIds: ids });
          UI.toast('تم تحديث الأدوار — تسري فوراً على الطلب التالي');
        }
        overlay.remove();
        await load();
        openUser(u.id);
      } catch (err) {
        UI.alert(alertEl, err.message);
      }
    });
  }

  function openCreate() {
    const overlay = UI.modal(`<div class="modal"><div class="card-head"><h3>إنشاء مستخدم (Joiner)</h3><button class="x" data-close>×</button></div>
      <form id="createForm" novalidate><div class="card-body">
        <div id="cAlert" hidden></div>
        <div class="field"><label>الاسم الكامل</label><input name="fullName" type="text"></div>
        <div class="grid g-2" style="gap:12px"><div class="field"><label>اسم المستخدم</label><input name="username" type="text" class="ltr"></div>
        <div class="field"><label>البريد الإلكتروني</label><input name="email" type="email" class="ltr"></div></div>
        <div class="grid g-2" style="gap:12px"><div class="field"><label>القسم</label><select name="departmentId">${departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
        <div class="field"><label>المسمى الوظيفي</label><input name="jobTitle" type="text"></div></div>
        ${can('roles:assign') ? `<label>الأدوار</label><div style="display:grid;gap:6px">${roles.map((r) => `<label class="checkbox"><input type="checkbox" name="role" value="${r.id}" ${r.name === 'employee' ? 'checked' : ''}>${esc(r.label)}</label>`).join('')}</div>` : ''}
      </div><div class="modal-foot"><button class="btn btn-accent" type="submit">إنشاء</button><button class="btn btn-ghost" type="button" data-close>إلغاء</button></div></form></div>`);
    $('#createForm', overlay).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const r = await Api.post('/api/users', {
          fullName: f.get('fullName'), username: f.get('username'), email: f.get('email'),
          departmentId: f.get('departmentId'), jobTitle: f.get('jobTitle'), roleIds: f.getAll('role').map(Number),
        });
        overlay.remove();
        showSecret('تم إنشاء الحساب', r.temporaryPassword, `كلمة المرور المؤقتة للمستخدم ${r.user.username}:`);
        load();
      } catch (err) { UI.alert($('#cAlert', overlay), err.message, 'error', err.data?.details); }
    });
  }

  load();
});
