// Two-step login: password -> (if enabled) TOTP code.
(() => {
  const { $ } = UI;
  let challengeToken = null;
  let useRecovery = false;
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'; // no open redirect

  if (params.has('logged_out')) UI.alert($('#loginAlert'), 'تم تسجيل الخروج وإنهاء الجلسة بنجاح', 'success');

  // Already signed in? (valid refresh cookie) -> go straight in.
  Api.refresh().then((s) => { if (s && !params.has('logged_out')) goIn(s.user); });

  async function goIn(user) {
    if (user?.mustChangePassword) { location.href = '/change-password'; return; }
    // Employees without the dashboard permission land on their workspace.
    try {
      const me = await Api.get('/api/auth/me');
      location.href = safeNext !== '/dashboard' ? safeNext
        : me.permissions.includes('dashboard:view') ? '/dashboard' : '/resources';
    } catch { location.href = '/resources'; }
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    try {
      const data = await Api.post('/api/auth/login', { username: $('#username').value, password: $('#password').value });
      if (data.mfaRequired) {
        challengeToken = data.challengeToken;
        $('#step1').hidden = true;
        $('#step2').hidden = false;
        $('#code').focus();
        return;
      }
      Api.setToken(data.accessToken);
      goIn(data.user);
    } catch (err) {
      const d = err.data || {};
      let msg = err.message;
      if (d.remainingAttempts !== undefined && d.remainingAttempts > 0 && d.remainingAttempts <= 3) {
        msg += ` — تبقّت ${d.remainingAttempts} محاولات قبل قفل الحساب`;
      }
      UI.alert($('#loginAlert'), msg, err.status === 423 || err.status === 403 ? 'warn' : 'error');
      $('#password').value = '';
    } finally { btn.disabled = false; }
  });

  $('#toggleRecovery').addEventListener('click', (e) => {
    e.preventDefault();
    useRecovery = !useRecovery;
    $('#totpField').hidden = useRecovery;
    $('#recoveryField').hidden = !useRecovery;
    e.target.textContent = useRecovery ? 'استخدام رمز التطبيق بدلاً من ذلك' : 'فقدت هاتفك؟ استخدم رمز استرداد';
  });

  $('#code').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (e.target.value.length === 6) $('#mfaForm').requestSubmit();
  });

  $('#mfaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = useRecovery ? { challengeToken, recoveryCode: $('#recovery').value } : { challengeToken, code: $('#code').value };
    try {
      const data = await Api.post('/api/auth/mfa/verify', body);
      Api.setToken(data.accessToken);
      goIn(data.user);
    } catch (err) {
      UI.alert($('#mfaAlert'), err.message);
      $('#code').value = '';
      if (err.data?.code === 'CHALLENGE_EXPIRED') setTimeout(() => { location.href = '/login'; }, 1500);
    }
  });
})();
