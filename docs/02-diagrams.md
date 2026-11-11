<div dir="rtl">

# مخططات المشروع

كل مخطط موجود بصيغتين: **صورة PNG** جاهزة للطباعة أو لإدراجها في التقرير الورقي، و**مصدر Mermaid** (ملفات `.mmd` في مجلد `diagrams/`) يعرضه GitHub تلقائياً ويمكن تعديله وإعادة توليده من [mermaid.live](https://mermaid.live).

| # | المخطط | النوع |
|---|---|---|
| 1 | [المخطط المعماري (Architecture)](#01-architecture) | معماري |
| 2 | [مخطط الكيانات والعلاقات (ERD)](#02-erd) | قاعدة بيانات |
| 3 | [دورة حياة الهوية (Identity Lifecycle — Joiner / Mover / Leaver)](#03-identity-lifecycle) | مخطط حالات (State) |
| 4 | [دورة حياة رمز التحديث والجلسة (Token / Session Lifecycle)](#07-token-lifecycle) | مخطط حالات (State) |
| 5 | [مخطط تدفق تسجيل الدخول (Login Flowchart)](#04-login-flowchart) | مخطط تدفق (Flowchart) |
| 6 | [مخطط تدفق التفويض لكل طلب (Authorization Flowchart)](#05-authorization-flowchart) | مخطط تدفق (Flowchart) |
| 7 | [مخطط التتابع: الدخول بخطوتين ثم التجديد ثم الخروج (Sequence Diagram)](#06-auth-sequence) | مخطط تتابع (Sequence) |
| 8 | [نموذج التحكم بالوصول المبني على الأدوار (RBAC Model)](#08-rbac-model) | نموذج مفاهيمي |
| 9 | [دورة حياة تطوير النظام (SDLC — النموذج التكراري التزايدي)](#09-sdlc) | دورة حياة التطوير |

---

<a id="01-architecture"></a>

## 1. المخطط المعماري (Architecture)

معمارية ثلاثية الطبقات. **طبقة العرض** صفحات HTML/JS في المتصفح تتواصل فقط عبر `api.js` الذي يحفظ رمز الوصول في الذاكرة ويجدده تلقائياً. **طبقة التطبيق** تبدأ بطبقة حماية عامة (Helmet، تحديد المعدل)، ثم مسارات المصادقة العامة `/api/auth`، وكل المسارات الأخرى تمر أولاً بـ **نقطة فرض السياسة (PEP)**: `authenticate` ← `requirePasswordChanged` ← `requirePermission`. المسارات لا تحتوي منطقاً أمنياً معقداً بل تستدعي **طبقة الخدمات**، والخدمات وحدها تتعامل مع **طبقة البيانات** باستعلامات مُعدّة مسبقاً (Prepared Statements).

![المخطط المعماري (Architecture)](diagrams/01-architecture.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart TB
  subgraph CLIENT["طبقة العرض — المتصفح (HTML + CSS + JavaScript)"]
    direction LR
    P1["صفحات الدخول والتسجيل<br/>login · register · change-password"]
    P2["صفحات الإدارة<br/>dashboard · users · roles · audit · sessions"]
    P3["مساحة الموظف<br/>resources · profile (MFA)"]
    API["api.js<br/>Access Token في الذاكرة فقط<br/>+ Silent Refresh"]
    P1 --> API
    P2 --> API
    P3 --> API
  end

  API -- "HTTPS · JSON<br/>Authorization: Bearer JWT<br/>Cookie: iam_refresh (HttpOnly)" --> MW

  subgraph SERVER["طبقة التطبيق — Node.js + Express 5"]
    direction TB
    MW["طبقة الحماية العامة<br/>Helmet (CSP, HSTS, X-Frame) · Rate Limit · JSON size limit · Cookie Parser"]
    subgraph ROUTES["الموجّهات REST API"]
      direction LR
      R1["/api/auth<br/>login · mfa · refresh · logout"]
      R2["/api/users<br/>Joiner · Mover · Leaver"]
      R3["/api/roles<br/>RBAC Policy"]
      R4["/api/audit · /api/sessions<br/>/api/dashboard · /api/mfa"]
    end
    PEP["نقطة فرض السياسة (PEP)<br/>authenticate ← requirePasswordChanged ← requirePermission"]
    subgraph SVC["طبقة الخدمات"]
      direction LR
      S1["password.js<br/>bcrypt + Policy + History"]
      S2["tokens.js<br/>JWT + Refresh Rotation"]
      S3["totp.js<br/>RFC 6238"]
      S4["rbac.js<br/>User→Role→Permission"]
      S5["crypto.js<br/>AES-256-GCM · SHA-256"]
      S6["audit.js<br/>سجل التدقيق"]
    end
    MW --> R1
    MW --> PEP --> ROUTES
    R1 --> SVC
    ROUTES --> SVC
  end

  SVC -- "Prepared Statements" --> DB

  subgraph DATA["طبقة البيانات — SQLite (node:sqlite)"]
    DB[("iam.db<br/>users · roles · permissions<br/>sessions · audit_logs · resources")]
  end
```

<div dir="rtl">

</details>

---

<a id="02-erd"></a>

## 2. مخطط الكيانات والعلاقات (ERD)

المستخدم ينتمي لقسم واحد. العلاقة **مستخدم ↔ دور** و**دور ↔ صلاحية** كثير-إلى-كثير عبر الجدولين الوسيطين `user_roles` و`role_permissions` (المفتاح الأساسي مركّب من العمودين فلا يتكرر الإسناد). للمستخدم عدة جلسات، وسجل كلمات مرور، ورموز استرداد، وأحداث تدقيق. الحقول الحساسة لا تُخزّن صريحة: `password_hash` (bcrypt)، `mfa_secret_enc` (AES-256-GCM)، `refresh_token_hash` و`code_hash` (SHA-256).

![مخطط الكيانات والعلاقات (ERD)](diagrams/02-erd.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
erDiagram
  DEPARTMENTS ||--o{ USERS : "يضم"
  USERS ||--o{ USER_ROLES : "يملك"
  ROLES ||--o{ USER_ROLES : "يُسند إلى"
  ROLES ||--o{ ROLE_PERMISSIONS : "يحتوي"
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : "تُمنح عبر"
  USERS ||--o{ SESSIONS : "يفتح"
  USERS ||--o{ PASSWORD_HISTORY : "له"
  USERS ||--o{ MFA_RECOVERY_CODES : "له"
  USERS ||--o{ AUDIT_LOGS : "ينفّذ"

  DEPARTMENTS { int id PK
    text name
    text code }
  USERS { int id PK
    text username UK
    text email UK
    text full_name
    int department_id FK
    text password_hash "bcrypt"
    text status "pending|active|suspended|disabled"
    int must_change_password
    int failed_attempts
    text locked_until
    int mfa_enabled
    text mfa_secret_enc "AES-256-GCM"
    text last_login_at }
  ROLES { int id PK
    text name UK
    text label
    int is_system }
  PERMISSIONS { int id PK
    text name UK "resource:action"
    text category }
  USER_ROLES { int user_id PK,FK
    int role_id PK,FK
    int assigned_by FK }
  ROLE_PERMISSIONS { int role_id PK,FK
    int permission_id PK,FK }
  SESSIONS { text id PK "UUID = JWT sid"
    int user_id FK
    text refresh_token_hash "SHA-256"
    text ip_address
    int mfa_verified
    text expires_at
    text revoked_at }
  PASSWORD_HISTORY { int id PK
    int user_id FK
    text password_hash }
  MFA_RECOVERY_CODES { int id PK
    int user_id FK
    text code_hash "SHA-256"
    text used_at }
  AUDIT_LOGS { int id PK
    text created_at
    int actor_id FK
    text action
    text target_type
    text status "success|failure|denied"
    text ip_address
    text details "JSON" }
  RESOURCES { int id PK
    text category "public|hr|finance|it"
    text title
    text classification }
```

<div dir="rtl">

</details>

---

<a id="03-identity-lifecycle"></a>

## 3. دورة حياة الهوية (Identity Lifecycle — Joiner / Mover / Leaver)

يدخل الحساب النظام بطريقتين: **تسجيل ذاتي** (يبقى `pending` حتى موافقة مسؤول الهويات) أو **إنشاء من المسؤول** (نشط لكن بكلمة مرور مؤقتة يجب تغييرها). الحساب النشط قد يُ**قفل مؤقتاً** آلياً بعد 5 محاولات فاشلة، وقد يتغير دوره (**Mover**) ويسري التغيير فوراً، وقد **يُعلّق** مؤقتاً، وعند مغادرة الموظف يُ**عطّل** نهائياً (**Leaver**). كل انتقال إلى حالة غير نشطة **يُنهي جميع جلسات الحساب فوراً**، وكل انتقال يُسجَّل في سجل التدقيق مع السبب.

![دورة حياة الهوية (Identity Lifecycle — Joiner / Mover / Leaver)](diagrams/03-identity-lifecycle.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Pending : تسجيل ذاتي<br/>register
  [*] --> Active_TempPwd : إنشاء من المسؤول (Joiner)<br/>كلمة مرور مؤقتة
  Pending --> Active : موافقة مسؤول الهويات<br/>user.approve
  Active_TempPwd --> Active : أول دخول + تغيير كلمة المرور
  Active --> Locked : 5 محاولات فاشلة
  Locked --> Active : مرور 15 دقيقة<br/>أو فك القفل (IT)
  Active --> Active : تغيير الدور (Mover)<br/>يسري فوراً
  Active --> Suspended : تعليق مؤقت<br/>+ إنهاء الجلسات
  Suspended --> Active : إعادة التفعيل
  Active --> Disabled : إيقاف نهائي (Leaver)<br/>+ إنهاء الجلسات
  Suspended --> Disabled : إيقاف نهائي
  Disabled --> [*]

  state "بانتظار الموافقة<br/>pending" as Pending
  state "نشط + كلمة مرور مؤقتة<br/>must_change_password" as Active_TempPwd
  state "نشط<br/>active" as Active
  state "مقفل مؤقتاً<br/>locked_until" as Locked
  state "معلّق<br/>suspended" as Suspended
  state "معطّل<br/>disabled" as Disabled
```

<div dir="rtl">

</details>

---

<a id="07-token-lifecycle"></a>

## 4. دورة حياة رمز التحديث والجلسة (Token / Session Lifecycle)

رمز التحديث يُصدر عند الدخول، وكل استخدام له يُصدر رمزاً جديداً ويُبطل القديم (**Rotation**). إذا قُدّم رمز قديم مرة أخرى فهذا دليل على أن نسخة منه سُرقت، فتُلغى **الجلسة كاملة** (يخسرها المهاجم والمستخدم معاً، ويضطر المستخدم للدخول من جديد بكلمة المرور وMFA). تنتهي الجلسة أيضاً بتسجيل الخروج، أو إنهائها من المسؤول، أو تغيير كلمة المرور، أو تعطيل الحساب، أو بعد 7 أيام.

![دورة حياة رمز التحديث والجلسة (Token / Session Lifecycle)](diagrams/07-token-lifecycle.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Issued : تسجيل دخول ناجح
  state "Refresh Token صالح<br/>(hash مخزّن)" as Issued
  state "مستبدَل (قديم)<br/>Rotated" as Rotated
  state "الجلسة ملغاة<br/>revoked_at" as Revoked
  state "منتهي<br/>expires_at" as Expired

  Issued --> Issued : POST /refresh<br/>إصدار رمز جديد
  Issued --> Rotated : الرمز القديم بعد التدوير
  Rotated --> Revoked : إعادة استخدامه = سرقة<br/>auth.refresh_token_reuse
  Issued --> Revoked : تسجيل خروج · إنهاء من المسؤول<br/>تغيير كلمة المرور · تعطيل الحساب
  Issued --> Expired : مرور 7 أيام
  Revoked --> [*]
  Expired --> [*]
```

<div dir="rtl">

</details>

---

<a id="04-login-flowchart"></a>

## 5. مخطط تدفق تسجيل الدخول (Login Flowchart)

يوضح ترتيب الفحوصات عند الدخول، والترتيب نفسه قرار أمني: (1) **تحديد المعدل** قبل أي عمل مكلف، (2) المستخدم غير الموجود يمر بمقارنة bcrypt وهمية ليتساوى زمن الاستجابة، (3) **فحص القفل قبل فحص كلمة المرور** حتى لا يستمر التخمين على حساب مقفل، (4) فحص الحالة بعد كلمة المرور الصحيحة فقط (كي لا نكشف حالة الحساب لمن لا يعرف كلمة مروره)، (5) لا تُنشأ جلسة قبل اجتياز MFA.

![مخطط تدفق تسجيل الدخول (Login Flowchart)](diagrams/04-login-flowchart.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart TD
  A([بداية: المستخدم يفتح /login]) --> B[/إدخال اسم المستخدم وكلمة المرور/]
  B --> RL{تجاوز حد الطلبات<br/>30 طلب / 15 دقيقة لكل IP؟}
  RL -- نعم --> RLX[429 Too Many Requests]
  RL -- لا --> C{هل المستخدم موجود؟}
  C -- لا --> C1[مقارنة bcrypt وهمية<br/>لتوحيد زمن الاستجابة] --> F1
  C -- نعم --> D{هل الحساب مقفل؟<br/>locked_until > الآن}
  D -- نعم --> D1[423 Locked<br/>+ تسجيل auth.login denied]
  D -- لا --> E{bcrypt.compare<br/>كلمة المرور صحيحة؟}
  E -- لا --> E1[زيادة failed_attempts]
  E1 --> E2{المحاولات = 5 ؟}
  E2 -- نعم --> E3[قفل الحساب 15 دقيقة<br/>auth.account_locked] --> F1
  E2 -- لا --> F1[401 رسالة عامة موحدة<br/>+ تسجيل auth.login failure]
  E -- نعم --> G{حالة الحساب active؟}
  G -- "pending / suspended / disabled" --> G1[403 مع سبب الحالة<br/>+ تسجيل denied]
  G -- نعم --> H{MFA مفعّلة؟}
  H -- نعم --> I[إصدار challengeToken<br/>صالح 5 دقائق فقط]
  I --> J[/إدخال رمز TOTP أو رمز استرداد/]
  J --> K{الرمز صحيح؟<br/>نافذة ±30 ثانية}
  K -- لا --> K1[401 + احتساب محاولة فاشلة] --> J
  K -- نعم --> L
  H -- لا --> L[تصفير العداد · إنشاء جلسة في sessions<br/>Access JWT 15 دقيقة + Refresh Cookie 7 أيام]
  L --> M[تسجيل auth.login success]
  M --> N{must_change_password؟}
  N -- نعم --> N1[تحويل إلى /change-password]
  N -- لا --> O([الدخول إلى النظام])
```

<div dir="rtl">

</details>

---

<a id="05-authorization-flowchart"></a>

## 6. مخطط تدفق التفويض لكل طلب (Authorization Flowchart)

ما يحدث في **كل** طلب API محمي. سبع نقاط رفض محتملة قبل الوصول إلى البيانات. لاحظ أن الصلاحيات تُحمّل من قاعدة البيانات **في كل طلب** ولا تُقرأ من الرمز، فسحب الصلاحية أو تعطيل الحساب أو إنهاء الجلسة يسري فوراً. كل رفض تفويض (403) يُسجّل في سجل التدقيق مع الصلاحية الناقصة.

![مخطط تدفق التفويض لكل طلب (Authorization Flowchart)](diagrams/05-authorization-flowchart.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart TD
  A([طلب API محمي<br/>مثال: GET /api/audit]) --> B{يوجد Bearer Token؟}
  B -- لا --> X1[401 NO_TOKEN]
  B -- نعم --> C{توقيع JWT صحيح<br/>HS256 + issuer؟}
  C -- لا --> X2[401 INVALID_TOKEN]
  C -- نعم --> D{انتهت صلاحيته؟<br/>exp}
  D -- نعم --> X3[401 TOKEN_EXPIRED<br/>الواجهة تطلب /refresh تلقائياً]
  D -- لا --> E{الجلسة sid موجودة<br/>وغير ملغاة؟}
  E -- لا --> X4[401 SESSION_REVOKED]
  E -- نعم --> F{الحساب active؟}
  F -- لا --> X5[401 ACCOUNT_INACTIVE]
  F -- نعم --> G[تحميل الأدوار والصلاحيات<br/>من قاعدة البيانات الآن]
  G --> H{كلمة مرور مؤقتة؟}
  H -- نعم --> X6[403 PASSWORD_CHANGE_REQUIRED]
  H -- لا --> I{"الصلاحية المطلوبة<br/>audit:read ∈ صلاحيات المستخدم؟"}
  I -- لا --> X7[403 FORBIDDEN<br/>+ تسجيل access.denied]
  I -- نعم --> J{قواعد إضافية؟<br/>تعديل الذات / المدير العام}
  J -- مخالفة --> X8[403 منع تصعيد الصلاحيات]
  J -- سليم --> K[تنفيذ العملية<br/>+ تسجيل الحدث في audit_logs]
  K --> L([200 OK])

  classDef deny fill:#fbe7e5,stroke:#b4281f,color:#7c1a14
  classDef ok fill:#e2f3ef,stroke:#0e7a6d,color:#0a5c52
  class X1,X2,X3,X4,X5,X6,X7,X8 deny
  class L,K ok
```

<div dir="rtl">

</details>

---

<a id="06-auth-sequence"></a>

## 7. مخطط التتابع: الدخول بخطوتين ثم التجديد ثم الخروج (Sequence Diagram)

التسلسل الزمني للرسائل بين المستخدم والمتصفح والخادم وقاعدة البيانات: الخطوة الأولى (كلمة المرور) تعيد `challengeToken` فقط، والخطوة الثانية (TOTP) تنشئ الجلسة. عند انتهاء رمز الوصول بعد 15 دقيقة يحصل `api.js` تلقائياً على رمز جديد عبر الـ Cookie ويعيد الطلب دون أن يشعر المستخدم (**Silent Refresh**).

![مخطط التتابع: الدخول بخطوتين ثم التجديد ثم الخروج (Sequence Diagram)](diagrams/06-auth-sequence.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
sequenceDiagram
  autonumber
  actor U as المستخدم
  participant B as المتصفح (api.js)
  participant S as خادم Express
  participant DB as SQLite

  U->>B: اسم المستخدم + كلمة المرور
  B->>S: POST /api/auth/login
  S->>DB: SELECT user (Prepared Statement)
  S->>S: bcrypt.compare(password, hash)
  S-->>B: { mfaRequired: true, challengeToken }
  U->>B: رمز TOTP من الهاتف
  B->>S: POST /api/auth/mfa/verify
  S->>DB: قراءة mfa_secret_enc
  S->>S: فك تشفير AES-256-GCM ثم HMAC-SHA1 (RFC 6238)
  S->>DB: INSERT sessions (refresh_token_hash = SHA-256)
  S->>DB: INSERT audit_logs (auth.login)
  S-->>B: accessToken (JWT 15m) + Set-Cookie iam_refresh (HttpOnly, SameSite=Strict)

  Note over B: الـ Access Token يُحفظ في متغير بالذاكرة فقط

  B->>S: GET /api/users  [Authorization: Bearer JWT]
  S->>S: التحقق من التوقيع والصلاحية الزمنية
  S->>DB: الجلسة فعّالة؟ + الأدوار والصلاحيات
  S-->>B: 200 بيانات المستخدمين

  Note over B,S: بعد 15 دقيقة ينتهي الـ JWT
  B->>S: GET /api/users
  S-->>B: 401 TOKEN_EXPIRED
  B->>S: POST /api/auth/refresh (Cookie تلقائياً)
  S->>DB: مقارنة SHA-256 للرمز ثم استبداله برمز جديد (Rotation)
  S-->>B: accessToken جديد + Cookie جديد
  B->>S: إعادة الطلب الأصلي
  S-->>B: 200

  U->>B: تسجيل الخروج
  B->>S: POST /api/auth/logout
  S->>DB: UPDATE sessions SET revoked_at
  S-->>B: حذف الـ Cookie
```

<div dir="rtl">

</details>

---

<a id="08-rbac-model"></a>

## 8. نموذج التحكم بالوصول المبني على الأدوار (RBAC Model)

مثال من البيانات الحقيقية: كل موظف يملك دور `employee` إضافة إلى دوره الوظيفي. الصلاحيات تُمنح للأدوار لا للأشخاص؛ فعند انضمام محاسب جديد يكفي إسناد دور `finance_officer` له. لاحظ **فصل المهام**: `iam_admin` يُسند الأدوار لكنه لا يملك `roles:manage` لتعديل ما تحتويه الأدوار.

![نموذج التحكم بالوصول المبني على الأدوار (RBAC Model)](diagrams/08-rbac-model.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart LR
  subgraph U["المستخدمون (Identities)"]
    u1["علي الساعدي<br/>CISO"]
    u2["زينب العبيدي<br/>مسؤولة هويات"]
    u3["مصطفى الجبوري<br/>مدقق"]
    u4["سارة الموسوي<br/>دعم فني"]
    u5["حسين الخفاجي<br/>مالية"]
    u6["عمر العاني<br/>مبيعات"]
  end
  subgraph R["الأدوار (Roles)"]
    r1[super_admin]
    r2[iam_admin]
    r3[security_auditor]
    r4[it_support]
    r5[finance_officer]
    r6[employee]
  end
  subgraph P["الصلاحيات (resource:action)"]
    p1["roles:manage"]
    p2["users:create / update / disable"]
    p3["roles:assign"]
    p4["audit:read · audit:export"]
    p5["users:unlock · users:reset_password"]
    p6["resources:it:read"]
    p7["resources:finance:read"]
    p8["resources:public:read"]
  end
  u1 --> r1
  u2 --> r2
  u3 --> r3
  u4 --> r4
  u5 --> r5
  u6 --> r6
  u1 & u2 & u3 & u4 & u5 --> r6
  r1 -. كل الصلاحيات .-> p1
  r2 --> p2 & p3 & p5
  r2 --> p4
  r3 --> p4
  r4 --> p5 & p6
  r5 --> p7
  r6 --> p8
```

<div dir="rtl">

</details>

---

<a id="09-sdlc"></a>

## 9. دورة حياة تطوير النظام (SDLC — النموذج التكراري التزايدي)

المراحل السبع التي مرّ بها المشروع، مع تغذية راجعة من مرحلة الصيانة والمراقبة إلى مرحلة التحليل؛ فما يكشفه سجل التدقيق من هجمات يتحول إلى متطلبات أمنية جديدة في التكرار التالي.

![دورة حياة تطوير النظام (SDLC — النموذج التكراري التزايدي)](diagrams/09-sdlc.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart LR
  A["1. التخطيط وجمع المتطلبات<br/>تحديد مشاكل إدارة الوصول<br/>والمتطلبات الوظيفية والأمنية"] --> B["2. التحليل<br/>تحليل التهديدات (STRIDE)<br/>حالات الاستخدام · الأدوار"]
  B --> C["3. التصميم<br/>المعمارية الطبقية · ERD<br/>مخططات التدفق · واجهات"]
  C --> D["4. التنفيذ<br/>Node.js + Express<br/>SQLite + JavaScript"]
  D --> E["5. الاختبار<br/>23 اختباراً آلياً<br/>+ اختبار يدوي للواجهات"]
  E --> F["6. النشر والتشغيل<br/>npm start · متغيرات البيئة<br/>HTTPS خلف Reverse Proxy"]
  F --> G["7. الصيانة والمراقبة<br/>سجل التدقيق · لوحة المراقبة<br/>مراجعة الوصول الدورية"]
  G -. تغذية راجعة / تكرار .-> B
```

<div dir="rtl">

</details>

</div>
