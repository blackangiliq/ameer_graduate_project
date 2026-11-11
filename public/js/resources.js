document.addEventListener('app:ready', async () => {
  const { $, esc } = UI;
  const META = {
    public: ['المستندات العامة', 'سياسات وأدلة متاحة لكل موظف'],
    hr: ['الموارد البشرية', 'الرواتب، التقييمات، ملفات التوظيف'],
    finance: ['المالية', 'الموازنة، الإيرادات، المدفوعات'],
    it: ['البنية التحتية', 'الشبكة، الخوادم، الاستجابة للحوادث'],
  };
  const cats = await Api.get('/api/dashboard/resources');
  $('#cats').innerHTML = cats.map((c) => `<button type="button" class="card res-card ${c.allowed ? '' : 'denied'}" data-cat="${c.category}" style="text-align:start;font:inherit;cursor:pointer">
      <span class="lock badge ${c.allowed ? 'b-success' : 'b-failure'}">${c.allowed ? 'مسموح' : 'غير مسموح'}</span>
      <span class="muted" style="font-size:12.5px">${c.count} مستندات</span>
      <h3>${META[c.category][0]}</h3>
      <p class="muted" style="margin:4px 0 10px;font-size:13px">${META[c.category][1]}</p>
      <span class="badge b-perm">${esc(c.permission)}</span></button>`).join('');

  $('#cats').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-cat]');
    if (!card) return;
    const cat = card.dataset.cat;
    $('#docTitle').textContent = META[cat][0];
    try {
      const docs = await Api.get(`/api/dashboard/resources/${cat}`);
      $('#docPerm').innerHTML = '<span class="badge b-success">HTTP 200 — تم التحقق من الصلاحية</span>';
      $('#docs').innerHTML = docs.map((d) => `<div class="doc"><h4>${esc(d.title)} <span class="badge ${d.classification === 'عام' ? 'b-role' : 'b-pending'}">${esc(d.classification)}</span></h4><p>${esc(d.body)}</p></div>`).join('');
    } catch (err) {
      $('#docPerm').innerHTML = `<span class="badge b-failure">HTTP ${err.status}</span>`;
      $('#docs').innerHTML = `<div class="forbidden" style="padding:30px"><div class="code" style="font-size:44px">403</div><h2 style="font-size:18px">${esc(err.message)}</h2>
        <p>الصلاحية المطلوبة: <span class="badge b-perm">${esc((err.data?.required || []).join(', '))}</span></p>
        <p class="muted">رفض الخادم الطلب وسجّل المحاولة في سجل التدقيق بالحدث <span class="mono">access.denied</span>.</p></div>`;
    }
  });
});
