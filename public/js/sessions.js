document.addEventListener('app:ready', ({ detail: me }) => {
  const { $, esc } = UI;
  const canAll = me.permissions.includes('sessions:read_all');
  const canRevokeAny = me.permissions.includes('sessions:revoke_any');

  const btn = (s, allowed) => (s.current
    ? '<span class="badge b-success">هذا الجهاز</span>'
    : allowed ? `<button class="btn btn-ghost btn-sm" data-revoke="${esc(s.id)}">إنهاء</button>` : '');
  const mfa = (s) => (s.mfa_verified ? '<span class="badge b-mfa">نعم</span>' : '<span class="muted">لا</span>');

  async function load() {
    const mine = await Api.get('/api/sessions/mine');
    $('#mine').innerHTML = mine.map((s) => `<tr><td>${esc(UI.device(s.user_agent))}</td><td class="mono">${esc(s.ip_address)}</td><td>${mfa(s)}</td>
      <td>${UI.date(s.created_at)}</td><td>${UI.ago(s.last_used_at)}</td><td class="muted">${UI.date(s.expires_at, false)}</td><td>${btn(s, true)}</td></tr>`).join('')
      || '<tr><td colspan="7" class="empty">لا توجد جلسات</td></tr>';
    if (canAll) {
      const all = await Api.get('/api/sessions');
      $('#allCard').hidden = false;
      $('#allCount').textContent = `${all.length} جلسة`;
      $('#all').innerHTML = all.map((s) => `<tr><td class="user-cell"><b>${esc(s.full_name)}</b><span class="mono">${esc(s.username)}</span></td>
        <td>${esc(UI.device(s.user_agent))}</td><td class="mono">${esc(s.ip_address)}</td><td>${mfa(s)}</td>
        <td>${UI.date(s.created_at)}</td><td>${UI.ago(s.last_used_at)}</td><td>${btn(s, canRevokeAny)}</td></tr>`).join('');
    }
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-revoke]');
    if (!b) return;
    try {
      await Api.del(`/api/sessions/${b.dataset.revoke}`);
      UI.toast('تم إنهاء الجلسة — لن يقبل الخادم رموزها بعد الآن');
      load();
    } catch (err) { UI.toast(err.message, 'error'); }
  });
  load();
});
