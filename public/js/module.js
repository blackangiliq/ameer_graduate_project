// Small toolkit shared by the business module pages.
// IMPORTANT: buttons are rendered from `_actions` that the SERVER computed for each row
// with the same rules it enforces. The UI never decides authorization by itself.
const Mod = (() => {
  const { esc } = UI;
  const SCOPE_LABEL = { own: 'بياناتي', department: 'قسمي', all: 'كل المؤسسة' };

  const iqd = (n) => (n == null ? '—' : `<span class="money">${Number(n).toLocaleString('en-US')}</span> <small class="muted">د.ع</small>`);
  const day = (v) => (v ? `<span class="nowrap">${esc(String(v).slice(0, 10))}</span>` : '—');

  /** Shows which permissions govern this page and which ones the current user holds. */
  function permPanel(el, perms, me) {
    el.className = 'perm-panel';
    el.innerHTML = '<span class="t">الصلاحيات التي تحكم هذه الصفحة:</span>'
      + perms.map((p) => {
        const on = me.permissions.includes(p);
        return `<span class="pchip ${on ? 'on' : ''}" title="${on ? 'تملكها' : 'لا تملكها'}"><i>${on ? '✓' : '✗'}</i>${esc(p)}</span>`;
      }).join('');
  }

  /** Scope switcher (own / department / all). Tabs the user does not hold are shown disabled. */
  function scopeTabs(el, { scopes, scope, base, onChange }) {
    const all = ['own', 'department', 'all'];
    el.innerHTML = `<div class="tabs">${all.map((s) => `<button type="button" data-s="${s}" class="${s === scope ? 'on' : ''}" ${scopes.includes(s) ? '' : 'disabled'}
      title="${esc(`${base}:${s}`)}">${SCOPE_LABEL[s]}</button>`).join('')}</div>
      <span class="scope-note">النطاق الحالي: <b>${SCOPE_LABEL[scope] || '—'}</b> بموجب <span class="mono">${esc(`${base}:${scope}`)}</span></span>`;
    el.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    el.querySelectorAll('button[data-s]').forEach((b) => b.addEventListener('click', () => onChange(b.dataset.s)));
  }

  const ACTION = {
    approve: ['اعتماد', 'btn-accent'], reject: ['رفض', 'btn-ghost'], cancel: ['إلغاء الطلب', 'btn-ghost'], edit: ['تعديل', 'btn-ghost'],
    assign: ['إسناد', 'btn-ghost'], take: ['استلام', 'btn-accent'], start: ['بدء المعالجة', 'btn-ghost'], resolve: ['تم الحل', 'btn-accent'], close: ['إغلاق', 'btn'],
  };
  const actionsCell = (row) => (row._actions || []).map((a) => `<button class="btn btn-sm ${ACTION[a]?.[1] || 'btn-ghost'}" data-act="${a}" data-id="${row.id}">${ACTION[a]?.[0] || a}</button>`).join(' ')
    + (row._note ? `<div class="row-note">🔒 ${esc(row._note)}</div>` : '');

  /** Renders a table. columns: [{ label, html: row => string }] */
  function table(el, columns, rows, { empty = 'لا توجد بيانات ضمن نطاق صلاحياتك', actions = true, rowClass } = {}) {
    const cols = actions ? [...columns, { label: '', html: actionsCell }] : columns;
    el.innerHTML = `<table><thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.length
      ? rows.map((r) => `<tr class="${rowClass ? rowClass(r) : ''}">${cols.map((c) => `<td>${c.html(r)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`}</tbody></table>`;
  }

  /** Delegated click handler for row action buttons. */
  function onAction(el, handler) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (b) handler(b.dataset.act, Number(b.dataset.id), b);
    });
  }

  /** Generic modal form. fields: [{ name, label, type, options:[[v,l]], value, required }] */
  function form(title, fields, onSubmit, submitLabel = 'حفظ') {
    const input = (f) => {
      if (f.type === 'select') return `<select name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      if (f.type === 'textarea') return `<textarea name="${f.name}">${esc(f.value ?? '')}</textarea>`;
      return `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.ltr ? 'class="ltr"' : ''}>`;
    };
    const overlay = UI.modal(`<div class="modal"><div class="card-head"><h3>${esc(title)}</h3><button class="x" data-close>×</button></div>
      <form novalidate><div class="card-body"><div class="m-alert" hidden></div>
      ${fields.map((f) => `<div class="field"><label>${esc(f.label)}</label>${input(f)}${f.hint ? `<small class="muted">${esc(f.hint)}</small>` : ''}</div>`).join('')}</div>
      <div class="modal-foot"><button class="btn btn-accent" type="submit">${esc(submitLabel)}</button><button class="btn btn-ghost" type="button" data-close>إلغاء</button></div></form></div>`);
    overlay.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        await onSubmit(data);
        overlay.remove();
      } catch (err) {
        UI.alert(overlay.querySelector('.m-alert'), err.message, 'error', err.data?.details);
      }
    });
    return overlay;
  }

  /** Run an API call and show the outcome (403 reasons from the server are shown as-is). */
  async function run(promise, okMessage) {
    try {
      const r = await promise;
      UI.toast(okMessage || r?.message || 'تم');
      return r;
    } catch (err) {
      UI.toast(`${err.status === 403 ? '⛔ ' : ''}${err.message}`, 'error');
      return null;
    }
  }

  const params = () => new URLSearchParams(location.search);

  return { iqd, day, permPanel, scopeTabs, table, onAction, form, run, params, SCOPE_LABEL };
})();
