// Password hashing and password policy.
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db/database');

// A short list of the most common leaked passwords (subset of public breach lists).
const COMMON = new Set([
  'password', 'password1', 'password123', '123456', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'abc123', '111111', 'iloveyou', 'admin', 'admin123', 'welcome',
  'welcome1', 'letmein', 'monkey', 'dragon', 'football', 'baseball', 'passw0rd', 'p@ssw0rd',
  'p@ssword1', 'iraq123', 'baghdad123', 'qwertyuiop', 'trustno1', 'superman', 'master',
]);

const hash = (plain) => bcrypt.hash(plain, config.password.bcryptCost);
const compare = (plain, hashed) => bcrypt.compare(plain, hashed);

// A real bcrypt hash used when the username does not exist, so the response
// time is the same for "unknown user" and "wrong password" (prevents user enumeration).
let dummyHash;
async function dummyCompare(plain) {
  dummyHash ??= await bcrypt.hash('dummy-password-for-timing', config.password.bcryptCost);
  await bcrypt.compare(plain, dummyHash);
  return false;
}

/** Returns a list of policy violations (Arabic messages). Empty list = valid. */
function validatePolicy(password, { username = '', email = '' } = {}) {
  const errors = [];
  const p = String(password || '');
  if (p.length < config.password.minLength) errors.push(`يجب ألا تقل كلمة المرور عن ${config.password.minLength} أحرف`);
  if (p.length > 128) errors.push('كلمة المرور طويلة جداً (الحد الأقصى 128)');
  if (!/[a-z]/.test(p)) errors.push('يجب أن تحتوي على حرف إنجليزي صغير');
  if (!/[A-Z]/.test(p)) errors.push('يجب أن تحتوي على حرف إنجليزي كبير');
  if (!/\d/.test(p)) errors.push('يجب أن تحتوي على رقم');
  if (!/[^A-Za-z0-9]/.test(p)) errors.push('يجب أن تحتوي على رمز خاص مثل ! @ # $');
  if (COMMON.has(p.toLowerCase())) errors.push('كلمة المرور شائعة ومسرّبة، اختر غيرها');
  const lower = p.toLowerCase();
  if (username && username.length >= 3 && lower.includes(username.toLowerCase())) errors.push('لا يجوز أن تحتوي على اسم المستخدم');
  const local = email.split('@')[0];
  if (local && local.length >= 3 && lower.includes(local.toLowerCase())) errors.push('لا يجوز أن تحتوي على البريد الإلكتروني');
  return errors;
}

/** True if the password matches the current or one of the last N passwords. */
async function isReused(userId, plain) {
  const rows = db.all(
    'SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    userId, config.password.historySize,
  );
  for (const row of rows) if (await compare(plain, row.password_hash)) return true;
  return false;
}

function addToHistory(userId, passwordHash) {
  db.run('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)', userId, passwordHash);
  // keep only the latest N entries
  db.run(`DELETE FROM password_history WHERE user_id = ? AND id NOT IN
          (SELECT id FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT ?)`,
  userId, userId, config.password.historySize);
}

/** Temporary password for admin-created accounts / resets: satisfies the policy. */
function generateTemporary() {
  const crypto = require('node:crypto');
  const pick = (set) => set[crypto.randomInt(set.length)];
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'];
  const chars = sets.map(pick);
  const all = sets.join('');
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { hash, compare, dummyCompare, validatePolicy, isReused, addToHistory, generateTemporary };
