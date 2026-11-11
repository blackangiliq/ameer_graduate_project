document.addEventListener('app:ready', async () => {
  const { $, esc } = UI;
  const s = await Api.get('/api/dashboard/stats');
  const u = s.users;
  const mfaPct = u.active ? Math.round((u.mfa / u.active) * 100) : 0;

  $('#stats').innerHTML = [
    `<div class="card stat"><div class="label">إجمالي الهويات</div><div class="value">${u.total}</div><div class="foot">${u.active} نشط · ${u.suspended} معلّق/معطّل</div></div>`,
    `<div class="card stat warn"><div class="label">بانتظار الموافقة</div><div class="value">${u.pending}</div><div class="foot"><a href="/users">مراجعة الطلبات ←</a></div></div>`,
    `<div class="card stat ${u.locked ? 'bad' : ''}"><div class="label">حسابات مقفلة الآن</div><div class="value">${u.locked}</div><div class="foot">بسبب ${5} محاولات فاشلة متتالية</div></div>`,
    `<div class="card stat good"><div class="label">الجلسات النشطة</div><div class="value">${s.activeSessions}</div><div class="foot"><a href="/sessions">إدارة الجلسات ←</a></div></div>`,
    `<div class="card stat good"><div class="label">دخول ناجح (24 ساعة)</div><div class="value">${s.logins24.success}</div></div>`,
    `<div class="card stat bad"><div class="label">محاولات فاشلة/مرفوضة (24 ساعة)</div><div class="value">${s.logins24.failure}</div></div>`,
    `<div class="card stat warn"><div class="label">رفض تفويض (403) خلال 24 ساعة</div><div class="value">${s.logins24.denied}</div></div>`,
    `<div class="card stat"><div class="label">تغطية المصادقة الثنائية</div><div class="value">${mfaPct}%</div><div class="meter"><div style="width:${mfaPct}%"></div></div><div class="foot">${u.mfa} من ${u.active} حساب نشط</div></div>`,
  ].join('');

  // Bar chart (last 14 days, fill missing days with zero)
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push(s.daily.find((x) => x.day === d) || { day: d, success: 0, failure: 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.success + d.failure));
  $('#chart').innerHTML = days.map((d) => `<div class="col" title="${d.day}: ${d.success} ناجحة، ${d.failure} فاشلة">
      <div class="seg-bad" style="height:${(d.failure / max) * 100}%"></div>
      <div class="seg-ok" style="height:${(d.success / max) * 100}%"></div></div>`).join('');
  $('#chartX').innerHTML = days.map((d) => `<span>${d.day.slice(8)}/${d.day.slice(5, 7)}</span>`).join('');

  const rmax = Math.max(1, ...s.roles.map((r) => r.n));
  $('#roles').innerHTML = s.roles.map((r) => `<div class="hbar"><span>${esc(r.label)}</span><div class="track"><div class="fill" style="width:${(r.n / rmax) * 100}%"></div></div><span class="n">${r.n}</span></div>`).join('');

  $('#recent').innerHTML = s.recent.map((e) => `<tr>
      <td class="muted">${UI.ago(e.created_at)}</td>
      <td class="mono">${esc(e.actor_username || '—')}</td>
      <td class="mono">${esc(e.action)}</td>
      <td>${UI.statusBadge(e.status)}</td>
      <td class="mono">${esc(e.ip_address || '')}</td></tr>`).join('');

  const imax = Math.max(1, ...s.topFailedIps.map((r) => r.n));
  $('#ips').innerHTML = s.topFailedIps.length
    ? s.topFailedIps.map((r) => `<div class="hbar"><span class="mono">${esc(r.ip_address)}</span><div class="track"><div class="fill" style="width:${(r.n / imax) * 100}%;background:var(--danger)"></div></div><span class="n">${r.n}</span></div>`).join('')
      + '<p class="muted" style="font-size:12.5px;margin:10px 0 0">العناوين الخارجية (غير 10.x / 172.16.x) تشير إلى محاولات تخمين أو رش كلمات مرور من الإنترنت.</p>'
    : '<p class="muted">لا توجد محاولات فاشلة.</p>';
});
