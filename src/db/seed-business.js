// Business content for the demo company. This is the "what" that the IAM layer
// protects: HR records & salaries, leave, payroll, invoices, expenses, CRM, tickets, IT assets.
// Everything is deterministic (fixed-seed PRNG) so every `npm run seed` gives the same data.

let s = 77031;
const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const round = (n, to = 5000) => Math.round(n / to) * to;

function dayStr(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
// Working days between two dates (Fri/Sat weekend)
function workDays(start, end) {
  let n = 0;
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (![5, 6].includes(d.getUTCDay())) n++;
  }
  return Math.max(n, 1);
}

// username -> [employee_no, phone, ext, hire, birth, gender, contract, grade, base salary]
const PROFILES = {
  'ali.alsaadi':       ['RT-1001', '0770 412 8851', '101', '2019-03-10', '1984-06-14', 'male', 'دائم', 'الأولى', 5800000],
  'zainab.alobaidi':   ['RT-1014', '0771 905 3320', '114', '2021-09-01', '1991-02-27', 'female', 'دائم', 'الثالثة', 2900000],
  'mustafa.aljubouri': ['RT-1022', '0780 233 7614', '122', '2022-04-17', '1993-11-05', 'male', 'دائم', 'الثالثة', 2600000],
  'mohammed.alqaisi':  ['RT-1009', '0750 118 4402', '109', '2020-07-12', '1982-01-30', 'male', 'دائم', 'الثانية', 3600000],
  'sara.almusawi':     ['RT-1031', '0772 640 9915', '131', '2023-02-05', '1997-08-19', 'female', 'دائم', 'الرابعة', 1900000],
  'laith.alobaidi':    ['RT-1004', '0790 377 2108', '104', '2019-11-03', '1986-04-08', 'male', 'دائم', 'الثانية', 4200000],
  'yasir.alshammari':  ['RT-1027', '0781 552 0067', '127', '2022-10-23', '1995-12-12', 'male', 'دائم', 'الرابعة', 2000000],
  'rusul.alkarkhi':    ['RT-1036', '0773 018 6644', '136', '2024-01-14', '1999-03-21', 'female', 'عقد سنوي', 'الرابعة', 1800000],
  'noor.alhashimi':    ['RT-1006', '0770 901 4433', '106', '2020-02-16', '1985-09-02', 'female', 'دائم', 'الثانية', 4000000],
  'maryam.aldulaimi':  ['RT-1033', '0782 466 1290', '133', '2023-06-11', '1996-05-25', 'female', 'دائم', 'الرابعة', 1700000],
  'hussein.alkhafaji': ['RT-1003', '0771 230 5587', '103', '2019-08-04', '1980-12-01', 'male', 'دائم', 'الثانية', 4600000],
  'haider.altamimi':   ['RT-1018', '0750 745 3019', '118', '2021-12-05', '1990-07-17', 'male', 'دائم', 'الثالثة', 2500000],
  'dalia.alazzawi':    ['RT-1029', '0772 381 9006', '129', '2022-11-20', '1994-10-09', 'female', 'دائم', 'الرابعة', 1800000],
  'ahmed.albayati':    ['RT-1007', '0790 612 7741', '107', '2020-05-03', '1987-03-15', 'male', 'دائم', 'الثانية', 3900000],
  'omar.alani':        ['RT-1035', '0781 904 2276', '135', '2023-10-01', '1998-01-23', 'male', 'دائم', 'الخامسة', 1400000],
  'shahad.aljanabi':   ['RT-1042', '0773 556 0981', '142', '2026-11-06', '2001-06-30', 'female', 'فترة تجربة', 'الخامسة', 1200000],
  'fatima.alrubaie':   ['RT-1038', '0770 287 6150', '138', '2024-03-17', '1999-11-11', 'female', 'دائم', 'الخامسة', 1250000],
  'abbas.alsudani':    ['RT-1012', '0782 140 3398', '112', '2021-01-24', '1989-08-28', 'male', 'دائم', 'الثالثة', 2700000],
  'zahraa.alhilli':    ['RT-1040', '0771 663 4827', '140', '2024-09-08', '2000-04-04', 'female', 'عقد سنوي', 'الخامسة', 1150000],
  'karrar.alzubaidi':  ['RT-1024', '0780 095 1173', '124', '2022-06-19', '1994-02-14', 'male', 'منتهي', 'الخامسة', 1350000],
  'hiba.alnuaimi':     ['RT-1043', '0772 994 0215', '143', '2026-11-10', '2000-09-18', 'female', 'فترة تجربة', 'الخامسة', 1200000],
  'ali.alfatlawi':     ['RT-1044', '0790 451 8862', '144', '2026-11-10', '1999-07-07', 'male', 'فترة تجربة', 'الخامسة', 1100000],
  'ammar.alrawi':      ['RT-1000', '0770 100 2000', '100', '2018-01-07', '1976-05-20', 'male', 'دائم', 'الأولى', 7500000],
};
const AREAS = ['بغداد - المنصور، حي الأميرات', 'بغداد - الكرادة داخل', 'بغداد - زيونة', 'بغداد - اليرموك', 'بغداد - الأعظمية', 'بغداد - الجادرية', 'بغداد - حي الجامعة', 'بغداد - الدورة', 'بغداد - الغزالية', 'بغداد - الشعب', 'بغداد - البلديات'];

function seedBusiness({ db, byName, deptId, log, at, now }) {
  const U = (name) => byName[name];
  const usersByDept = {};
  for (const u of db.all('SELECT id, username, department_id, status FROM users')) {
    (usersByDept[u.department_id] ||= []).push(u);
  }
  const activeUsers = db.all("SELECT id, username, department_id FROM users WHERE status IN ('active','suspended')");

  // ---------------- Employee profiles ----------------
  Object.entries(PROFILES).forEach(([username, p], i) => {
    const [no, phone, ext, hire, birth, gender, contract, grade, base] = p;
    db.run(
      `INSERT INTO employee_profiles (user_id, employee_no, phone, extension, hire_date, birth_date, gender, national_id, address,
         emergency_contact, contract_type, grade, base_salary, allowances, bank_iban, annual_leave_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      U(username).id, no, phone, ext, hire, birth, gender,
      `1990${String(4718203 + i * 7919).padStart(8, '0')}`,
      AREAS[i % AREAS.length], `${pick(['الأب', 'الأم', 'الزوج', 'الزوجة', 'الأخ'])} — 07${between(70, 90)} ${between(100, 999)} ${between(1000, 9999)}`,
      contract, grade, base, round(base * 0.2), `IQ${between(10, 99)}RAFB${String(between(100, 999))}${String(between(100000000, 999999999))}${between(100, 999)}`,
      grade === 'الأولى' || grade === 'الثانية' ? 30 : 24,
    );
  });

  // ---------------- Announcements ----------------
  const ann = [
    ['تفعيل المصادقة الثنائية إلزامي لجميع المدراء', 'بقرار من إدارة أمن المعلومات، يجب على جميع مدراء الأقسام وأصحاب الصلاحيات الإدارية تفعيل المصادقة الثنائية من صفحة «حسابي والأمان» قبل 30 تشرين الثاني 2026. الحسابات غير المفعّلة بعد هذا التاريخ ستُعلَّق صلاحياتها الإدارية مؤقتاً.', null, 1, 'ali.alsaadi', 3],
    ['تحذير: حملة رسائل تصيّد تنتحل صفة مصرف الرافدين', 'رُصدت رسائل بريد إلكتروني تطلب «تحديث بيانات حساب الراتب» عبر رابط خارجي. لا تُدخل كلمة مرورك أو بياناتك المصرفية في أي رابط. أبلغ عن الرسالة إلى security@alrafidain-tech.iq وامسحها.', null, 1, 'ali.alsaadi', 1],
    ['الدوام الشتوي يبدأ الأحد 16 تشرين الثاني', 'يبدأ الدوام الشتوي من الساعة 8:30 صباحاً حتى 4:00 عصراً اعتباراً من يوم الأحد 16/11/2026.', null, 0, 'noor.alhashimi', 4],
    ['ترحيب بالموظفين الجدد', 'نرحب بالزميلة شهد الجنابي في قسم المبيعات، وبالمرشحَين الجديدين في قسمي الموارد البشرية وخدمة العملاء. يرجى من الجميع مساعدتهم في أسبوعهم الأول.', null, 0, 'noor.alhashimi', 5],
    ['صرف رواتب شهر تشرين الأول', 'تم تحويل رواتب شهر تشرين الأول إلى الحسابات المصرفية للموظفين بتاريخ 28/10/2026. يمكن لكل موظف الاطلاع على قسيمة راتبه من صفحة «الرواتب».', null, 0, 'hussein.alkhafaji', 14],
    ['اجتماع المبيعات الأسبوعي — مراجعة صفقات الربع الرابع', 'الاجتماع يوم الأحد الساعة 9:00 في قاعة الاجتماعات الصغرى. على كل مندوب تحديث مراحل صفقاته في النظام قبل الاجتماع.', 'SAL', 0, 'ahmed.albayati', 2],
    ['إجراء جديد لتسليم الأجهزة', 'أي جهاز يُسلَّم لموظف يجب تسجيله في نظام الأصول برقم الوسم (Tag) قبل خروجه من المخزن. الأجهزة غير المسجّلة لن تُضاف إلى شبكة الشركة.', 'IT', 0, 'laith.alobaidi', 6],
    ['دورة Excel المتقدمة لقسم المالية', 'دورة تدريبية لمدة يومين (الجداول المحورية، Power Query) يومي 23 و24 تشرين الثاني. التسجيل عبر المدير المالي.', 'FIN', 0, 'hussein.alkhafaji', 3],
    ['تحديث مؤشرات زمن الاستجابة للتذاكر', 'الهدف الجديد: الرد الأول خلال ساعتين للتذاكر العاجلة و8 ساعات للعالية. سيتم عرض المؤشرات أسبوعياً.', 'CS', 0, 'abbas.alsudani', 7],
  ];
  for (const [title, body, dept, pinned, by, daysAgo] of ann) {
    db.run('INSERT INTO announcements (title, body, department_id, pinned, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      title, body, dept ? deptId[dept] : null, pinned, U(by).id, at(daysAgo, 7).toISOString().replace('T', ' ').slice(0, 19));
  }

  // ---------------- Leave requests ----------------
  const reasons = {
    annual: ['سفر عائلي', 'زيارة الأهل في البصرة', 'مراجعة دائرة حكومية', 'سفر إلى أربيل', 'زفاف أحد الأقارب', 'راحة'],
    sick: ['مراجعة طبية', 'نزلة برد شديدة', 'عملية بسيطة', 'وعكة صحية'],
    emergency: ['ظرف عائلي طارئ', 'وفاة أحد الأقارب', 'حالة طارئة في المنزل'],
    unpaid: ['التزامات دراسية (امتحانات الماجستير)'],
  };
  const approverFor = (u) => {
    const d = db.get('SELECT code FROM departments WHERE id = ?', u.department_id).code;
    const mgr = { SEC: 'ali.alsaadi', IT: 'laith.alobaidi', HR: 'noor.alhashimi', FIN: 'hussein.alkhafaji', SAL: 'ahmed.albayati', CS: 'abbas.alsudani', EXEC: 'ammar.alrawi' }[d];
    return U(mgr).username === u.username ? U('noor.alhashimi') : U(mgr); // managers' own requests go to HR
  };
  const leaveRows = [];
  for (const u of activeUsers) {
    const count = between(1, 3);
    for (let k = 0; k < count; k++) {
      const type = pick(['annual', 'annual', 'annual', 'sick', 'sick', 'emergency', 'unpaid']);
      const offset = between(-75, 30);
      const len = type === 'annual' ? between(1, 6) : between(1, 3);
      const start = dayStr(offset);
      const end = dayStr(offset + len - 1);
      if (start <= PROFILES[u.username][3]) continue; // no leave before the hire date
      const future = offset > 0;
      const status = future ? pick(['pending', 'pending', 'approved']) : pick(['approved', 'approved', 'approved', 'rejected']);
      leaveRows.push({ u, type, start, end, days: workDays(start, end), reason: pick(reasons[type]), status, createdOffset: Math.min(offset - between(2, 10), -1) });
    }
  }
  // Specific requests used in the walkthrough
  leaveRows.push({ u: U('omar.alani'), type: 'annual', start: dayStr(9), end: dayStr(13), days: workDays(dayStr(9), dayStr(13)), reason: 'سفر إلى النجف مع العائلة', status: 'pending', createdOffset: -1 });
  leaveRows.push({ u: U('ahmed.albayati'), type: 'annual', start: dayStr(20), end: dayStr(24), days: workDays(dayStr(20), dayStr(24)), reason: 'إجازة نهاية السنة', status: 'pending', createdOffset: -1 });
  leaveRows.push({ u: U('rusul.alkarkhi'), type: 'sick', start: dayStr(3), end: dayStr(4), days: workDays(dayStr(3), dayStr(4)), reason: 'مراجعة طبية', status: 'pending', createdOffset: 0 });

  for (const r of leaveRows) {
    const full = db.get('SELECT id, username, department_id FROM users WHERE id = ?', r.u.id);
    const reviewer = r.status === 'pending' ? null : approverFor(full);
    const created = dayStr(r.createdOffset);
    db.run(
      `INSERT INTO leave_requests (user_id, type, start_date, end_date, days, reason, status, reviewed_by, reviewed_at, review_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      full.id, r.type, r.start, r.end, r.days, r.reason, r.status, reviewer?.id ?? null,
      reviewer ? `${created} 09:${String(between(10, 59))}:00` : null,
      r.status === 'rejected' ? pick(['تزامن مع ضغط العمل نهاية الشهر', 'الرصيد غير كافٍ', 'يرجى اختيار موعد آخر']) : null,
      `${created} 07:${String(between(10, 59))}:00`,
    );
    if (reviewer) {
      log(new Date(`${created}T09:30:00Z`), reviewer, `leave.${r.status === 'approved' ? 'approve' : 'reject'}`, 'success', {
        targetType: 'leave', targetId: db.get('SELECT last_insert_rowid() AS id').id, details: { employee: full.username, days: r.days },
      });
    }
  }

  // ---------------- Payroll ----------------
  const payable = db.all(
    `SELECT u.id, u.username, p.base_salary, p.allowances FROM users u JOIN employee_profiles p ON p.user_id = u.id
     WHERE u.status IN ('active','suspended') AND p.hire_date <= ?`, dayStr(-5),
  );
  const periods = [
    ['2026-08', 'paid', '2026-08-26'],
    ['2026-09', 'paid', '2026-09-27'],
    ['2026-10', 'paid', '2026-10-27'],
    ['2026-11', 'draft', null],
  ];
  for (const [period, status, approvedOn] of periods) {
    const { lastInsertRowid: runId } = db.run(
      'INSERT INTO payroll_runs (period, status, prepared_by, approved_by, approved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      period, status, U('haider.altamimi').id, approvedOn ? U('hussein.alkhafaji').id : null,
      approvedOn ? `${approvedOn} 10:15:00` : null, approvedOn ? `${approvedOn.slice(0, 8)}22 08:30:00` : `${dayStr(-1)} 08:30:00`,
    );
    for (const e of payable) {
      const overtime = rnd() < 0.25 ? round(e.base_salary * 0.05 * between(1, 3), 1000) : 0;
      const gross = e.base_salary + e.allowances + overtime;
      const ss = round(e.base_salary * 0.05, 250);
      const tax = round(Math.max(0, gross - 1000000) * 0.03, 250);
      db.run('INSERT INTO payslips (run_id, user_id, base, allowances, overtime, deductions, tax, net) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        runId, e.id, e.base_salary, e.allowances, overtime, ss, tax, gross - ss - tax);
    }
    if (approvedOn) log(new Date(`${approvedOn}T07:15:00Z`), U('hussein.alkhafaji'), 'payroll.approve', 'success', { targetType: 'payroll', targetId: period });
  }

  // ---------------- Supplier invoices ----------------
  const vendors = [
    ['شركة النهرين للطاقة', 'اشتراك المولدة الأهلية — 60 أمبير لمبنى الشركة', 2400000, 4800000],
    ['شركة الفرات للاتصالات', 'خط إنترنت مخصص 200 ميغا + IP ثابت', 3500000, 3500000],
    ['شركة دجلة لتجهيز الحاسبات', 'حاسبات محمولة للموظفين الجدد', 8000000, 26000000],
    ['مكتب بغداد للقرطاسية', 'قرطاسية وأحبار طابعات', 350000, 1200000],
    ['مؤسسة الكرخ للخدمات', 'تنظيف وصيانة المبنى الشهرية', 1800000, 1800000],
    ['شركة الرافد للتأمين', 'تأمين صحي جماعي للموظفين (ربع سنوي)', 14500000, 14500000],
    ['شركة آسيا للحلول الشبكية', 'تراخيص وحماية جدار الناري FortiGate', 9500000, 18000000],
    ['فندق قصر دجلة', 'قاعة اجتماعات وضيافة لورشة عمل العملاء', 2200000, 5600000],
    ['مكتب الحقوقي سامر الكبيسي', 'استشارات قانونية وصياغة عقود', 3000000, 6000000],
    ['مركز بيانات بغداد السحابي', 'استضافة خوادم (شهرية)', 9200000, 9200000],
    ['شركة زاكروس للأثاث المكتبي', 'كراسي ومكاتب لقسم خدمة العملاء', 7500000, 12500000],
    ['شركة الوطن للسيارات', 'صيانة سيارة الشركة وتبديل إطارات', 650000, 1900000],
  ];
  let invNo = 4180;
  for (let k = 0; k < 34; k++) {
    const [vendor, desc, min, max] = vendors[k % vendors.length];
    const amount = round(between(min, max), 25000);
    const createdOffset = -between(1, 70);
    const createdBy = rnd() < 0.7 ? U('haider.altamimi') : U('dalia.alazzawi');
    let status = createdOffset < -20 ? pick(['paid', 'paid', 'approved', 'rejected']) : pick(['pending', 'pending', 'approved']);
    let approver = null;
    if (status !== 'pending') approver = amount > 10000000 || createdBy.username === 'haider.altamimi' ? U('hussein.alkhafaji') : U('haider.altamimi');
    db.run(
      `INSERT INTO invoices (number, vendor, description, amount, due_date, status, created_by, approved_by, approved_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `INV-2026-${invNo++}`, vendor, desc, amount, dayStr(createdOffset + 30), status, createdBy.id, approver?.id ?? null,
      approver ? `${dayStr(createdOffset + 2)} 10:00:00` : null, `${dayStr(createdOffset)} 08:45:00`,
    );
  }
  // Two clear demo cases: a large pending invoice and one created by Haider himself
  db.run(`INSERT INTO invoices (number, vendor, description, amount, due_date, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    `INV-2026-${invNo++}`, 'شركة دجلة لتجهيز الحاسبات', 'خادم Dell PowerEdge R760 لتوسعة مركز البيانات', 42750000, dayStr(25), U('dalia.alazzawi').id, `${dayStr(-2)} 09:10:00`);
  db.run(`INSERT INTO invoices (number, vendor, description, amount, due_date, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    `INV-2026-${invNo++}`, 'مكتب بغداد للقرطاسية', 'ورق طباعة A4 (50 رزمة) وأحبار', 975000, dayStr(20), U('haider.altamimi').id, `${dayStr(-1)} 11:25:00`);
  db.run(`INSERT INTO invoices (number, vendor, description, amount, due_date, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    `INV-2026-${invNo++}`, 'شركة النهرين للطاقة', 'اشتراك المولدة الأهلية — تشرين الثاني', 4500000, dayStr(15), U('dalia.alazzawi').id, `${dayStr(-3)} 08:20:00`);

  // ---------------- Expense claims ----------------
  const expenseTemplates = [
    ['transport', 'أجرة نقل لزيارة عميل في', 25000, 150000],
    ['hospitality', 'ضيافة اجتماع مع عميل —', 60000, 350000],
    ['training', 'رسوم دورة تدريبية —', 250000, 900000],
    ['equipment', 'شراء ملحقات (ماوس وكيبورد وشاحن) —', 45000, 220000],
    ['telecom', 'رصيد هاتف للعمل — شهر', 25000, 50000],
  ];
  const places = ['المنصور', 'الكرادة', 'الحارثية', 'شارع فلسطين', 'العرصات', 'الجادرية', 'الكاظمية'];
  for (let k = 0; k < 30; k++) {
    const u = pick(activeUsers);
    const [cat, prefix, min, max] = pick(expenseTemplates);
    const off = -between(0, 45);
    const status = off > -5 ? 'pending' : pick(['approved', 'approved', 'approved', 'rejected']);
    const reviewer = status === 'pending' ? null : (u.username === 'haider.altamimi' ? U('hussein.alkhafaji') : U('haider.altamimi'));
    db.run(
      `INSERT INTO expense_claims (user_id, category, amount, description, expense_date, status, reviewed_by, reviewed_at, review_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u.id, cat, round(between(min, max), 5000), `${prefix} ${cat === 'telecom' ? 'تشرين الأول' : pick(places)}`, dayStr(off - 1), status,
      reviewer?.id ?? null, reviewer ? `${dayStr(off + 2)} 11:00:00` : null,
      status === 'rejected' ? 'لا يوجد وصل (فاتورة) مرفق' : null, `${dayStr(off)} 12:00:00`,
    );
  }
  db.run(`INSERT INTO expense_claims (user_id, category, amount, description, expense_date, status, created_at) VALUES (?, 'transport', 120000, 'أجرة نقل لزيارة عميل في البصرة (مصرف الجنوب الإسلامي)', ?, 'pending', ?)`,
    U('omar.alani').id, dayStr(-3), `${dayStr(-2)} 10:00:00`);
  db.run(`INSERT INTO expense_claims (user_id, category, amount, description, expense_date, status, created_at) VALUES (?, 'hospitality', 280000, 'غداء عمل مع وفد شركة الوركاء', ?, 'pending', ?)`,
    U('haider.altamimi').id, dayStr(-4), `${dayStr(-3)} 13:00:00`);

  // ---------------- Customers ----------------
  const customers = [
    ['شركة الوركاء للنفط والغاز', 'نفط وطاقة', 'البصرة', 'م. سعد الإمارة'],
    ['مصرف الجنوب الإسلامي', 'مصارف', 'البصرة', 'أ. زيد الحسيني'],
    ['مجموعة سومر التجارية', 'تجارة جملة', 'بغداد', 'أ. ماهر الدوري'],
    ['جامعة أكد الأهلية', 'تعليم', 'بغداد', 'د. هدى الشيخلي'],
    ['مستشفى النور التخصصي', 'صحة', 'أربيل', 'د. آراس محمد'],
    ['شركة بابل للإسمنت', 'صناعة', 'الحلة', 'م. فراس الجبوري'],
    ['شركة أور للنقل البري', 'نقل ولوجستيات', 'الناصرية', 'أ. حسن الركابي'],
    ['فندق قصر دجلة', 'ضيافة', 'بغداد', 'أ. لمى العاني'],
    ['مدارس الأمل الأهلية', 'تعليم', 'كربلاء', 'أ. منتظر الطائي'],
    ['شركة نينوى للأدوية', 'صناعة دوائية', 'الموصل', 'د. ريم الحمداني'],
    ['هيئة استثمار النجف (مشروع تجريبي)', 'قطاع عام', 'النجف', 'م. علي الياسري'],
    ['شركة كوردستان للاتصالات المتقدمة', 'اتصالات', 'السليمانية', 'م. شوان رحيم'],
    ['سلسلة أسواق الفرات', 'تجزئة', 'بغداد', 'أ. باسم الكعبي'],
    ['شركة الرافدين للمقاولات الإنشائية', 'مقاولات', 'بغداد', 'م. نبيل الزبيدي'],
    ['مختبرات الشفاء الطبية', 'صحة', 'بغداد', 'د. سلوى الخزرجي'],
    ['شركة الخليج للشحن البحري', 'نقل ولوجستيات', 'البصرة', 'أ. مرتضى البدران'],
    ['شركة ميسان الزراعية', 'زراعة', 'العمارة', 'م. كاظم السوداني'],
    ['معهد المستقبل للتدريب المهني', 'تعليم', 'بغداد', 'أ. رنا القيسي'],
  ];
  const reps = [U('omar.alani'), U('shahad.aljanabi'), U('karrar.alzubaidi'), U('ahmed.albayati')];
  const custIds = customers.map(([name, sector, city, contact], k) => Number(db.run(
    `INSERT INTO customers (name, sector, city, contact_name, phone, email, account_manager_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    name, sector, city, contact, `07${between(70, 90)} ${between(100, 999)} ${between(1000, 9999)}`,
    `info@client${k + 1}.iq`, reps[k % reps.length].id, `${dayStr(-between(60, 400))} 10:00:00`,
  ).lastInsertRowid));

  // ---------------- Deals ----------------
  const products = [
    ['نظام تخطيط موارد المؤسسة (ERP)', 120000000, 450000000],
    ['تجهيز وتمديد شبكة حاسبات', 25000000, 90000000],
    ['عقد صيانة ودعم فني سنوي', 18000000, 60000000],
    ['تطوير تطبيق جوال', 35000000, 110000000],
    ['نظام أرشفة إلكترونية', 30000000, 85000000],
    ['نظام كاميرات مراقبة ذكي', 22000000, 70000000],
    ['استضافة سحابية ونسخ احتياطي', 15000000, 40000000],
    ['تدقيق أمن معلومات واختبار اختراق', 20000000, 55000000],
  ];
  for (let k = 0; k < 32; k++) {
    const ci = k % custIds.length;
    const [title, min, max] = pick(products);
    const owner = k < 3 ? U('omar.alani') : reps[(ci + k) % reps.length];
    const stage = pick(['lead', 'proposal', 'proposal', 'negotiation', 'negotiation', 'won', 'won', 'lost']);
    const created = -between(10, 120);
    db.run(
      `INSERT INTO deals (customer_id, title, value, stage, owner_id, expected_close, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      custIds[ci], title, round(between(min, max), 500000), stage, owner.id,
      dayStr(['won', 'lost'].includes(stage) ? created + between(20, 60) : between(5, 90)),
      `${dayStr(created)} 09:00:00`, `${dayStr(Math.min(created + between(3, 40), -1))} 14:00:00`,
    );
  }

  // ---------------- Support tickets ----------------
  const subjects = [
    ['تعطل نظام نقاط البيع في الفرع الرئيسي', 'urgent'], ['بطء شديد في الشبكة الداخلية', 'high'], ['طلب إضافة مستخدمين جدد للنظام', 'low'],
    ['خطأ في تقرير المبيعات الشهري', 'medium'], ['انقطاع خدمة البريد الإلكتروني', 'urgent'], ['مشكلة في طباعة الفواتير', 'medium'],
    ['طلب تدريب موظفي العميل على النظام', 'low'], ['فشل النسخ الاحتياطي الليلي', 'high'], ['كاميرا المدخل الرئيسي لا تسجّل', 'medium'],
    ['تحديث شهادة SSL للموقع', 'high'], ['استفسار عن تجديد عقد الصيانة', 'low'], ['تعذّر الدخول إلى بوابة الموظفين', 'high'],
  ];
  const agents = [U('fatima.alrubaie'), U('zahraa.alhilli'), U('abbas.alsudani')];
  for (let k = 0; k < 40; k++) {
    const [subject, priority] = pick(subjects);
    const off = -between(0, 40);
    const status = off > -3 ? pick(['open', 'open', 'in_progress']) : pick(['in_progress', 'resolved', 'closed', 'closed']);
    const assignee = status === 'open' && rnd() < 0.5 ? null : pick(agents);
    db.run(
      `INSERT INTO tickets (number, customer_id, subject, description, priority, status, assigned_to, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `TCK-${String(2201 + k)}`, pick(custIds), subject, `أبلغ العميل عن: ${subject}. تم التواصل هاتفياً وجمع التفاصيل الأولية.`,
      priority, status, assignee?.id ?? null, pick(agents).id, `${dayStr(off)} ${String(between(5, 12)).padStart(2, '0')}:20:00`,
      `${dayStr(Math.min(off + between(0, 3), 0))} 13:00:00`,
    );
  }

  // ---------------- IT assets ----------------
  const laptopModels = ['Dell Latitude 5440', 'HP EliteBook 840 G10', 'Lenovo ThinkPad T14 Gen 4'];
  let n = 1;
  const tag = (prefix) => `RT-${prefix}-${String(n++).padStart(4, '0')}`;
  const serial = () => Array.from({ length: 10 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'[between(0, 33)]).join('');
  const insertAsset = (prefix, type, model, status, user, location, purchaseOffset) => db.run(
    `INSERT INTO assets (tag, type, model, serial, status, assigned_to, location, purchase_date, warranty_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tag(prefix), type, model, serial(), status, user?.id ?? null, location, dayStr(purchaseOffset), dayStr(purchaseOffset + 3 * 365),
  );
  for (const u of activeUsers) {
    const dev = ['rusul.alkarkhi', 'laith.alobaidi'].includes(u.username);
    insertAsset('LT', 'laptop', dev ? 'Apple MacBook Pro 14 (M3)' : pick(laptopModels), 'in_use', u, 'مع الموظف', -between(100, 900));
    if (rnd() < 0.55) insertAsset('MN', 'monitor', pick(['Dell P2422H', 'LG 27UL500', 'Samsung S24C450']), 'in_use', u, 'المبنى الرئيسي - الطابق ' + between(1, 3), -between(100, 900));
    if (['SAL', 'EXEC'].includes(db.get('SELECT code FROM departments WHERE id = ?', u.department_id).code) || rnd() < 0.15) {
      insertAsset('PH', 'phone', pick(['Samsung Galaxy A55', 'iPhone 15', 'Samsung Galaxy S24']), 'in_use', u, 'مع الموظف', -between(60, 500));
    }
  }
  insertAsset('LT', 'laptop', 'Dell Latitude 5440', 'in_stock', null, 'مخزن تقنية المعلومات', -40);
  insertAsset('LT', 'laptop', 'Dell Latitude 5440', 'in_stock', null, 'مخزن تقنية المعلومات', -40);
  insertAsset('LT', 'laptop', 'HP EliteBook 840 G10', 'repair', null, 'ورشة الصيانة - شاشة مكسورة', -600);
  insertAsset('LT', 'laptop', 'Lenovo ThinkPad T470', 'retired', null, 'مستودع الإتلاف', -2400);
  insertAsset('SV', 'server', 'Dell PowerEdge R750', 'in_use', null, 'غرفة الخوادم - الرف A1', -700);
  insertAsset('SV', 'server', 'Dell PowerEdge R650', 'in_use', null, 'غرفة الخوادم - الرف A2', -950);
  insertAsset('SV', 'server', 'HPE ProLiant DL380 Gen10', 'in_use', null, 'غرفة الخوادم - الرف B1', -1300);
  insertAsset('NW', 'network', 'FortiGate 100F (جدار ناري)', 'in_use', null, 'غرفة الخوادم - الرف A3', -500);
  insertAsset('NW', 'network', 'Cisco Catalyst 9200-48P', 'in_use', null, 'الطابق الأول - خزانة الشبكة', -820);
  insertAsset('NW', 'network', 'Cisco Catalyst 9200-24P', 'in_use', null, 'الطابق الثاني - خزانة الشبكة', -820);
  insertAsset('NW', 'network', 'Ubiquiti UniFi U6 Pro (×6)', 'in_use', null, 'جميع الطوابق', -300);
  insertAsset('PR', 'printer', 'HP LaserJet Pro M404dn', 'in_use', null, 'الطابق الأول - قسم المالية', -1000);
  insertAsset('PR', 'printer', 'Canon imageRUNNER 2630i', 'in_use', null, 'الطابق الثاني - الاستقبال', -400);
  // The leaver's laptop must come back: still assigned to a disabled user (shows up in the asset review)
  insertAsset('LT', 'laptop', 'HP EliteBook 840 G9', 'in_use', U('karrar.alzubaidi'), 'لم يُسترجع بعد — موظف سابق', -800);
}

module.exports = { seedBusiness };
