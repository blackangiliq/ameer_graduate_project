(() => {
  const { $ } = UI;
  fetch('/api/auth/departments').then((r) => r.json()).then((rows) => {
    $('#department').innerHTML = rows.map((d) => `<option value="${d.id}">${UI.esc(d.name)}</option>`).join('');
  });
  const update = () => UI.renderPolicy($('#policy'), $('#password').value, $('#username').value);
  $('#password').addEventListener('input', update);
  $('#username').addEventListener('input', update);
  update();

  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('#password').value !== $('#confirm').value) return UI.alert($('#regAlert'), 'كلمتا المرور غير متطابقتين');
    try {
      const data = await Api.post('/api/auth/register', {
        fullName: $('#fullName').value, username: $('#username').value, email: $('#email').value,
        password: $('#password').value, departmentId: $('#department').value,
      });
      $('#registerForm').reset();
      update();
      UI.alert($('#regAlert'), data.message, 'success');
    } catch (err) {
      UI.alert($('#regAlert'), err.message, 'error', err.data?.details);
    }
  });
})();
