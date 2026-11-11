// Demo data: a realistic Iraqi tech company with departments, employees, roles,
// 30 days of security events, active sessions and protected documents.
// Run:  npm run seed      (wipes and recreates the data)
const db = require('./database');
const password = require('../services/password');
const { encrypt, sha256, randomToken } = require('../services/crypto');

const DEMO_PASSWORD = 'Rafidain@2026';
// Shared TOTP secret for the demo MFA accounts so the supervisor can log in
// with `npm run totp` or by adding the secret to an authenticator app.
const DEMO_MFA_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const DEMO_RECOVERY_CODES = ['7KQ2M-X9D4T', 'P3V8N-L6R2W', 'H5C9B-Z4J7Q', 'T2W6Y-M8K3F', 'R9L4D-B7N5X', 'F6H2P-Q3V8C', 'J8X5T-W2M9L', 'N4B7R-K6Y3H'];

const DEPARTMENTS = [
  ['الإدارة العليا', 'EXEC'],
  ['أمن المعلومات', 'SEC'],
  ['تقنية المعلومات', 'IT'],
  ['الموارد البشرية', 'HR'],
  ['المالية والحسابات', 'FIN'],
  ['المبيعات', 'SAL'],
  ['خدمة العملاء', 'CS'],
];

const PERMISSIONS = [
  // ---- IAM administration ----
  ['dashboard:view', 'عرض لوحة المراقبة الأمنية', 'إدارة الهوية: المراقبة'],
  ['users:read', 'عرض المستخدمين', 'إدارة الهوية: الحسابات'],
  ['users:create', 'إنشاء مستخدم', 'إدارة الهوية: الحسابات'],
  ['users:update', 'تعديل بيانات مستخدم', 'إدارة الهوية: الحسابات'],
  ['users:disable', 'تفعيل / تعليق / تعطيل حساب', 'إدارة الهوية: الحسابات'],
  ['users:reset_password', 'إعادة تعيين كلمة المرور والمصادقة الثنائية', 'إدارة الهوية: الحسابات'],
  ['users:unlock', 'فك قفل الحساب', 'إدارة الهوية: الحسابات'],
  ['roles:read', 'عرض الأدوار والصلاحيات', 'إدارة الهوية: الأدوار'],
  ['roles:assign', 'إسناد الأدوار للمستخدمين', 'إدارة الهوية: الأدوار'],
  ['roles:manage', 'إنشاء الأدوار وتعديل صلاحياتها', 'إدارة الهوية: الأدوار'],
  ['audit:read', 'عرض سجل التدقيق', 'إدارة الهوية: التدقيق'],
  ['audit:export', 'تصدير سجل التدقيق', 'إدارة الهوية: التدقيق'],
  ['sessions:read_all', 'عرض جلسات جميع المستخدمين', 'إدارة الهوية: الجلسات'],
  ['sessions:revoke_any', 'إنهاء جلسة أي مستخدم', 'إدارة الهوية: الجلسات'],
  // ---- Company portal ----
  ['announcements:read', 'قراءة الإعلانات', 'البوابة العامة'],
  ['announcements:manage', 'نشر وحذف الإعلانات', 'البوابة العامة'],
  ['directory:read', 'دليل الموظفين (بيانات الاتصال)', 'البوابة العامة'],
  ['resources:public:read', 'مكتبة المستندات: العامة', 'مكتبة المستندات'],
  ['resources:hr:read', 'مكتبة المستندات: الموارد البشرية', 'مكتبة المستندات'],
  ['resources:finance:read', 'مكتبة المستندات: المالية', 'مكتبة المستندات'],
  ['resources:it:read', 'مكتبة المستندات: البنية التحتية', 'مكتبة المستندات'],
  // ---- HR ----
  ['leave:create', 'تقديم طلب إجازة', 'الموارد البشرية: الإجازات'],
  ['leave:read:own', 'عرض إجازاتي', 'الموارد البشرية: الإجازات'],
  ['leave:read:department', 'عرض إجازات موظفي قسمي', 'الموارد البشرية: الإجازات'],
  ['leave:read:all', 'عرض إجازات جميع الموظفين', 'الموارد البشرية: الإجازات'],
  ['leave:approve:department', 'اعتماد إجازات قسمي', 'الموارد البشرية: الإجازات'],
  ['leave:approve:all', 'اعتماد أي إجازة', 'الموارد البشرية: الإجازات'],
  ['hr_records:read', 'عرض ملفات الموظفين الكاملة', 'الموارد البشرية: الملفات'],
  ['hr_records:update', 'تعديل ملفات الموظفين', 'الموارد البشرية: الملفات'],
  ['salary:read', 'رؤية الرواتب والحسابات المصرفية (حقل حساس)', 'الموارد البشرية: الملفات'],
  ['payroll:read:own', 'عرض قسائم راتبي', 'الرواتب'],
  ['payroll:read', 'عرض مسيّرات الرواتب', 'الرواتب'],
  ['payroll:prepare', 'إعداد مسيّر الرواتب', 'الرواتب'],
  ['payroll:approve', 'اعتماد مسيّر الرواتب', 'الرواتب'],
  // ---- Finance ----
  ['invoices:read', 'عرض فواتير الموردين', 'المالية: الفواتير'],
  ['invoices:create', 'تسجيل فاتورة', 'المالية: الفواتير'],
  ['invoices:approve', 'اعتماد فاتورة حتى 10 ملايين د.ع', 'المالية: الفواتير'],
  ['invoices:approve_unlimited', 'اعتماد فاتورة بدون حد أعلى', 'المالية: الفواتير'],
  ['expenses:create', 'تقديم طلب صرف مصروفات', 'المالية: المصروفات'],
  ['expenses:read:own', 'عرض مصروفاتي', 'المالية: المصروفات'],
  ['expenses:read:all', 'عرض مصروفات جميع الموظفين', 'المالية: المصروفات'],
  ['expenses:approve', 'اعتماد طلبات المصروفات', 'المالية: المصروفات'],
  // ---- Sales & customer service ----
  ['customers:read', 'عرض العملاء', 'المبيعات وخدمة العملاء'],
  ['customers:manage', 'إضافة وتعديل العملاء', 'المبيعات وخدمة العملاء'],
  ['deals:read:own', 'عرض صفقاتي', 'المبيعات وخدمة العملاء'],
  ['deals:read:all', 'عرض كل الصفقات', 'المبيعات وخدمة العملاء'],
  ['deals:manage:own', 'إنشاء وتحديث صفقاتي', 'المبيعات وخدمة العملاء'],
  ['deals:manage:all', 'تحديث وإعادة إسناد أي صفقة', 'المبيعات وخدمة العملاء'],
  ['tickets:read', 'عرض تذاكر الدعم', 'المبيعات وخدمة العملاء'],
  ['tickets:create', 'فتح تذكرة دعم', 'المبيعات وخدمة العملاء'],
  ['tickets:work', 'معالجة التذاكر المسندة إليّ', 'المبيعات وخدمة العملاء'],
  ['tickets:assign', 'إسناد التذاكر وإغلاق أي تذكرة', 'المبيعات وخدمة العملاء'],
  // ---- IT ----
  ['assets:read:own', 'عرض الأجهزة المسلّمة لي', 'تقنية المعلومات: الأصول'],
  ['assets:read:all', 'عرض جميع أصول الشركة', 'تقنية المعلومات: الأصول'],
  ['assets:manage', 'تسليم واسترجاع وصيانة الأصول', 'تقنية المعلومات: الأصول'],
];

const BASE_EMPLOYEE = [
  'announcements:read', 'directory:read', 'resources:public:read',
  'leave:create', 'leave:read:own', 'payroll:read:own',
  'expenses:create', 'expenses:read:own', 'assets:read:own',
];

const ROLES = [
  ['super_admin', 'المدير العام للنظام', 'صلاحيات كاملة على النظام وسياسات الوصول', 'ALL'],
  ['iam_admin', 'مسؤول الهويات', 'إدارة دورة حياة الحسابات وإسناد الأدوار (لا يعدّل السياسات)',
    ['dashboard:view', 'users:read', 'users:create', 'users:update', 'users:disable', 'users:reset_password', 'users:unlock', 'roles:read', 'roles:assign', 'sessions:read_all', 'sessions:revoke_any', 'audit:read']],
  ['security_auditor', 'مدقق أمني', 'صلاحيات قراءة فقط لأغراض التدقيق والمراجعة',
    ['dashboard:view', 'users:read', 'roles:read', 'audit:read', 'audit:export', 'sessions:read_all', 'invoices:read', 'expenses:read:all', 'payroll:read']],
  ['executive', 'الإدارة التنفيذية', 'قراءة مؤشرات الأعمال في كل الأقسام دون تعديل',
    ['customers:read', 'deals:read:all', 'tickets:read', 'invoices:read', 'payroll:read', 'leave:read:all', 'resources:finance:read', 'resources:hr:read']],
  ['department_manager', 'مدير قسم', 'اعتماد إجازات موظفي قسمه فقط',
    ['leave:read:department', 'leave:approve:department']],
  ['it_support', 'الدعم الفني', 'فك القفل وإعادة تعيين كلمات المرور وإدارة الأجهزة',
    ['users:read', 'users:unlock', 'users:reset_password', 'resources:it:read', 'assets:read:all', 'assets:manage']],
  ['hr_manager', 'مدير الموارد البشرية', 'الملفات الكاملة والرواتب واعتماد كل الإجازات والإعلانات',
    ['users:read', 'resources:hr:read', 'announcements:manage', 'leave:read:all', 'leave:approve:all', 'hr_records:read', 'hr_records:update', 'salary:read', 'payroll:read']],
  ['hr_officer', 'أخصائي موارد بشرية', 'ملفات الموظفين بدون الرواتب، ومتابعة الإجازات',
    ['resources:hr:read', 'leave:read:all', 'hr_records:read']],
  ['finance_officer', 'محاسب', 'الفواتير حتى 10 ملايين، المصروفات، إعداد الرواتب',
    ['resources:finance:read', 'invoices:read', 'invoices:create', 'invoices:approve', 'expenses:read:all', 'expenses:approve', 'payroll:read', 'payroll:prepare']],
  ['finance_manager', 'المدير المالي', 'اعتماد الفواتير بلا حد واعتماد مسيّر الرواتب',
    ['resources:finance:read', 'invoices:read', 'invoices:create', 'invoices:approve', 'invoices:approve_unlimited', 'expenses:read:all', 'expenses:approve', 'payroll:read', 'payroll:approve', 'salary:read']],
  ['sales_manager', 'مدير المبيعات', 'كل العملاء والصفقات وإعادة إسنادها',
    ['customers:read', 'customers:manage', 'deals:read:all', 'deals:manage:all', 'tickets:read']],
  ['sales_rep', 'مندوب مبيعات', 'صفقاته فقط',
    ['customers:read', 'deals:read:own', 'deals:manage:own']],
  ['cs_supervisor', 'مشرف خدمة العملاء', 'إسناد التذاكر وإغلاقها',
    ['customers:read', 'tickets:read', 'tickets:create', 'tickets:work', 'tickets:assign']],
  ['cs_agent', 'موظف خدمة عملاء', 'فتح ومعالجة التذاكر المسندة إليه',
    ['customers:read', 'tickets:read', 'tickets:create', 'tickets:work']],
  ['employee', 'موظف', 'الدور الأساسي لكل موظف: الخدمة الذاتية والبوابة العامة', BASE_EMPLOYEE],
];

// username, full name, job title, dept code, extra roles, status, mfa, flags
const USERS = [
  ['ali.alsaadi', 'علي كريم الساعدي', 'مدير أمن المعلومات (CISO)', 'SEC', ['super_admin', 'department_manager'], 'active', true],
  ['zainab.alobaidi', 'زينب حسين العبيدي', 'مسؤولة إدارة الهويات والوصول', 'SEC', ['iam_admin'], 'active', true],
  ['mustafa.aljubouri', 'مصطفى عادل الجبوري', 'مدقق أمن معلومات', 'SEC', ['security_auditor'], 'active', false],
  ['mohammed.alqaisi', 'محمد ناظم القيسي', 'مدقق داخلي', 'EXEC', ['security_auditor'], 'active', false],
  ['sara.almusawi', 'سارة فاضل الموسوي', 'مهندسة دعم فني', 'IT', ['it_support'], 'active', false],
  ['laith.alobaidi', 'ليث وسام العبيدي', 'مدير تقنية المعلومات', 'IT', ['it_support', 'department_manager'], 'active', true],
  ['yasir.alshammari', 'ياسر عبد الله الشمري', 'مهندس شبكات', 'IT', ['it_support'], 'active', false],
  ['rusul.alkarkhi', 'رسل ماجد الكرخي', 'مطورة برمجيات', 'IT', [], 'active', false],
  ['noor.alhashimi', 'نور صباح الهاشمي', 'مديرة الموارد البشرية', 'HR', ['hr_manager', 'department_manager'], 'active', false],
  ['maryam.aldulaimi', 'مريم أحمد الدليمي', 'أخصائية توظيف', 'HR', ['hr_officer'], 'active', false],
  ['hussein.alkhafaji', 'حسين محمد الخفاجي', 'المدير المالي', 'FIN', ['finance_manager', 'department_manager'], 'active', false],
  ['haider.altamimi', 'حيدر جاسم التميمي', 'محاسب أول', 'FIN', ['finance_officer'], 'active', false],
  ['dalia.alazzawi', 'داليا كريم العزاوي', 'محاسبة', 'FIN', ['finance_officer'], 'suspended', false],
  ['ahmed.albayati', 'أحمد سلمان البياتي', 'مدير المبيعات', 'SAL', ['sales_manager', 'department_manager'], 'active', false],
  ['omar.alani', 'عمر طارق العاني', 'مندوب مبيعات', 'SAL', ['sales_rep'], 'active', false],
  ['shahad.aljanabi', 'شهد ليث الجنابي', 'مندوبة مبيعات', 'SAL', ['sales_rep'], 'active', false, { mustChange: true }],
  ['fatima.alrubaie', 'فاطمة علي الربيعي', 'موظفة خدمة عملاء', 'CS', ['cs_agent'], 'active', false],
  ['abbas.alsudani', 'عباس جواد السوداني', 'مشرف خدمة العملاء', 'CS', ['cs_supervisor', 'department_manager'], 'active', false, { locked: true }],
  ['zahraa.alhilli', 'زهراء عباس الحلي', 'موظفة خدمة عملاء', 'CS', ['cs_agent'], 'active', false],
  ['karrar.alzubaidi', 'كرار حسن الزبيدي', 'مندوب مبيعات (موظف سابق)', 'SAL', ['sales_rep'], 'disabled', false],
  ['hiba.alnuaimi', 'هبة سعد النعيمي', null, 'HR', [], 'pending', false],
  ['ali.alfatlawi', 'علي رحيم الفتلاوي', null, 'CS', [], 'pending', false],
  ['ammar.alrawi', 'عمار فاروق الراوي', 'المدير التنفيذي', 'EXEC', ['executive', 'department_manager'], 'active', false],
];

const RESOURCES = [
  ['public', 'سياسة الاستخدام المقبول لأنظمة المعلومات', 'تحدد هذه السياسة الاستخدام المسموح لأجهزة الشركة والبريد الإلكتروني والإنترنت. يُمنع مشاركة كلمات المرور أو تثبيت برامج غير مرخّصة، ويجب الإبلاغ عن أي رسالة تصيّد إلى فريق أمن المعلومات خلال 24 ساعة.', 'عام'],
  ['public', 'دليل الموظف الجديد 2026', 'مرحباً بك في شركة الرافدين للحلول التقنية. يشرح الدليل ساعات الدوام (8:00 - 4:00)، وآلية طلب الإجازات عبر بوابة الموارد البشرية، وخطوات تفعيل المصادقة الثنائية لحسابك خلال أول أسبوع.', 'عام'],
  ['public', 'جدول العطل الرسمية لعام 2026', 'يتضمن العطل الرسمية المعتمدة من الأمانة العامة لمجلس الوزراء، ومنها رأس السنة الميلادية، عيد نوروز (21 آذار)، عيد العمال (1 أيار)، ذكرى ثورة 14 تموز، والعيد الوطني (3 تشرين الأول)، إضافة إلى عيدي الفطر والأضحى.', 'عام'],
  ['hr', 'سلّم الرواتب المعتمد لعام 2026', 'الدرجة الخامسة (موظف): 1,100,000 – 1,500,000 د.ع. الدرجة الرابعة (أخصائي): 1,600,000 – 2,200,000 د.ع. الدرجة الثالثة (مهندس أول/محاسب أول): 2,300,000 – 3,000,000 د.ع. الدرجة الثانية (مدير قسم): 3,500,000 – 4,800,000 د.ع. الدرجة الأولى (إدارة عليا): 5,500,000 فأكثر. المخصصات 20% من الراتب الأساسي، واستقطاع الضمان الاجتماعي 5%.', 'سري'],
  ['hr', 'تقييمات الأداء - الربع الثالث 2026', 'نسبة الموظفين بتقدير "ممتاز": 27%، "جيد جداً": 45%، "جيد": 23%، "يحتاج تطوير": 5%. يوصى بترقية موظفَين في قسم تقنية المعلومات وموظف في قسم المبيعات.', 'سري'],
  ['hr', 'ملف التوظيف - دفعة تشرين الثاني', 'مرشحتان قيد المراجعة لقسمي الموارد البشرية وخدمة العملاء. الحسابات أُنشئت بحالة "بانتظار الموافقة" ولا يتم تفعيلها قبل توقيع العقد وتعهد السرية.', 'سري'],
  ['finance', 'الموازنة التشغيلية لعام 2026', 'إجمالي الموازنة المعتمدة: 3.2 مليار دينار عراقي. الرواتب 58%، البنية التحتية والتراخيص 22%، التسويق 9%، التدريب 4%، احتياطي 7%.', 'سري للغاية'],
  ['finance', 'تقرير الإيرادات - الربع الثالث 2026', 'الإيرادات: 1.14 مليار د.ع بنمو 12% عن الربع السابق. أكبر ثلاثة عملاء يمثلون 41% من الإيرادات. المستحقات المتأخرة أكثر من 90 يوماً: 63 مليون د.ع.', 'سري للغاية'],
  ['finance', 'سجل مدفوعات الموردين', 'دفعات تشرين الأول: تراخيص Microsoft 365 (14,800 دولار)، اشتراك مركز البيانات في بغداد (9,200,000 د.ع)، صيانة أجهزة الشبكة (4,750,000 د.ع).', 'سري'],
  ['it', 'مخطط الشبكة الداخلية', 'الشبكة مقسمة إلى VLAN 10 (الإدارة)، VLAN 20 (الموظفون)، VLAN 30 (الخوادم)، VLAN 99 (الضيوف - معزولة). الوصول عن بُعد عبر VPN بنطاق 172.16.0.0/24 مع مصادقة ثنائية إلزامية.', 'سري'],
  ['it', 'إجراءات الاستجابة للحوادث الأمنية', '1) الاحتواء: تعطيل الحساب وإنهاء جلساته من بوابة IAM. 2) جمع الأدلة من سجل التدقيق. 3) الإبلاغ إلى مدير أمن المعلومات خلال ساعة. 4) الاستعادة وإعادة تعيين بيانات الاعتماد. 5) مراجعة ما بعد الحادث.', 'سري'],
  ['it', 'جرد الخوادم والأنظمة', 'خادم البريد (Exchange) - 10.10.30.5، خادم الملفات - 10.10.30.8، خادم قاعدة بيانات ERP - 10.10.30.12، بوابة IAM - 10.10.30.20. آخر تحديث أمني: 2026-11-02.', 'سري'],
];

const INTERNAL_IPS = ['10.10.20.14', '10.10.20.27', '10.10.20.33', '10.10.20.41', '10.10.20.58', '10.10.10.5', '10.10.10.9', '172.16.0.12', '172.16.0.19'];
const AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
];
const ATTACK_IPS = ['185.220.101.47', '45.155.205.233', '91.240.118.172'];
const ATTACK_AGENT = 'python-requests/2.32.3';

// Deterministic pseudo-random generator so every seed produces the same history.
let state = 20261111;
const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
function at(daysAgo, hourUtc, minute = Math.floor(rand() * 60)) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hourUtc, minute, Math.floor(rand() * 60), 0);
  return d;
}

async function seed({ reset = false } = {}) {
  if (reset) {
    db.exec(`DELETE FROM payslips; DELETE FROM payroll_runs; DELETE FROM leave_requests; DELETE FROM expense_claims; DELETE FROM invoices;
             DELETE FROM tickets; DELETE FROM deals; DELETE FROM customers; DELETE FROM assets; DELETE FROM announcements; DELETE FROM employee_profiles;
             DELETE FROM audit_logs; DELETE FROM sessions; DELETE FROM mfa_recovery_codes; DELETE FROM password_history;
             DELETE FROM user_roles; DELETE FROM role_permissions; DELETE FROM users; DELETE FROM roles;
             DELETE FROM permissions; DELETE FROM departments; DELETE FROM resources; DELETE FROM sqlite_sequence;`);
  }

  // Hash passwords first (slow on purpose: bcrypt), then write everything in one transaction.
  const hashes = [];
  for (const u of USERS) {
    const pwd = u[7]?.mustChange ? 'Temp#Sales2026' : DEMO_PASSWORD;
    hashes.push(await password.hash(pwd));
  }

  const now = new Date();
  const events = [];
  const log = (date, actor, action, status = 'success', extra = {}) => events.push({
    created_at: fmt(date), actor_id: actor?.id ?? null, actor_username: actor?.username ?? extra.username ?? null,
    action, status, target_type: extra.targetType ?? null, target_id: extra.targetId ?? null,
    ip: extra.ip ?? pick(INTERNAL_IPS), ua: extra.ua ?? pick(AGENTS), details: extra.details ?? null,
  });

  db.transaction(() => {
    for (const [name, code] of DEPARTMENTS) db.run('INSERT INTO departments (name, code) VALUES (?, ?)', name, code);
    const deptId = Object.fromEntries(db.all('SELECT id, code FROM departments').map((d) => [d.code, d.id]));

    for (const [name, label, category] of PERMISSIONS) db.run('INSERT INTO permissions (name, label, category) VALUES (?, ?, ?)', name, label, category);
    const permId = Object.fromEntries(db.all('SELECT id, name FROM permissions').map((p) => [p.name, p.id]));

    for (const [name, label, description, perms] of ROLES) {
      const { lastInsertRowid } = db.run('INSERT INTO roles (name, label, description, is_system) VALUES (?, ?, ?, 1)', name, label, description);
      const list = perms === 'ALL' ? Object.keys(permId) : perms;
      for (const p of list) db.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', lastInsertRowid, permId[p]);
    }
    const roleId = Object.fromEntries(db.all('SELECT id, name FROM roles').map((r) => [r.name, r.id]));

    const users = [];
    USERS.forEach(([username, fullName, title, dept, roles, status, mfa, flags = {}], i) => {
      const createdDaysAgo = status === 'pending' ? 1 + (i % 2) : 120 + i * 7;
      const created = at(createdDaysAgo, 6);
      const lockedUntil = flags.locked ? fmt(new Date(now.getTime() + 15 * 60 * 1000)) : null;
      const { lastInsertRowid: id } = db.run(
        `INSERT INTO users (username, email, full_name, job_title, department_id, password_hash, status, must_change_password,
                            password_changed_at, mfa_enabled, mfa_secret_enc, locked_until, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        username, `${username}@alrafidain-tech.iq`, fullName, title, deptId[dept], hashes[i], status,
        flags.mustChange ? 1 : 0, fmt(at(Math.min(createdDaysAgo, 20 + (i * 3) % 60), 7)),
        mfa ? 1 : 0, mfa ? encrypt(DEMO_MFA_SECRET) : null, lockedUntil, i === 0 ? null : 1, fmt(created), fmt(created),
      );
      db.run('INSERT INTO password_history (user_id, password_hash, created_at) VALUES (?, ?, ?)', id, hashes[i], fmt(created));
      for (const r of ['employee', ...roles]) {
        db.run('INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)', id, roleId[r], i === 0 ? null : 1, fmt(created));
      }
      if (mfa && i === 0) for (const c of DEMO_RECOVERY_CODES) db.run('INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)', id, sha256(c));
      users.push({ id: Number(id), username, status, mfa, flags, ip: INTERNAL_IPS[i % INTERNAL_IPS.length], ua: AGENTS[i % AGENTS.length] });
    });
    const byName = Object.fromEntries(users.map((u) => [u.username, u]));
    const admin = byName['ali.alsaadi'];
    const iam = byName['zainab.alobaidi'];
    const it = byName['sara.almusawi'];

    // ---- 30 days of normal activity (Baghdad 08:00-16:00 = 05:00-13:00 UTC, Fri/Sat weekend) ----
    for (let day = 30; day >= 0; day--) {
      const date = at(day, 0, 0);
      const weekday = date.getUTCDay();
      if (weekday === 5 || weekday === 6) continue;
      for (const u of users) {
        if (u.status === 'pending') continue;
        if (u.status === 'disabled' && day < 18) continue;
        if (u.status === 'suspended' && day < 6) continue;
        if (u.flags.mustChange) continue;
        if (u.flags.locked && day === 0) continue;
        if (rand() < 0.12) continue; // absent
        const ip = rand() < 0.85 ? u.ip : pick(INTERNAL_IPS);
        if (rand() < 0.07) {
          log(at(day, 5, Math.floor(rand() * 20)), u, 'auth.login', 'failure', { ip, ua: u.ua, details: { reason: 'bad_password', attempt: 1 } });
        }
        const loginTime = at(day, 5 + Math.floor(rand() * 2));
        if (u.mfa) {
          log(loginTime, u, 'auth.mfa.challenge', 'success', { ip, ua: u.ua });
          log(new Date(loginTime.getTime() + 25000), u, 'auth.mfa.verify', 'success', { ip, ua: u.ua, details: { method: 'totp' } });
        }
        log(new Date(loginTime.getTime() + 30000), u, 'auth.login', 'success', { ip, ua: u.ua, details: { mfa: u.mfa } });
        if (rand() < 0.6) log(at(day, 12 + Math.floor(rand() * 2)), u, 'auth.logout', 'success', { ip, ua: u.ua });
      }
    }

    // ---- Notable administrative events (lifecycle) ----
    const dalia = byName['dalia.alazzawi'];
    const karrar = byName['karrar.alzubaidi'];
    const shahad = byName['shahad.aljanabi'];
    log(at(18, 7, 10), iam, 'user.status_change', 'success', { targetType: 'user', targetId: karrar.id, details: { from: 'active', to: 'disabled', reason: 'انتهاء الخدمة - استقالة', sessionsRevoked: 1 } });
    log(at(18, 7, 12), iam, 'user.roles.update', 'success', { targetType: 'user', targetId: karrar.id, details: { added: [], removed: [] } });
    log(at(12, 9, 30), admin, 'role.permissions.update', 'success', { targetType: 'role', targetId: roleId.iam_admin, details: { role: 'iam_admin', granted: ['sessions:revoke_any'], revoked: [] } });
    log(at(9, 6, 5), iam, 'user.roles.update', 'success', { targetType: 'user', targetId: byName['maryam.aldulaimi'].id, details: { added: ['hr_manager'], removed: [] } });
    log(at(6, 10, 40), admin, 'user.status_change', 'success', { targetType: 'user', targetId: dalia.id, details: { from: 'active', to: 'suspended', reason: 'تحقيق إداري في صلاحيات مالية', sessionsRevoked: 2 } });
    log(at(4, 8, 15), iam, 'user.create', 'success', { targetType: 'user', targetId: shahad.id, details: { username: 'shahad.aljanabi', roles: ['employee'] } });
    log(at(3, 7, 2), it, 'user.password.reset', 'success', { targetType: 'user', targetId: byName['zahraa.alhilli'].id, details: { sessionsRevoked: 1 } });
    log(at(3, 7, 20), byName['zahraa.alhilli'], 'auth.password.change', 'success', { targetType: 'user', targetId: byName['zahraa.alhilli'].id, details: { otherSessionsRevoked: 0 } });
    log(at(2, 11, 0), byName['laith.alobaidi'], 'mfa.enable', 'success', { targetType: 'user', targetId: byName['laith.alobaidi'].id });
    log(at(2, 8, 45), byName['hiba.alnuaimi'], 'user.register', 'success', { targetType: 'user', targetId: byName['hiba.alnuaimi'].id });
    log(at(1, 9, 5), byName['ali.alfatlawi'], 'user.register', 'success', { targetType: 'user', targetId: byName['ali.alfatlawi'].id });
    log(at(1, 12, 30), byName['mustafa.aljubouri'], 'audit.export', 'success', { details: { rows: 412, filter: { status: 'failure' } } });

    // ---- Authorization denials (least privilege in action) ----
    log(at(8, 9, 14), byName['omar.alani'], 'access.denied', 'denied', { targetType: 'endpoint', targetId: 'GET /api/dashboard/resources/finance', details: { required: ['resources:finance:read'], missing: ['resources:finance:read'] } });
    log(at(5, 10, 2), byName['rusul.alkarkhi'], 'access.denied', 'denied', { targetType: 'endpoint', targetId: 'GET /api/audit/', details: { required: ['audit:read'], missing: ['audit:read'] } });
    log(at(2, 7, 48), byName['haider.altamimi'], 'access.denied', 'denied', { targetType: 'endpoint', targetId: 'GET /api/dashboard/resources/hr', details: { required: ['resources:hr:read'], missing: ['resources:hr:read'] } });
    log(at(1, 11, 21), byName['mustafa.aljubouri'], 'access.denied', 'denied', { targetType: 'endpoint', targetId: 'PATCH /api/users/13/status', details: { required: ['users:disable'], missing: ['users:disable'] } });
    log(at(0, 6, 3), byName['dalia.alazzawi'], 'auth.login', 'denied', { details: { reason: 'status_suspended' } });

    // ---- Security incident 1: password spraying from Tor exit node (10 days ago) ----
    const sprayTargets = ['admin', 'ali.alsaadi', 'zainab.alobaidi', 'hussein.alkhafaji', 'administrator', 'noor.alhashimi', 'root', 'test'];
    sprayTargets.forEach((name, k) => {
      const actor = byName[name] || null;
      log(at(10, 22, 10 + k), actor, 'auth.login', 'failure', {
        username: name, ip: ATTACK_IPS[0], ua: ATTACK_AGENT, details: { reason: actor ? 'bad_password' : 'unknown_user', attempt: 1 },
      });
    });

    // ---- Security incident 2: brute force against abbas.alsudani -> account locked (today) ----
    const abbas = byName['abbas.alsudani'];
    const startBrute = new Date(now.getTime() - 4 * 60 * 1000);
    for (let k = 1; k <= 5; k++) {
      const t = new Date(startBrute.getTime() + k * 9000);
      log(t, abbas, k === 5 ? 'auth.account_locked' : 'auth.login', 'failure', {
        ip: ATTACK_IPS[1], ua: ATTACK_AGENT, details: { reason: 'bad_password', attempt: k },
      });
    }
    log(new Date(now.getTime() - 2 * 60 * 1000), abbas, 'auth.login', 'denied', { ip: ATTACK_IPS[1], ua: ATTACK_AGENT, details: { reason: 'account_locked' } });

    // ---- Security incident 3: stolen refresh token replayed (5 days ago) ----
    const hussein = byName['hussein.alkhafaji'];
    log(at(5, 19, 40), hussein, 'auth.refresh_token_reuse', 'denied', {
      ip: ATTACK_IPS[2], ua: AGENTS[0], targetType: 'session', targetId: 'c7a1e0d2-5b9f-4e1a-9d3c-2f8b6a4e1c07', details: { note: 'Possible token theft – session revoked' },
    });

    // ---- Business content protected by the IAM rules ----
    require('./seed-business').seedBusiness({ db, byName, deptId, roleId, log, at, fmt, now });

    events.sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const e of events) {
      db.run(
        `INSERT INTO audit_logs (created_at, actor_id, actor_username, action, target_type, target_id, status, ip_address, user_agent, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        e.created_at, e.actor_id, e.actor_username, e.action, e.target_type, e.target_id == null ? null : String(e.target_id),
        e.status, e.ip, e.ua, e.details ? JSON.stringify(e.details) : null,
      );
    }

    // Update last_login_at from the generated history
    db.exec(`UPDATE users SET last_login_at = (SELECT MAX(created_at) FROM audit_logs a
             WHERE a.actor_id = users.id AND a.action = 'auth.login' AND a.status = 'success')`);

    // ---- Currently active sessions (other devices) ----
    const activeSessions = ['zainab.alobaidi', 'mustafa.aljubouri', 'sara.almusawi', 'noor.alhashimi', 'hussein.alkhafaji', 'ahmed.albayati', 'omar.alani', 'fatima.alrubaie', 'rusul.alkarkhi', 'laith.alobaidi', 'ali.alsaadi'];
    activeSessions.forEach((name, k) => {
      const u = byName[name];
      const created = new Date(now.getTime() - (1 + k * 1.7) * 3600 * 1000);
      db.run(
        `INSERT INTO sessions (id, user_id, refresh_token_hash, ip_address, user_agent, mfa_verified, created_at, last_used_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        require('node:crypto').randomUUID(), u.id, sha256(randomToken()), u.ip, k % 4 === 3 ? AGENTS[3] : u.ua,
        u.mfa ? 1 : 0, fmt(created), fmt(new Date(now.getTime() - k * 6 * 60 * 1000)),
        fmt(new Date(created.getTime() + 7 * 24 * 3600 * 1000)),
      );
    });

    for (const [category, title, body, classification] of RESOURCES) {
      db.run('INSERT INTO resources (category, title, body, classification) VALUES (?, ?, ?, ?)', category, title, body, classification);
    }
  });

  console.log(`Seeded ${USERS.length} users, ${ROLES.length} roles, ${PERMISSIONS.length} permissions, ${events.length} audit events.`);
}

module.exports = { seed, DEMO_PASSWORD, DEMO_MFA_SECRET, DEMO_RECOVERY_CODES };

if (require.main === module) {
  seed({ reset: process.argv.includes('--reset') }).catch((err) => { console.error(err); process.exit(1); });
}
