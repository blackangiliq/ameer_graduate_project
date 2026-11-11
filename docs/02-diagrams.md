<div dir="rtl">

# مخططات المشروع

كل مخطط بصيغتين: **صورة PNG** للطباعة، و**مصدر Mermaid** (ملفات `.mmd` في `diagrams/`) يعرضه GitHub ويمكن تعديله من [mermaid.live](https://mermaid.live).

| # | المخطط | النوع |
|---|---|---|
| 1 | [المخطط المعماري (Architecture)](#01-architecture) | معماري |
| 2 | [طبقة IAM فوق وحدات الأعمال](#10-business-modules) | معماري |
| 3 | [مخطط الكيانات والعلاقات (ERD)](#02-erd) | قاعدة بيانات |
| 4 | [نموذج RBAC مع النطاقات](#08-rbac-model) | نموذج مفاهيمي |
| 5 | [مخطط تدفق التفويض لكل طلب](#05-authorization-flowchart) | مخطط تدفق (Flowchart) |
| 6 | [مخطط تدفق اعتماد الإجازة (مثال عملي)](#11-leave-approval-flow) | مخطط تدفق (Flowchart) |
| 7 | [دورة حياة الهوية (Joiner / Mover / Leaver)](#03-identity-lifecycle) | مخطط حالات (State) |
| 8 | [دورة حياة رمز التحديث والجلسة](#07-token-lifecycle) | مخطط حالات (State) |
| 9 | [مخطط تدفق تسجيل الدخول](#04-login-flowchart) | مخطط تدفق (Flowchart) |
| 10 | [مخطط التتابع: الدخول بخطوتين ثم التجديد ثم الخروج](#06-auth-sequence) | مخطط تتابع (Sequence) |
| 11 | [دورة حياة تطوير النظام (SDLC)](#09-sdlc) | دورة حياة التطوير |
| 12 | [مسار الطلب عبر الـ Middleware](#12-middleware-pipeline) | مخطط تدفق (Flowchart) |

---

<a id="01-architecture"></a>

## 1. المخطط المعماري (Architecture)

معمارية ثلاثية الطبقات. **طبقة العرض** صفحات HTML/JS في المتصفح تتواصل فقط عبر `api.js` الذي يحفظ رمز الوصول في الذاكرة ويجدده تلقائياً. **طبقة التطبيق** تبدأ بطبقة حماية عامة (Helmet، تحديد المعدل)، ثم مسارات المصادقة العامة `/api/auth`، وكل المسارات الأخرى (الإدارة ووحدات الأعمال `/api/hr`, `/api/finance`, `/api/ops`, `/api/portal`) تمر أولاً بـ **نقطة فرض السياسة (PEP)**: `authenticate` ← `requirePasswordChanged` ← `requirePermission / requireAny`. المسارات تستدعي **طبقة الخدمات**، والخدمات وحدها تتعامل مع **طبقة البيانات** باستعلامات مُعدّة مسبقاً (Prepared Statements).

![المخطط المعماري (Architecture)](diagrams/01-architecture.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart TB
  subgraph CLIENT["طبقة العرض — المتصفح (HTML + CSS + JavaScript)"]
    direction LR
    P1["صفحات الدخول والتسجيل<br/>login · register · change-password"]
    P2["صفحات الإدارة<br/>dashboard · users · roles · audit · sessions"]
    P3["وحدات الأعمال (12)<br/>home · leave · payroll · invoices<br/>deals · tickets · assets · profile …"]
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
    subgraph APPS["وحدات الأعمال routes/apps"]
      direction LR
      B1["/api/hr<br/>إعلانات · دليل · إجازات<br/>ملفات · رواتب"]
      B2["/api/finance<br/>فواتير · مصروفات"]
      B3["/api/ops<br/>عملاء · صفقات · تذاكر · أجهزة"]
      B4["/api/portal<br/>الرئيسية"]
      B5["_helpers.js<br/>النطاق · قواعد العمل · deny"]
    end
    PEP["نقطة فرض السياسة (PEP)<br/>authenticate ← requirePasswordChanged ← requirePermission / requireAny"]
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
    PEP --> APPS
    R1 --> SVC
    ROUTES --> SVC
    APPS --> SVC
  end

  SVC -- "Prepared Statements" --> DB

  subgraph DATA["طبقة البيانات — SQLite (node:sqlite)"]
    DB[("iam.db — 21 جدولاً<br/>الهوية · المصادقة · التفويض · التدقيق<br/>+ محتوى الأعمال: إجازات · رواتب · فواتير<br/>صفقات · تذاكر · أجهزة …")]
  end
```

<div dir="rtl">

</details>

---

<a id="10-business-modules"></a>

## 2. طبقة IAM فوق وحدات الأعمال

الفكرة الأساسية للمشروع: IAM ليس غاية بذاته، بل طبقة تحمي **محتوى حقيقياً**. 12 وحدة أعمال في أربعة مجالات، وكل طلب إلى أي منها يمر بالمصادقة والجلسة ثم التفويض بطبقاته الأربع (صلاحية ← نطاق ← قاعدة عمل ← حقل) ثم يُسجَّل في التدقيق.

![طبقة IAM فوق وحدات الأعمال](diagrams/10-business-modules.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart TB
  subgraph IAM["طبقة IAM — من أنت وماذا يحق لك"]
    direction LR
    A1["المصادقة<br/>كلمة مرور + TOTP"] --> A2["الجلسة<br/>JWT + Refresh"] --> A3["التفويض<br/>صلاحية ← نطاق ← قاعدة ← حقل"] --> A4["التدقيق<br/>audit_logs"]
  end
  IAM --> M
  subgraph M["وحدات الأعمال المحمية (المحتوى)"]
    direction LR
    subgraph HR["الموارد البشرية"]
      h1[الإعلانات] 
      h2[دليل الموظفين]
      h3[الإجازات]
      h4[ملفات الموظفين]
      h5[الرواتب]
    end
    subgraph FIN["المالية"]
      f1[فواتير الموردين]
      f2[المصروفات]
    end
    subgraph SAL["المبيعات وخدمة العملاء"]
      s1[العملاء]
      s2[الصفقات]
      s3[تذاكر الدعم]
    end
    subgraph IT["تقنية المعلومات"]
      i1[الأجهزة والأصول]
      i2[مكتبة المستندات]
    end
  end
```

<div dir="rtl">

</details>

---

<a id="02-erd"></a>

## 3. مخطط الكيانات والعلاقات (ERD)

21 جدولاً. في الأعلى جداول الهوية والتفويض (users, roles, permissions والجداول الوسيطة)، وفي الأسفل جداول المحتوى المحمي. لاحظ أن كل جدول أعمال يرتبط بالمستخدم بعمود **ملكية** (`user_id`, `owner_id`, `assigned_to`, `created_by`) — هذا العمود هو ما تعتمد عليه قواعد النطاق «بياناتي/قسمي» وقواعد فصل المهام «لا تعتمد ما أنشأته». الحقول الحساسة لا تُخزّن صريحة (bcrypt، AES-256-GCM، SHA-256)، والراتب و IBAN محجوبان على مستوى الحقل.

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
  USERS ||--|| EMPLOYEE_PROFILES : "ملف وظيفي"
  USERS ||--o{ LEAVE_REQUESTS : "يطلب / يعتمد"
  USERS ||--o{ EXPENSE_CLAIMS : "يقدّم"
  PAYROLL_RUNS ||--o{ PAYSLIPS : "يحتوي"
  USERS ||--o{ PAYSLIPS : "يستلم"
  USERS ||--o{ INVOICES : "يسجّل / يعتمد"
  CUSTOMERS ||--o{ DEALS : "له"
  USERS ||--o{ DEALS : "يملك"
  CUSTOMERS ||--o{ TICKETS : "يفتح"
  USERS ||--o{ TICKETS : "مسندة إلى"
  USERS ||--o{ ASSETS : "يستلم"
  DEPARTMENTS ||--o{ ANNOUNCEMENTS : "موجّه إلى"

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
  EMPLOYEE_PROFILES { int user_id PK,FK
    text employee_no
    text national_id
    int base_salary "حقل حساس"
    text bank_iban "حقل حساس" }
  LEAVE_REQUESTS { int id PK
    int user_id FK
    text type
    int days
    text status
    int reviewed_by FK }
  PAYROLL_RUNS { int id PK
    text period
    text status
    int prepared_by FK
    int approved_by FK }
  PAYSLIPS { int id PK
    int run_id FK
    int user_id FK
    int net }
  INVOICES { int id PK
    text number
    int amount
    int created_by FK
    int approved_by FK }
  EXPENSE_CLAIMS { int id PK
    int user_id FK
    int amount
    text status }
  CUSTOMERS { int id PK
    text name
    int account_manager_id FK }
  DEALS { int id PK
    int customer_id FK
    int owner_id FK
    int value
    text stage }
  TICKETS { int id PK
    int customer_id FK
    int assigned_to FK
    text status }
  ASSETS { int id PK
    text tag
    int assigned_to FK
    text status }
  ANNOUNCEMENTS { int id PK
    int department_id FK "NULL = الجميع" }
```

<div dir="rtl">

</details>

---

<a id="08-rbac-model"></a>

## 4. نموذج RBAC مع النطاقات

أمثلة حقيقية من البيانات: كل موظف يملك دور `employee` (خدمة ذاتية: إجازاتي، قسائمي، مصروفاتي) إضافة إلى دوره الوظيفي. الصلاحيات بصيغة `مورد:إجراء:نطاق`. لاحظ **التدرّج**: `deals:read:own` للمندوب و`deals:read:all` للمدير، و`invoices:approve` (حتى 10 ملايين) للمحاسب و`invoices:approve_unlimited` للمدير المالي، و`hr_records:read` لأخصائية الموارد البشرية بدون `salary:read`.

![نموذج RBAC مع النطاقات](diagrams/08-rbac-model.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart LR
  subgraph U["المستخدمون"]
    u1["عمر العاني<br/>مندوب مبيعات"]
    u2["أحمد البياتي<br/>مدير المبيعات"]
    u3["حيدر التميمي<br/>محاسب"]
    u4["حسين الخفاجي<br/>المدير المالي"]
    u5["مريم الدليمي<br/>أخصائية موارد بشرية"]
    u6["نور الهاشمي<br/>مديرة الموارد البشرية"]
  end
  subgraph R["الأدوار"]
    r0[employee]
    r1[sales_rep]
    r2[sales_manager]
    r3[department_manager]
    r4[finance_officer]
    r5[finance_manager]
    r6[hr_officer]
    r7[hr_manager]
  end
  subgraph P["الصلاحيات resource:action:scope"]
    p0["leave:create · leave:read:own<br/>expenses:create · payroll:read:own"]
    p1["deals:read:own · deals:manage:own"]
    p2["deals:read:all · deals:manage:all"]
    p3["leave:read:department<br/>leave:approve:department"]
    p4["invoices:approve ≤ 10M<br/>payroll:prepare"]
    p5["invoices:approve_unlimited<br/>payroll:approve · salary:read"]
    p6["hr_records:read"]
    p7["hr_records:read · salary:read<br/>leave:approve:all"]
  end
  u1 & u2 & u3 & u4 & u5 & u6 --> r0
  u1 --> r1
  u2 --> r2
  u2 --> r3
  u4 --> r3
  u6 --> r3
  u3 --> r4
  u4 --> r5
  u5 --> r6
  u6 --> r7
  r0 --> p0
  r1 --> p1
  r2 --> p2
  r3 --> p3
  r4 --> p4
  r5 --> p5
  r6 --> p6
  r7 --> p7
```

<div dir="rtl">

</details>

---

<a id="05-authorization-flowchart"></a>

## 5. مخطط تدفق التفويض لكل طلب

ما يحدث في **كل** طلب API محمي. بعد المصادقة يمر الطلب بأربع طبقات تفويض (باللون الذهبي): ① **الصلاحية** هل يملك `invoices:approve`؟ ② **النطاق** أي صفوف يراها؟ ③ **قاعدة العمل** على هذا السجل بعينه: ليس طلبه، ضمن حده المالي، من قسمه، مسند إليه. ④ **تصفية الحقول** الحساسة. كل رفض يُسجّل مع سببه.

![مخطط تدفق التفويض لكل طلب](diagrams/05-authorization-flowchart.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart TD
  A([طلب API محمي<br/>مثال: POST /api/finance/invoices/42/decision]) --> B{يوجد Bearer Token؟}
  B -- لا --> X1[401 NO_TOKEN]
  B -- نعم --> C{توقيع JWT صحيح<br/>ولم تنتهِ صلاحيته؟}
  C -- لا --> X2[401 INVALID / EXPIRED<br/>الواجهة تطلب /refresh تلقائياً]
  C -- نعم --> E{الجلسة sid فعّالة<br/>والحساب active؟}
  E -- لا --> X4[401 SESSION_REVOKED / ACCOUNT_INACTIVE]
  E -- نعم --> G[تحميل الأدوار والصلاحيات<br/>من قاعدة البيانات الآن]
  G --> H{كلمة مرور مؤقتة؟}
  H -- نعم --> X6[403 PASSWORD_CHANGE_REQUIRED]
  H -- لا --> I{"① الصلاحية RBAC<br/>invoices:approve ∈ صلاحياته؟"}
  I -- لا --> X7[403 FORBIDDEN<br/>+ access.denied]
  I -- نعم --> S["② النطاق Scope<br/>own / department / all<br/>يقيّد الصفوف المسموح بها"]
  S --> J{"③ قاعدة العمل على هذا السجل<br/>ليس طلبه هو؟ ضمن حده المالي؟<br/>من قسمه؟ مسند إليه؟"}
  J -- مخالفة --> X8[403 مع السبب<br/>+ access.denied]
  J -- سليم --> F["④ تصفية الحقول<br/>إخفاء الراتب و IBAN بدون salary:read"]
  F --> K[تنفيذ العملية<br/>+ تسجيل الحدث في audit_logs]
  K --> L([200 OK])

  classDef deny fill:#fbe7e5,stroke:#b4281f,color:#7c1a14
  classDef ok fill:#e2f3ef,stroke:#0e7a6d,color:#0a5c52
  classDef layer fill:#fbf0dc,stroke:#b7791f,color:#5c3d08
  class X1,X2,X4,X6,X7,X8 deny
  class L,K ok
  class I,S,J,F layer
```

<div dir="rtl">

</details>

---

<a id="11-leave-approval-flow"></a>

## 6. مخطط تدفق اعتماد الإجازة (مثال عملي)

مثال كامل لعملية أعمال محمية: من تقديم الطلب حتى ظهور النتيجة. يوضح كيف تمنع القواعد الاعتماد الذاتي والاعتماد من خارج القسم، وكيف يظهر الطلب في «بانتظارك» فقط لمن يملك صلاحية التصرف فيه.

![مخطط تدفق اعتماد الإجازة (مثال عملي)](diagrams/11-leave-approval-flow.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart TD
  A([الموظف يقدّم طلب إجازة<br/>leave:create]) --> B{الرصيد السنوي كافٍ؟}
  B -- لا --> B1[400 الرصيد غير كافٍ]
  B -- نعم --> C[حالة الطلب: pending<br/>+ leave.request في السجل]
  C --> D[يظهر في «بانتظارك» لمن يملك صلاحية الاعتماد فقط]
  D --> E{من يحاول الاعتماد؟}
  E -- "صاحب الطلب نفسه" --> X1[403 لا تعتمد طلبك بنفسك]
  E -- "مدير قسم آخر" --> X2[403 قسمك فقط]
  E -- "موظف بلا صلاحية" --> X3[403 FORBIDDEN]
  E -- "مدير قسمه<br/>leave:approve:department" --> F[اعتماد / رفض]
  E -- "الموارد البشرية<br/>leave:approve:all" --> F
  F --> G[تحديث الحالة + المراجِع + التاريخ<br/>leave.approve / leave.reject في السجل]
  G --> H([يرى الموظف النتيجة في «إجازاتي»])
  classDef deny fill:#fbe7e5,stroke:#b4281f,color:#7c1a14
  class X1,X2,X3,B1 deny
```

<div dir="rtl">

</details>

---

<a id="03-identity-lifecycle"></a>

## 7. دورة حياة الهوية (Joiner / Mover / Leaver)

يدخل الحساب النظام بطريقتين: **تسجيل ذاتي** (يبقى `pending` حتى موافقة مسؤول الهويات) أو **إنشاء من المسؤول** (نشط بكلمة مرور مؤقتة يجب تغييرها). الحساب النشط قد يُ**قفل مؤقتاً** بعد 5 محاولات فاشلة، وقد يتغير دوره (**Mover**) فيسري فوراً، وقد **يُعلّق**، وعند المغادرة يُ**عطّل** (**Leaver**) وتُنهى كل جلساته فوراً. صفحة الأصول تكشف بعدها الأجهزة التي ما زالت لدى الموظف المغادر.

![دورة حياة الهوية (Joiner / Mover / Leaver)](diagrams/03-identity-lifecycle.png)

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

## 8. دورة حياة رمز التحديث والجلسة

رمز التحديث يُصدر عند الدخول، وكل استخدام له يُصدر رمزاً جديداً ويُبطل القديم (**Rotation**). إذا قُدّم رمز قديم مرة أخرى فهذا دليل سرقة فتُلغى **الجلسة كاملة**. تنتهي الجلسة أيضاً بتسجيل الخروج، أو إنهائها من المسؤول، أو تغيير كلمة المرور، أو تعطيل الحساب، أو بعد 7 أيام.

![دورة حياة رمز التحديث والجلسة](diagrams/07-token-lifecycle.png)

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

## 9. مخطط تدفق تسجيل الدخول

ترتيب الفحوصات قرار أمني: (1) **تحديد المعدل** أولاً، (2) المستخدم غير الموجود يمر بمقارنة bcrypt وهمية ليتساوى الزمن، (3) **فحص القفل قبل كلمة المرور**، (4) فحص الحالة بعد كلمة المرور الصحيحة فقط، (5) لا جلسة قبل اجتياز MFA.

![مخطط تدفق تسجيل الدخول](diagrams/04-login-flowchart.png)

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

<a id="06-auth-sequence"></a>

## 10. مخطط التتابع: الدخول بخطوتين ثم التجديد ثم الخروج

التسلسل الزمني للرسائل بين المستخدم والمتصفح والخادم وقاعدة البيانات، بما فيه التجديد الصامت (Silent Refresh) عند انتهاء رمز الوصول.

![مخطط التتابع: الدخول بخطوتين ثم التجديد ثم الخروج](diagrams/06-auth-sequence.png)

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

<a id="09-sdlc"></a>

## 11. دورة حياة تطوير النظام (SDLC)

المراحل السبع بالنموذج التكراري التزايدي، مع تغذية راجعة من المراقبة إلى التحليل. التكرار الخامس أضاف وحدات الأعمال فوق طبقة IAM.

![دورة حياة تطوير النظام (SDLC)](diagrams/09-sdlc.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart LR
  A["1. التخطيط وجمع المتطلبات<br/>تحديد مشاكل إدارة الوصول<br/>والمتطلبات الوظيفية والأمنية"] --> B["2. التحليل<br/>تحليل التهديدات (STRIDE)<br/>حالات الاستخدام · الأدوار"]
  B --> C["3. التصميم<br/>المعمارية الطبقية · ERD<br/>مخططات التدفق · واجهات"]
  C --> D["4. التنفيذ<br/>Node.js + Express<br/>SQLite + JavaScript"]
  D --> E["5. الاختبار<br/>31 اختباراً آلياً<br/>+ اختبار يدوي للواجهات"]
  E --> F["6. النشر والتشغيل<br/>npm start · متغيرات البيئة<br/>HTTPS خلف Reverse Proxy"]
  F --> G["7. الصيانة والمراقبة<br/>سجل التدقيق · لوحة المراقبة<br/>مراجعة الوصول الدورية"]
  G -. تغذية راجعة / تكرار .-> B
```

<div dir="rtl">

</details>

---

<a id="12-middleware-pipeline"></a>

## 12. مسار الطلب عبر الـ Middleware

كيف يمر كل طلب API عبر 13 مرحلة بالترتيب: طبقة الحماية العامة في `app.js` (helmet، حد حجم JSON، Cookie، منع التخزين المؤقت، تحديد المعدل)، ثم نقطة فرض السياسة في `middleware/auth.js` (المصادقة، كلمة المرور المؤقتة، الصلاحية)، ثم معالج المسار (النطاق، قاعدة العمل، تصفية الحقول، التدقيق)، ثم معالج الأخطاء المركزي. كل فشل يتوقف عنده الطلب برمز محدد.

![مسار الطلب عبر الـ Middleware](diagrams/12-middleware-pipeline.png)

<details><summary>مصدر Mermaid</summary>

</div>

```mermaid
flowchart TD
  REQ([طلب HTTP من المتصفح<br/>GET /api/hr/leave?scope=department]) --> M1
  subgraph G["طبقة الحماية العامة — تُطبَّق على كل الطلبات (src/app.js)"]
    M1["1. helmet<br/>ترويسات الأمان: CSP · X-Frame · nosniff · Referrer-Policy"] --> M2["2. express.json({limit:'50kb'})<br/>قراءة الجسم ورفض الكبير"]
    M2 --> M3["3. cookieParser<br/>قراءة iam_refresh"]
    M3 --> M4["4. Cache-Control: no-store<br/>+ apiLimiter 600 طلب / 15 د"]
    M4 --> M5{"5. هل المسار /api/auth/login<br/>أو register أو mfa/verify؟"}
    M5 -- نعم --> M6["authLimiter<br/>30 طلب / 15 د لكل IP"]
  end
  M5 -- لا --> P1
  M6 --> AUTH["موجّه المصادقة العام<br/>routes/auth.js"]
  subgraph PEP["نقطة فرض السياسة — src/middleware/auth.js"]
    P1["6. authenticate<br/>JWT ← الجلسة ← الحساب ← تحميل الأدوار والصلاحيات"] --> P2["7. requirePasswordChanged<br/>رفض إن كانت كلمة المرور مؤقتة"]
    P2 --> P3["8. requirePermission / requireAny<br/>الرفض الافتراضي + تسجيل access.denied"]
  end
  P1 -. فشل .-> E401[401]
  P2 -. فشل .-> E403a[403 PASSWORD_CHANGE_REQUIRED]
  P3 -. فشل .-> E403b[403 FORBIDDEN]
  P3 --> H
  subgraph H["معالج المسار — src/routes/apps/*.js"]
    H1["9. resolveScope + scopeWhere<br/>النطاق داخل SQL"] --> H2["10. قاعدة العمل على السجل<br/>leaveDecisionBlock · invoiceBlock …"]
    H2 --> H3["11. تصفية الحقول + حساب _actions و _note لكل صف"]
    H3 --> H4["12. audit.log<br/>تسجيل الحدث"]
  end
  H2 -. مخالفة .-> E403c["403 + السبب<br/>deny() يسجّل access.denied"]
  H4 --> RES([استجابة JSON 200])
  H -. استثناء غير متوقع .-> ERR["13. معالج الأخطاء المركزي<br/>500 برسالة عامة بلا Stack trace"]
  classDef deny fill:#fbe7e5,stroke:#b4281f,color:#7c1a14
  classDef ok fill:#e2f3ef,stroke:#0e7a6d,color:#0a5c52
  class E401,E403a,E403b,E403c,ERR deny
  class RES ok
```

<div dir="rtl">

</details>

</div>
