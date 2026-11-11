// Front-end API client.
// The access token lives ONLY in this variable (memory) – never in localStorage –
// so a malicious script cannot steal it from storage. On every page load the
// HttpOnly refresh cookie is exchanged for a fresh access token (silent refresh).
const Api = (() => {
  let accessToken = null;
  let refreshing = null;

  async function refresh() {
    // One refresh at a time even if several requests expire together.
    refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) { accessToken = null; return null; }
        const data = await res.json();
        accessToken = data.accessToken;
        return data;
      })
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  async function request(method, url, body, { retry = true, raw = false } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(url, {
      method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Access token expired -> try a silent refresh once, then repeat the request.
    if (res.status === 401 && retry && !url.startsWith('/api/auth/')) {
      const ok = await refresh();
      if (ok) return request(method, url, body, { retry: false, raw });
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      throw new Error('غير مصادق');
    }
    if (raw) return res;
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (!res.ok) {
      if (data?.code === 'PASSWORD_CHANGE_REQUIRED' && location.pathname !== '/change-password') {
        location.href = '/change-password';
      }
      const err = new Error(data?.error || `خطأ ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    refresh,
    setToken: (t) => { accessToken = t; },
    hasToken: () => !!accessToken,
    get: (u) => request('GET', u),
    post: (u, b = {}) => request('POST', u, b),
    put: (u, b = {}) => request('PUT', u, b),
    patch: (u, b = {}) => request('PATCH', u, b),
    del: (u) => request('DELETE', u),
    download: (u) => request('GET', u, undefined, { raw: true }),
  };
})();

// ---------- Small UI helpers shared by all pages ----------
const UI = {
  esc(value) {
    // Every value inserted into HTML goes through this: prevents stored XSS.
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  $: (sel, root = document) => root.querySelector(sel),
  $$: (sel, root = document) => [...root.querySelectorAll(sel)],
  // Dates are stored in UTC; show them in Baghdad time.
  date(value, withTime = true) {
    if (!value) return '—';
    const d = new Date(value.replace(' ', 'T') + 'Z');
    return d.toLocaleString('ar-IQ-u-nu-latn', {
      timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  },
  ago(value) {
    if (!value) return '—';
    const diff = (Date.now() - new Date(value.replace(' ', 'T') + 'Z').getTime()) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `قبل ${Math.round(diff / 60)} دقيقة`;
    if (diff < 86400) return `قبل ${Math.round(diff / 3600)} ساعة`;
    return `قبل ${Math.round(diff / 86400)} يوم`;
  },
  statusBadge(status) {
    const map = { active: 'نشط', pending: 'بانتظار الموافقة', suspended: 'معلّق', disabled: 'معطّل', success: 'نجاح', failure: 'فشل', denied: 'مرفوض' };
    return `<span class="badge b-${UI.esc(status)}">${map[status] || UI.esc(status)}</span>`;
  },
  device(ua = '') {
    const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /python-requests/.test(ua) ? 'Python script' : /Firefox/.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'متصفح';
    return [br, os].filter(Boolean).join(' · ');
  },
  toast(message, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : ''}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  },
  alert(el, message, type = 'error', details = []) {
    el.className = `alert alert-${type}`;
    el.innerHTML = UI.esc(message) + (details?.length ? `<ul>${details.map((d) => `<li>${UI.esc(d)}</li>`).join('')}</ul>` : '');
    el.hidden = false;
  },
  modal(html) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = html;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  },
  // Live password-policy checklist (mirrors the server rules; the server is still the authority).
  policyChecks(pwd, username = '') {
    return [
      ['10 أحرف على الأقل', pwd.length >= 10],
      ['حرف صغير a-z', /[a-z]/.test(pwd)],
      ['حرف كبير A-Z', /[A-Z]/.test(pwd)],
      ['رقم 0-9', /\d/.test(pwd)],
      ['رمز خاص ! @ # $', /[^A-Za-z0-9]/.test(pwd)],
      ['لا يحتوي اسم المستخدم', !username || username.length < 3 || !pwd.toLowerCase().includes(username.toLowerCase())],
    ];
  },
  renderPolicy(listEl, pwd, username) {
    listEl.innerHTML = UI.policyChecks(pwd, username)
      .map(([label, ok]) => `<li class="${ok ? 'ok' : ''}">${label}</li>`).join('');
  },
};
