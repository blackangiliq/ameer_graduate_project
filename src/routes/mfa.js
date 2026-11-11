// MFA enrolment: setup (QR) -> confirm with first code -> recovery codes. Disable needs password + code.
const express = require('express');
const QRCode = require('qrcode');
const db = require('../db/database');
const config = require('../config');
const totp = require('../services/totp');
const password = require('../services/password');
const audit = require('../services/audit');
const { encrypt, decrypt, sha256 } = require('../services/crypto');
const crypto = require('node:crypto');

const router = express.Router();

function newRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < config.mfa.recoveryCodes; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

router.post('/setup', async (req, res) => {
  const user = db.get('SELECT id, username, mfa_enabled FROM users WHERE id = ?', req.user.id);
  if (user.mfa_enabled) return res.status(400).json({ error: 'المصادقة الثنائية مفعّلة مسبقاً' });

  const secret = totp.generateSecret();
  // Stored encrypted, but NOT enabled until the user proves the app is set up correctly.
  db.run('UPDATE users SET mfa_secret_enc = ? WHERE id = ?', encrypt(secret), user.id);
  const url = totp.otpauthUrl(secret, user.username);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#14213d', light: '#ffffff' } });
  audit.log(req, { action: 'mfa.setup_started', targetType: 'user', targetId: user.id });
  res.json({ secret, otpauthUrl: url, qrDataUrl: qr });
});

router.post('/enable', (req, res) => {
  const user = db.get('SELECT id, mfa_enabled, mfa_secret_enc FROM users WHERE id = ?', req.user.id);
  if (user.mfa_enabled) return res.status(400).json({ error: 'المصادقة الثنائية مفعّلة مسبقاً' });
  if (!user.mfa_secret_enc) return res.status(400).json({ error: 'ابدأ الإعداد أولاً' });
  if (!totp.verify(decrypt(user.mfa_secret_enc), req.body?.code)) {
    audit.log(req, { action: 'mfa.enable', status: 'failure', targetType: 'user', targetId: user.id });
    return res.status(400).json({ error: 'الرمز غير صحيح، تأكد من وقت جهازك وحاول مجدداً' });
  }

  const codes = newRecoveryCodes();
  db.transaction(() => {
    db.run('UPDATE users SET mfa_enabled = 1 WHERE id = ?', user.id);
    db.run('DELETE FROM mfa_recovery_codes WHERE user_id = ?', user.id);
    for (const c of codes) db.run('INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)', user.id, sha256(c));
  });
  audit.log(req, { action: 'mfa.enable', targetType: 'user', targetId: user.id });
  // Recovery codes are shown ONCE; only their hashes are kept.
  res.json({ message: 'تم تفعيل المصادقة الثنائية', recoveryCodes: codes });
});

router.post('/disable', async (req, res) => {
  const user = db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!user.mfa_enabled) return res.status(400).json({ error: 'المصادقة الثنائية غير مفعّلة' });
  const okPassword = await password.compare(String(req.body?.password || ''), user.password_hash);
  const okCode = totp.verify(decrypt(user.mfa_secret_enc), req.body?.code);
  if (!okPassword || !okCode) {
    audit.log(req, { action: 'mfa.disable', status: 'failure', targetType: 'user', targetId: user.id });
    return res.status(400).json({ error: 'كلمة المرور أو رمز التحقق غير صحيح' });
  }
  db.transaction(() => {
    db.run('UPDATE users SET mfa_enabled = 0, mfa_secret_enc = NULL WHERE id = ?', user.id);
    db.run('DELETE FROM mfa_recovery_codes WHERE user_id = ?', user.id);
  });
  audit.log(req, { action: 'mfa.disable', targetType: 'user', targetId: user.id });
  res.json({ message: 'تم إيقاف المصادقة الثنائية' });
});

router.get('/status', (req, res) => {
  const remaining = db.get(
    'SELECT COUNT(*) AS n FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL', req.user.id,
  ).n;
  res.json({ enabled: !!req.user.mfa_enabled, recoveryCodesRemaining: remaining });
});

module.exports = router;
