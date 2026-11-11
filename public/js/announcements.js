document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  Mod.permPanel($('#perms'), ['announcements:read', 'announcements:manage'], me);
  const departments = await fetch('/api/auth/departments').then((r) => r.json());
  async function load() {
    const r = await Api.get('/api/hr/announcements');
    if (r.canManage && !$('#newBtn')) {
      $('#headActions').innerHTML = '<button class="btn btn-accent" id="newBtn">+ إعلان جديد</button>';
      $('#newBtn').addEventListener('click', () => Mod.form('إعلان جديد', [
        { name: 'title', label: 'العنوان' }, { name: 'body', label: 'النص', type: 'textarea' },
        { name: 'departmentId', label: 'الجمهور', type: 'select', options: [['', 'جميع الموظفين'], ...departments.map((d) => [d.id, `قسم ${d.name} فقط`])] },
        { name: 'pinned', label: 'تثبيت أعلى الصفحة', type: 'select', options: [['', 'لا'], ['1', 'نعم']] },
      ], async (d) => { await Api.post('/api/hr/announcements', d); UI.toast('تم النشر'); load(); }, 'نشر'));
    }
    $('#list').innerHTML = r.rows.map((a) => `<div class="ann"><h4>${a.pinned ? '<span class="badge b-failure">مثبّت</span>' : ''}${esc(a.title)}
      <span class="badge ${a.department ? 'b-info' : 'b-muted'}">${a.department ? `قسم ${esc(a.department)} فقط` : 'الجميع'}</span></h4>
      <p>${esc(a.body)}</p><small>${esc(a.author || '')} · ${UI.date(a.created_at)}</small>
      ${r.canManage ? ` · <a href="#" data-del="${a.id}">حذف</a>` : ''}</div>`).join('') || '<p class="muted">لا توجد إعلانات</p>';
  }
  $('#list').addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del]');
    if (!d) return;
    e.preventDefault();
    if (confirm('حذف الإعلان؟') && await Mod.run(Api.del(`/api/hr/announcements/${d.dataset.del}`))) load();
  });
  load();
});
