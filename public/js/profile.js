document.addEventListener('app:ready', async ({ detail: me }) => {
  const { $, esc } = UI;
  const u = me.user;
  $('#identity').innerHTML = `
    <dt>الاسم</dt><dd>${esc(u.fullName)}</dd>
    <dt>اسم المستخدم</dt><dd class="mono">${esc(u.username)}</dd>
    <dt>البريد</dt><dd class="mono">${esc(u.email)}</dd>
    <dt>القسم</dt><dd>${esc(u.department || '—')}</dd>
    <dt>المسمى</dt><dd>${esc(u.jobTitle || '—')}</dd>
    <dt>حالة الحساب</dt><dd>${UI.statusBadge(u.status)}</dd>
    <dt>آخر تغيير لكلمة المرور</dt><dd>${UI.date(u.passwordChangedAt)} <span class="muted">(السياسة: كل ${me.passwordPolicy.maxAgeDays} يوماً)</span></dd>
    <dt>الجلسة الحالية</dt><dd>بدأت ${UI.ago(me.session.createdAt)} ${me.session.mfaVerified ? '<span class="badge b-mfa">موثّقة بـ MFA</span>' : ''}</dd>`;
  $('#access').innerHTML = `<div class="chips" style="margin-bottom:12px">${me.roles.map((r) => `<span class="badge b-role">${esc(r.label)}</span>`).join('')}</div>
    <div class="chips">${me.permissions.map((p) => `<span class="badge b-perm">${esc(p)}</span>`).join('')}</div>
    <p class="muted" style="font-size:12.5px;margin:12px 0 0">الصلاحيات الفعلية = اتحاد صلاحيات جميع أدوارك. تُقرأ من قاعدة البيانات مع كل طلب.</p>`;

  // ---------- MFA ----------
  async function renderMfa() {
    const st = await Api.get('/api/mfa/status');
    $('#mfaBadge').innerHTML = st.enabled ? '<span class="badge b-success">مفعّلة</span>' : '<span class="badge b-pending">غير مفعّلة</span>';
    if (st.enabled) {
      $('#mfa').innerHTML = `<p>حسابك محمي بعامل ثانٍ. حتى لو سُرقت كلمة المرور لن يتمكن المهاجم من الدخول بدون هاتفك.</p>
        <p class="muted">رموز الاسترداد المتبقية: <b>${st.recoveryCodesRemaining}</b></p>
        <form id="disableForm" class="grid g-2" style="gap:10px;align-items:end"><div id="mfaAlert" hidden style="grid-column:1/-1"></div>
          <div><label>كلمة المرور</label><input name="password" type="password" class="ltr"></div>
          <div><label>رمز التطبيق</label><input name="code" type="text" class="ltr" inputmode="numeric" maxlength="6"></div>
          <div><button class="btn btn-danger btn-sm" type="submit">إيقاف المصادقة الثنائية</button></div></form>`;
      $('#disableForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try { await Api.post('/api/mfa/disable', Object.fromEntries(f)); UI.toast('تم إيقاف المصادقة الثنائية'); renderMfa(); } catch (err) { UI.alert($('#mfaAlert'), err.message); }
      });
    } else {
      $('#mfa').innerHTML = `<p>أضف طبقة حماية ثانية باستخدام تطبيق مثل Google Authenticator أو Microsoft Authenticator.</p>
        <button class="btn btn-accent" id="setupBtn">بدء الإعداد</button>`;
      $('#setupBtn').addEventListener('click', setup);
    }
  }

  async function setup() {
    const s = await Api.post('/api/mfa/setup');
    $('#mfa').innerHTML = `<div class="grid" style="grid-template-columns:auto 1fr;gap:16px;align-items:start">
        <img src="${s.qrDataUrl}" alt="QR" width="180" height="180" style="border:1px solid var(--line);border-radius:8px">
        <div><p style="margin-top:0"><b>1.</b> امسح الرمز بتطبيق المصادقة، أو أدخل المفتاح يدوياً:</p>
        <div class="secret-box" style="font-size:14px">${esc(s.secret.match(/.{1,4}/g).join(' '))}</div>
        <p><b>2.</b> أدخل الرمز الذي يظهر في التطبيق لتأكيد الربط:</p>
        <form id="enableForm"><div id="mfaAlert" hidden></div><input id="enableCode" class="code-input" maxlength="6" inputmode="numeric" style="font-size:20px;letter-spacing:6px">
        <button class="btn btn-accent" style="margin-top:10px" type="submit">تأكيد وتفعيل</button></form></div></div>`;
    $('#enableForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await Api.post('/api/mfa/enable', { code: $('#enableCode').value });
        $('#mfaBadge').innerHTML = '<span class="badge b-success">مفعّلة</span>';
        $('#mfa').innerHTML = `<div class="alert alert-success">${esc(r.message)}</div>
          <p><b>احفظ رموز الاسترداد في مكان آمن.</b> كل رمز يُستخدم مرة واحدة إذا فقدت هاتفك، ولن تظهر مرة أخرى.</p>
          <div class="codes">${r.recoveryCodes.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
          <button class="btn btn-ghost btn-sm" style="margin-top:12px" id="doneBtn">تم الحفظ</button>`;
        $('#doneBtn').addEventListener('click', renderMfa);
      } catch (err) { UI.alert($('#mfaAlert'), err.message); }
    });
  }
  renderMfa();

  // ---------- Password ----------
  const update = () => UI.renderPolicy($('#policy'), $('#password').value, u.username);
  $('#password').addEventListener('input', update);
  update();
  $('#pwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('#password').value !== $('#confirm').value) return UI.alert($('#pwdAlert'), 'كلمتا المرور غير متطابقتين');
    try {
      const r = await Api.post('/api/auth/change-password', { currentPassword: $('#current').value, newPassword: $('#password').value });
      e.target.reset();
      update();
      UI.alert($('#pwdAlert'), `${r.message} — تم إنهاء ${r.otherSessionsRevoked} جلسة على أجهزة أخرى`, 'success');
    } catch (err) { UI.alert($('#pwdAlert'), err.message, 'error', err.data?.details); }
  });
});
