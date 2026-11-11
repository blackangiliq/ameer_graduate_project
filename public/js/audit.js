document.addEventListener('app:ready', ({ detail: me }) => {
  const { $, esc } = UI;
  let page = 1;
  const LABELS = {
    'auth.login': 'تسجيل دخول', 'auth.logout': 'تسجيل خروج', 'auth.account_locked': 'قفل الحساب',
    'auth.mfa.challenge': 'طلب رمز MFA', 'auth.mfa.verify': 'التحقق من MFA', 'auth.password.change': 'تغيير كلمة المرور',
    'auth.refresh_token_reuse': 'إعادة استخدام رمز تحديث مسروق', 'access.denied': 'رفض وصول', 'user.create': 'إنشاء مستخدم',
    'user.register': 'طلب تسجيل', 'user.approve': 'موافقة على حساب', 'user.update': 'تعديل مستخدم', 'user.status_change': 'تغيير حالة حساب',
    'user.roles.update': 'تعديل أدوار', 'user.password.reset': 'إعادة تعيين كلمة مرور', 'user.unlock': 'فك قفل', 'user.mfa.reset': 'إعادة ضبط MFA',
    'role.create': 'إنشاء دور', 'role.permissions.update': 'تعديل صلاحيات دور', 'role.delete': 'حذف دور', 'session.revoke': 'إنهاء جلسة',
    'mfa.enable': 'تفعيل MFA', 'mfa.disable': 'إيقاف MFA', 'mfa.setup_started': 'بدء إعداد MFA', 'audit.export': 'تصدير السجل', 'resource.read': 'قراءة مورد',
  };

  function detailsText(d) {
    if (!d) return '';
    return Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') || '—' : typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  }

  function query() {
    return new URLSearchParams({ q: $('#q').value, action: $('#fAction').value, status: $('#fStatus').value, from: $('#from').value, to: $('#to').value });
  }

  async function load() {
    const qs = query();
    qs.set('page', page);
    qs.set('limit', 25);
    const r = await Api.get(`/api/audit?${qs}`);
    $('#rows').innerHTML = r.rows.length ? r.rows.map((e) => `<tr>
      <td class="mono muted">${e.id}</td>
      <td style="white-space:nowrap">${UI.date(e.created_at)}</td>
      <td class="mono">${esc(e.actor_username || '—')}</td>
      <td><b style="font-weight:600">${esc(LABELS[e.action] || e.action)}</b><div class="mono muted" style="font-size:11.5px">${esc(e.action)}</div></td>
      <td class="mono" style="font-size:12px">${esc(e.target_type ? `${e.target_type}:${e.target_id}` : '')}</td>
      <td>${UI.statusBadge(e.status)}</td>
      <td><span class="mono">${esc(e.ip_address || '')}</span><div class="muted" style="font-size:11.5px">${esc(UI.device(e.user_agent || ''))}</div></td>
      <td class="muted" style="font-size:12px;max-width:280px">${esc(detailsText(e.details))}</td></tr>`).join('')
      : '<tr><td colspan="8" class="empty">لا توجد أحداث مطابقة</td></tr>';
    const pages = Math.max(1, Math.ceil(r.total / r.limit));
    $('#pageInfo').textContent = `${r.total} حدث — صفحة ${r.page} من ${pages}`;
    $('#prev').disabled = page <= 1;
    $('#next').disabled = page >= pages;
  }

  let t;
  $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { page = 1; load(); }, 300); });
  ['#fAction', '#fStatus', '#from', '#to'].forEach((s) => $(s).addEventListener('change', () => { page = 1; load(); }));
  $('#prev').addEventListener('click', () => { page--; load(); });
  $('#next').addEventListener('click', () => { page++; load(); });

  if (me.permissions.includes('audit:export')) {
    $('#exportBtn').hidden = false;
    $('#exportBtn').addEventListener('click', async () => {
      const res = await Api.download(`/api/audit/export?${query()}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
  load();
});
