<div dir="rtl">

# توثيق واجهة REST API

- كل الطلبات والاستجابات بصيغة **JSON**.
- المسارات المحمية تتطلب الترويسة `Authorization: Bearer <accessToken>`.
- رمز التحديث يُرسل تلقائياً في Cookie اسمها `iam_refresh` (HttpOnly) على المسارات `/api/auth/*` فقط.
- رسائل الخطأ بالعربية بالشكل `{ "error": "...", "code": "...", "details": [...] }`.

## رموز الحالة المستخدمة

| الرمز | المعنى في النظام |
|---|---|
| 200 / 201 | نجاح / تم الإنشاء |
| 400 | بيانات غير صالحة أو لا تستوفي السياسة |
| 401 | غير مصادق: لا يوجد رمز، رمز منتهٍ أو معدّل، جلسة ملغاة، حساب غير نشط |
| 403 | مصادق لكن **غير مفوّض** (صلاحية ناقصة) أو حساب معلّق/معطّل/بانتظار الموافقة أو يجب تغيير كلمة المرور |
| 404 | غير موجود |
| 409 | تعارض (اسم مستخدم أو بريد مستخدم) |
| 423 | الحساب مقفل مؤقتاً |
| 429 | تجاوز حد الطلبات |

## المصادقة — `/api/auth` (عامة)

| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/register` | `{username, email, fullName, password, departmentId}` ← حساب `pending` |
| POST | `/login` | `{username, password}` ← `{accessToken, user}` أو `{mfaRequired: true, challengeToken}` |
| POST | `/mfa/verify` | `{challengeToken, code}` أو `{challengeToken, recoveryCode}` ← `{accessToken, user}` |
| POST | `/refresh` | يقرأ الـ Cookie، يدوّر رمز التحديث ← `{accessToken}` |
| POST | `/logout` | يُلغي الجلسة ويحذف الـ Cookie |
| GET | `/me` | 🔒 الهوية + الأدوار + الصلاحيات الفعلية + الجلسة الحالية |
| POST | `/change-password` | 🔒 `{currentPassword, newPassword}` — يُنهي الجلسات الأخرى |
| GET | `/departments` | قائمة الأقسام لنموذج التسجيل |

أكواد مهمة: `TOKEN_EXPIRED`, `INVALID_TOKEN`, `SESSION_REVOKED`, `SESSION_REUSE`, `CHALLENGE_EXPIRED`, `ACCOUNT_PENDING`, `ACCOUNT_SUSPENDED`, `ACCOUNT_DISABLED`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN`.

**مثال:**

```http
POST /api/auth/login
Content-Type: application/json

{ "username": "ali.alsaadi", "password": "Rafidain@2026" }
```
```json
{ "mfaRequired": true, "challengeToken": "eyJhbGciOiJIUzI1NiIs..." }
```

## المصادقة الثنائية — `/api/mfa` 🔒

| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/status` | `{enabled, recoveryCodesRemaining}` |
| POST | `/setup` | يولّد سرّاً ← `{secret, otpauthUrl, qrDataUrl}` (غير مفعّل بعد) |
| POST | `/enable` | `{code}` ← يفعّل ويعيد `recoveryCodes` (مرة واحدة) |
| POST | `/disable` | `{password, code}` |

## المستخدمون — `/api/users` 🔒

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/?q=&status=&role=&department=` | `users:read` | بحث وتصفية |
| GET | `/:id` | `users:read` | التفاصيل + الأدوار + الصلاحيات الفعلية + الجلسات |
| POST | `/` | `users:create` | Joiner: `{username, email, fullName, jobTitle, departmentId, roleIds}` ← `temporaryPassword` |
| PATCH | `/:id` | `users:update` | تعديل البيانات |
| PATCH | `/:id/status` | `users:disable` | `{status: active\|suspended\|disabled, reason}` — يُنهي الجلسات عند غير النشط |
| PUT | `/:id/roles` | `roles:assign` | `{roleIds: [...]}` — ممنوع على النفس |
| POST | `/:id/reset-password` | `users:reset_password` | كلمة مرور مؤقتة + إنهاء الجلسات |
| POST | `/:id/reset-mfa` | `users:reset_password` | إلغاء MFA (هاتف مفقود) |
| POST | `/:id/unlock` | `users:unlock` | فك القفل |

## الأدوار — `/api/roles` 🔒

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/` | `roles:read` | الأدوار مع صلاحياتها وعدد مستخدميها |
| GET | `/permissions` | `roles:read` | كل الصلاحيات |
| GET | `/matrix` | `roles:read` | مصفوفة مراجعة الوصول |
| POST | `/` | `roles:manage` | إنشاء دور `{name, label, description}` |
| PUT | `/:id/permissions` | `roles:manage` | `{permissions: ["users:read", ...]}` |
| DELETE | `/:id` | `roles:manage` | حذف دور غير أساسي |

## الجلسات — `/api/sessions` 🔒

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/mine` | — | جلساتي |
| GET | `/` | `sessions:read_all` | كل الجلسات النشطة |
| DELETE | `/:id` | صاحب الجلسة أو `sessions:revoke_any` | إنهاء جلسة |

## التدقيق — `/api/audit` 🔒

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/?q=&action=&status=&from=&to=&page=&limit=` | `audit:read` | سجل مع ترقيم صفحات |
| GET | `/export?...` | `audit:export` | ملف CSV (UTF-8 مع BOM ليفتح بالعربية في Excel) |

## لوحة المراقبة والموارد — `/api/dashboard` 🔒

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/stats` | `dashboard:view` | الإحصاءات الأمنية |
| GET | `/resources` | — | الفئات وهل المستخدم مسموح له بكل منها |
| GET | `/resources/:category` | `resources:<category>:read` | مستندات الفئة |

## تجربة الـ API من الطرفية

```bash
# 1) دخول موظف
TOKEN=$(curl -s -c jar.txt -H 'Content-Type: application/json' \
  -d '{"username":"omar.alani","password":"Rafidain@2026"}' \
  http://localhost:3000/api/auth/login | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

# 2) مسموح
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/dashboard/resources/public

# 3) مرفوض 403 ويُسجّل في التدقيق
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/audit

# 4) تجديد الرمز بالـ Cookie
curl -s -b jar.txt -c jar.txt -X POST http://localhost:3000/api/auth/refresh
```

</div>
