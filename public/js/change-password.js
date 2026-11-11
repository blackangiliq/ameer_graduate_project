(() => {
  const { $ } = UI;
  let username = '';
  Api.refresh().then((s) => {
    if (!s) { location.href = '/login'; return; }
    username = s.user.username;
    if (!s.user.mustChangePassword) location.href = '/profile';
  });
  const update = () => UI.renderPolicy($('#policy'), $('#password').value, username);
  $('#password').addEventListener('input', update);
  update();

  $('#changeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('#password').value !== $('#confirm').value) return UI.alert($('#chAlert'), 'كلمتا المرور غير متطابقتين');
    try {
      await Api.post('/api/auth/change-password', { currentPassword: $('#current').value, newPassword: $('#password').value });
      UI.alert($('#chAlert'), 'تم تعيين كلمة المرور الجديدة، جارٍ التحويل...', 'success');
      setTimeout(() => { location.href = '/home'; }, 1000);
    } catch (err) {
      UI.alert($('#chAlert'), err.message, 'error', err.data?.details);
    }
  });
})();
