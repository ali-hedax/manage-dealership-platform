# Changelog

## [Unreleased] — branch `feature/department-workspaces`

- نسخه آزموده‌شده `e7319eb` با مجوز مالک روی Manage عملیاتی منتشر شد؛ حساب موجود مالک با ثبت تاریخی تعیین و پرونده‌ها، کاتالوگ، سوابق، رمزها و نقش‌های کارکنان حفظ شدند. پشتیبان پیش/پس از نصب و بازیابی تأیید شد.

- اصلاح پیوند مستقیم به بخش پرونده پس از بارگذاری غیرهم‌زمان؛ به‌روزرسانی داده در همان پرونده، موقعیت پیمایش کاربر را تغییر نمی‌دهد.

- منوی واحد تصادفات با پرونده/ثبت/گزارش و میزهای کار نقش‌ها، کارت‌های کار با آیکون و صف مرتبط، میان‌بر بخش‌های پرونده و نمایش جمع‌شده واحدهای آینده.
- پنل مالک برای تغییر الگوهای سمت و مجوز اضافه/ممنوع هر کارمند، بازبینی قبل ذخیره، اعمال در درخواست بعدی، حفاظت حساب مالک، کنترل هم‌زمانی و ثبت تاریخی. ماسک تماس بر اساس مجوز نهایی و جلوگیری از دعوت فراتر از مجوز مدیر غیرمالک.

All notable changes. Versions follow semantic versioning once releases start.

## [Unreleased] — branch `feature/reference-data`

- نسخه `a25292e` با مجوز مالک روی Manage عملیاتی نصب شد؛ ۴۷۰۴۵ کد قطعه و ۲۷۳۲ سابقه پذیرش وارد اطلاعات پایه شد، بدون ساخت پرونده یا تغییر موجودی انبار. پشتیبان پیش/پس از نصب و بازیابی تأیید شد. جست‌وجوی سابقه در ویرایش پرونده موجود نیز در دسترس است.

- افزایش ظرفیت فایل مرجع به پنج مگابایت با بخش‌های ۵۰۰۰تایی؛ نگهداری فقط ستون‌های انتخاب‌شده، کنترل تکرار کد در کل فایل، ورود ماهانه سوابق و نمایش پذیرش تاریخی همراه پرونده‌های منیج منطبق.
- رفع محدودیت ۸۰ نویسه‌ای شرح تیپ/مدل (اکنون ۱۰۰۰)، نام مشتری ۵۰۰؛ شرح تیپ چندخطی، خطاهای فارسی، پذیرش قابل ویرایش و نمایش هر دو شماره در فهرست، پرونده و گزارش Excel/PDF. پذیرش بدون شماره ایران‌خودرو همچنان با شماره منیج پیگیری می‌شود.

- «اطلاعات پایه»: ورود چند فایل کاتالوگ قطعات و سوابق مشتری/خودرو با انتخاب برگه، سربرگ و نگاشت ستون‌ها، پیش‌نمایش و گزارش فارسی تمام ردیف‌ها، کنترل تکرار و نسخه هم‌زمان، بدون ایجاد پرونده یا رزرو انبار.
- انتخاب کد/نام قطعه در فرم افزودن قطعه؛ جست‌وجوی دقیق شاسی/VIN و انتخاب سابقه در فرم پذیرش با تکمیل فقط خانه‌های خالی. حفاظت از شماره‌های متنی و مالکیت تاریخی، تفکیک مجوزها و نمای موبایل. [راهنما](docs/REFERENCE_DATA_FA.md).

## [Unreleased] — branch `feature/reports-center`

- شروع واقعی نمایندگی ۱۳۰۷ حسینی با تأیید مالک: حذف محدود پنج پرونده نمونه، غیرفعال‌سازی هفت حساب نمونه با حفظ حساب شخصی و تاریخچه، ورود پانزده خودرو و حفظ هشت ردیف نیازمند بررسی؛ حالت Production و پشتیبان روزانه با overlay مستقل. تصاویر برنامه همان نسخه آزموده‌شده‌اند. [راهنما](docs/REAL_START_FA.md).
- دعوت خصوصی اولین همکار با همه نقش‌های فعلی، بنا بر انتخاب صریح مالک؛ فعال‌سازی شخصی و Authenticator توسط خود همکار انجام می‌شود. ایمیل ارسال نشده است.

- «گزارش‌ها» در منو و میان‌بر در داشبورد، فهرست پرونده‌ها، قطعات و فعالیت‌ها: نماهای مدیر خدمات، انبار و قطعات، تصادفات، واحدهای تعمیر و کنترل کیفیت؛ نمای پیش‌فرض بر اساس نقش و کنترل دسترسی در API.
- «کارهای امروز» با اولویت موعد گذشته، امروز، نزدیک، بعدی و بدون موعد و دلیل اولویت؛ «آمار و روند» با حداکثر شش شاخص (واحد و تعریف)، نمودار مراحل، علل توقف، کامل‌بودن داده، سن پرونده، ماندن در مرحله (با شمار موارد کنارگذاشته)، روند پذیرش و تحویل و مقایسه با بازه هم‌طول قبل؛ هر شاخص و ستون به فهرست همان رکوردها متصل است و جدول جایگزین دارد.
- فیلترها در نشانی صفحه می‌مانند (بازگشت از پرونده)؛ خروجی Excel همه ردیف‌های فیلترشده با عنوان، زمان، بازه و فیلتر؛ چاپ سیاه‌وسفید.
- فهرست پرونده‌ها: فیلتر علت مانع و «عبور از مهلت رسمی»، «عبور از پیش‌بینی» و «بدون موعد». داشبورد «پرونده فعال» را درست می‌نامد. تعریف‌ها: `docs/REPORTS_FA.md`.

## [Unreleased] — branch `feature/vehicle-excel-import`

- ورود خودروهای موجود از اکسل (مدیر خدمات): خواندن برگه «لیست خودروها» با تشخیص خودکار سربرگ، پیش‌نمایش فارسی (جدید، به‌روزرسانی، بدون تغییر، تکراری، ناقص، نیازمند بررسی، خطا)، ثبت ردیف‌به‌ردیف، گزارش Excel نتیجه با شماره پرونده صادرشده و فایل نمونه ساختگی.
- تطبیق فقط با شماره پرونده، VIN کامل، شماره کارت پذیرش و شاسی ثبت‌شده؛ خانه خالی مقدار قبلی را پاک نمی‌کند؛ ورود دوباره پرونده یا وظیفه تکراری نمی‌سازد؛ تاریخ بدون ساعت فقط با تصمیم صریح و با نمایش «ساعت نامعلوم».
- پرونده: شماره کارت پذیرش و شاسی ثبت‌شده (قابل جست‌وجو) و «سابقه ورود از اکسل» با متن اصلی سلول‌ها. Migration افزایشی 0008.

## [Unreleased] — branch `fix/invitation-email-delivery`

- کارکنان: «بررسی اتصال ایمیل» (اتصال، TLS و احراز هویت فرستنده از همان سرور، بدون ارسال پیام) و نمایش علت شکست ارسال (اتصال مسدود، DNS، TLS، احراز هویت، رد گیرنده) زیر نام همکار؛ متن «ارسال شد» به «پذیرفته‌شده توسط سرور ایمیل» اصلاح شد.
- Migration افزایشی 0007 (`invitation_failure`)، اسکریپت `mail:check` و `deploy/preview/configure-smtp.sh` برای تنظیم خصوصی App Password روی سرور با بررسی پیش از فعال‌سازی و پشتیبان `.env`.

## [Unreleased] — staff email invitations

- Rename account administration to کارکنان. Owner enters name, email and roles, sends invitation email, sees activation/delivery state, and explicitly resends failed/expired invitations.
- Optional private-link invitation lets the owner onboard colleagues while email setup is unavailable; the UI explicitly states that no email was sent.
- Preserve personal password and TOTP enrollment; no SMTP link/token in email-endpoint responses or audit. Add private SMTP configuration and additive delivery-state migration 0006.
- Record owner-approved integration of platform PRs #16–#21 and #23 into main; legacy prototype work remains separate.

## [Unreleased] — repository documentation and preservation (2026-11-01)

- Reconcile bilingual setup guides with the current TypeScript platform, hosted personal login and owner-reported successful sign-in.
- Add API reference with controller route drift checks, gradual prototype migration plan, refreshed branch/CI audit and GitHub tracking guide.
- Preserve discovered local prototype tooling/docs separately; no runtime feature, schema or deployment changes.

## [Unreleased] — personal Preview authentication (2026-11-01)

- Email identifier and personal password followed by Google Authenticator, with private invitation links, QR enrollment and administrator invitation management. No SMTP or Google account configuration is needed.
- Encrypted TOTP seeds, one-use challenges and codes, rate limits, account lockout, tenant isolation and audited activation. Personal mode rejects shared-gate and password-only sessions.
- Protect personal Preview accounts from demo reset. Automatic password/factor recovery is not yet available; see docs/PERSONAL_AUTH_FA.md.
## [Unreleased] — branch `feature/qc-delivery`

### Added
- Quality control and delivery (issue #12): QC checklist per round (10 items; safety items cannot be skipped). A failed item needs a description and a unit, opens a corrective activity and returns the case to repair; a new round is required after any later change to the work.
- Technical close (supervisor/manager) only when all work is approved, no blocker is open, no draft or pending authorization remains, every approved replaced line has a part handed over to the unit and the latest QC passed. Labour without a matching approved activity is shown as a warning.
- Financial close (cashier/manager) as a separate gate: final assessment, known customer share, no pending finance proposal and the customer share received — or a service-manager decision to accept the remaining balance, with a reason. Settlement payments are recorded by the cashier with a receipt reference.
- Handover with recipient name and relation, time and the recipient's confirmation; needs both closes and archives the case (status closed, read-only). A close that no longer matches the case (reopened work, new share or estimate) must be repeated.
- Case page: "کنترل کیفیت و تحویل" panel with QC history and what still blocks each step; corrective activities are marked; history labels for the new events.

### Changed
- The stage selector can no longer set "آماده تحویل" or "تحویل‌شده"; they come from the technical close and the handover. Moving a closed case back into the workflow cancels its technical close.
- Demo case 5 shows a failed QC round, the corrective work, a passed round and the technical close; settlement and handover are left to try.

## [Unreleased] — isolated Preview deployment (2026-11-01)

- Preview updated with QC, corrective work, technical/financial close and handover (merge of PR #20 into the Preview branch only); demo data recreated.

- Dedicated ArvanCloud Preview with trusted HTTPS, password gate and synthetic data is available; see docs/PREVIEW_DEPLOYMENT_20261101.md. Source and Production remain unchanged.
- Fix Arvan SSH configuration precedence and socket-activated service startup; explicitly install Buildx, normalize application file umask, and keep generated credentials out of command logs.

## [Unreleased] — branch `feature/parts-finance`

### Added
- Parts lifecycle (issue #9): needs from authorized assessment lines, manual entry or .xlsx import with preview (synthetic sample download); stock check, reservation, order with supplier/price/ETA (first ETA kept), receipt with inspection (wrong/defective → re-order), handover to the repair unit, cancel — each with its time.
- Ordering requires the assessment line's authorization; a price above the approved price needs the assessor's approval reference.
- "Part not arrived" blockers can name the part; its handover resolves them and returns the activity to work.
- Financial gate (issue #10): payer shares, advance proposed by the expert, approved by the service manager (never their own proposal), receipt confirmed by the cashier; exceptions with a spending limit. Only part purchases are held; a supplement raising the estimate needs a new approval.
- Dashboard and case-list filters: waiting for authorization, overdue parts, parts not ordered, pending finance decision/receipt.
- Local Preview: `pnpm preview` (production build, persistent synthetic data, http://localhost:3100).

### Changed
- Login rate limit can be set with `LOGIN_RATE_LIMIT` (default unchanged: 10 per minute); the E2E suite raises it.

## [Unreleased] — branch `feature/assessment-parts`

### Added
- Versioned assessments and supplements (issue #8): initial assessment and supplements after hidden damage with replace/repair lines, part numbers, quantities, prices and labour per department, evidence references; the approved version is kept unchanged when a supplement is finalized.
- Authorization recording: source, method, official reference (required for golden card and insurer), partial approval per line; an «مجوز» blocker holds the case (and delivery) until the decision is recorded.
- A supplement can move the internal delivery forecast; the official deadline is untouched. Supplements that raise the cost are flagged for financial re-approval.
- Demo case 1 shows an approved assessment and a supplement waiting for authorization.
- History shows assessment changes with amounts in Rials. On phones the assessment lines are shown as stacked cards.

## [0.1.0] — Unreleased (branch `feature/accident-mvp`)

### Added
- Manage platform monorepo alongside the earlier prototype: `packages/shared`, `apps/api` (NestJS + Drizzle + PostgreSQL), `apps/web` (Next.js, Persian RTL).
- Login with roles (accident expert, accident supervisor, service manager, parts, cashier, QC, system admin); permissions enforced by the API; account lockout and rate limiting.
- Accident cases: vehicle and owner, coverage type and references, responsible person, official deadline vs forecast vs actual delivery, legacy entry with past admission, "needs completion" flags, search by plate/VIN/name/phone/number.
- Repair activities per department with dependencies, weights, planned/actual times; start, complete, supervisor approval, reopen with reason.
- Blockers with occurrence, recording, follow-up and resolution times; activity unblocks when its last blocker is resolved.
- Delivery gate (all activities approved, no open blockers).
- Manager dashboard: stage pipeline, attention list, blocker reasons, department load — each linked to the matching filtered list.
- Append-only audit trail (database trigger), change-log outbox, idempotency keys, optimistic locking.
- Synthetic demo dealership, auto-seeded in development/preview; reset script that removes only synthetic tenants.
- Iranian licence-plate display, Jalali date/time input in Tehran time, self-hosted Vazirmatn.
- Tests: shared unit tests, API integration tests, Playwright E2E (desktop + phone); CI with PostgreSQL 16, Docker compose smoke test, dependency audit and secret scan.
- Documentation set (architecture, database, workflows, offline sync design, security, deployment, backup/restore, roadmap, user guide, IT server checklist, GitHub audit).

### Security
- `drizzle-orm` raised to 0.45.x and `multer` overridden to ≥ 2.5.0 to clear high-severity advisories reported by `pnpm audit`.


## Preview browser sign-in compatibility — 2026-11-01

- Replace the native browser password challenge with an accessible Persian sign-in form and a signed secure cookie, preserving the Preview password and isolation. Actual in-app browser login to the manager dashboard was verified.

## [Unreleased] — reports stage 3b

- Persian A4 PDF reports with embedded Vazirmatn, dealership header, row-limit disclosure, repeated table header, multi-page long rows and page numbers.
- Parts discrepancy queue in warehouse and manager reports: deduplicated findings, assignee, reasoned outcomes, optimistic locking and tenant isolation. Detection, condition changes and review actions retain transactional audit/change history.
- CI exports the images it smoke-tests for an owner-approved Preview installation; CI does not deploy or connect to the server.
