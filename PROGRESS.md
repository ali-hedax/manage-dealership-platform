## 2026-11-14 - PR #90 resumed rollout: stopped at server GitHub fetch

- Continued from report commit `60179a7d2a43f88711d8470e777da9d2b2df7935` on `docs/release-20261114c` ([PR #89](https://github.com/ali-hedax/manage-dealership-platform/pull/89)). Read current AGENTS, PROGRESS and product specification section 3. Owner authorized Node validation in the existing gate container, only the pinned gate file, and only gate recreation.
- **Result: stopped before installation.** Server `git fetch origin main` exited **128** after **135056 ms**, unable to connect to GitHub port 443. Per the explicit stop-on-failure boundary, no candidate extraction, candidate `node --check`, candidate grep, target checkout or service recreation followed. Previous live grep count was 0; it was not rerun in this attempt. The host Node limitation has an authorized container-based solution, but this attempt did not reach that step.
- Final read-only baseline at **2026-11-14T13:01:32Z**: user `manage`, canonical checkout `/opt/manage`; worktree clean; live gate blob and preserved backup both `8beef78f397fa6e873e96276276df9f86b13abec`; `cmp` passed. Backup `/home/manage/incoming/gate.mjs.before-20261114` was not overwritten. Intended gate MAIN_SHA remains `2d77271c62489e171acca06e966e8994641e5def`.
- **Application provenance confirmed independently of health:** `/home/manage/incoming/deploy-20261114c/images/preview-image-source.txt` records `1ba8d708d939a0d2f36672e10143d48b5fcfc0ed`; adjacent `preview-image-ids.txt` exactly lists both running image IDs below. Both images also carry tags with that full SHA. OCI revision labels are absent. This is the existing CI artifact release evidence, not a health-reported commit.

| Service | Container ID (before = after) | Image ID (before = after) |
| --- | --- | --- |
| API | `b0c19ef4dd8b2fe99d9f6981d2bc780b00001ace16ae9eaf0b3f7fc19d31c55a` | `sha256:dab2a54296e51a6fcd9674ef4354995faa716b491d997fa639af00b357c6a909` |
| web | `ffd2bd564c93550ff4fe3e139fbb489c11c4d54a362de1157f4d7d53bf493cb8` | `sha256:24e4d5eba52dbfe51635fe32f9beee3767d799362f26149ef70719476a514a1d` |

- Gate remained `978924ac0a95a9700ae6d385e6486750a99d8ce75d7a6d4970a97595b73d918a`, **healthy**, StartedAt **2026-11-05T09:07:35.046952829Z**. API/web also stayed healthy. No restart occurred; no new-start log inspection applies. Historical logs were not read.
- Fresh sessionless/cookieless GETs without following redirects: `/login` **200**; `/` **302**, Location `/login`; `/api/v1/dashboard` **401**, JSON `error: LOGIN_REQUIRED`. Internal documented API health via existing gate container: **200**, `status: ok`, `db: ok`, **commit: null**. These remain baseline tests, not proof of PIN access after rollout.
- Rollback **not needed**: live file, containers and images stayed unchanged. No account report ran (installation success is its prerequisite): active staff without PIN **not checked**; locked staff **not checked**. No account login, creation, PIN/hash/password/name/email/phone read, or mutation. No Source, DNS, Caddy, firewall, .env, API/web image or migration changes.
- Documentation checks: `node scripts/check-docs.mjs` passed (70 Markdown files, 176 API routes), and `git diff --check` passed. CI for the new report must be checked after push.
- **Exact next step:** once server-to-GitHub connectivity is available, rerun the authorized fetch with a bounded timeout; preserve and verify the same backup; validate a temporary pinned candidate using `docker exec -i "$gate_id" node --check - < "$candidate"` and grep count 1; recheck artifact/image correspondence; install only gate and complete the requested checks and tenant-scoped READ ONLY staff report. No connection configuration changes were attempted.

## 2026-11-14 - PR #90 gate rollout stopped before installation

- Owner authorized only the gate file from MAIN_SHA `2d77271c62489e171acca06e966e8994641e5def`, for release reporting in [PR #89](https://github.com/ali-hedax/manage-dealership-platform/pull/89). Documentation branch began at `74a1ee01c0998995ec8ea276a2e68ff7817d373b`.
- Read-only checks at **2026-11-14T12:54:32Z** confirmed SSH user `manage`, canonical checkout `/opt/manage`, HEAD `1ba8d708d939a0d2f36672e10143d48b5fcfc0ed`, clean worktree, and gate file equal to HEAD (blob `8beef78f397fa6e873e96276276df9f86b13abec`).
- Created previously absent backup `/home/manage/incoming/gate.mjs.before-20261114` without overwrite; `cmp` passed. Fetched origin/main and verified the target gate blob exists. No checkout of the target file occurred.
- **Stop condition:** `command -v node` exited 1: Node is unavailable on the host. Per the owner's stop-on-failure instruction, installation stopped before changing the live file. Target `node --check` was **not run**; the existing live gate's PIN/TOTP-array `grep -Ec` count is **0**. It does not contain the fix.
- Existing gate: **healthy**, StartedAt **2026-11-05T09:07:35.046952829Z**. API, web and DB also healthy. Gate was not recreated; no new-start logs exist to inspect, and historical logs were not inspected. No build, image pull, migration, API/web restart, connection/DNS/Caddy/firewall changes, or credential reads.
- Pre-install HTTPS GETs, no session/cookies and no redirects followed: `/login` **200**; `/` **302**, Location `/login`; `/api/v1/dashboard` **401**, JSON `error: LOGIN_REQUIRED`. These are baseline checks, not evidence of a successful PIN rollout.
- Public `/api/v1/health` is gated (**401**). Internal documented `/api/v1/health`, fetched using existing gate container Node: **200**, `status: ok`, `db: ok`, **commit: null**. Expected `1ba8d70` prefix could not be verified from health; Git HEAD matches it but is a different source of evidence.
- Rollback: not required; live file remains byte-identical to its backup and no service was recreated. Active staff without PIN and currently locked staff: **not checked**, because account reporting was conditional on successful installation/validation. No login or account mutation occurred.
- Reporting limitations: initial local sandbox Git/network access failed; authorized elevated fetch/PR read succeeded. Two read-only SSH reporting scripts printed their results then exited nonzero because PowerShell appended CR to the final here-document/command; a repeat independently confirmed dashboard LOGIN_REQUIRED and internal health. No writes occurred in these probes.
- Documentation validation: `node scripts/check-docs.mjs` passed (70 Markdown files, 176 API routes); `git diff --check` passed. The first sandboxed validator attempt failed with Git subprocess EPERM; elevated validation passed.
- Exact next step: resume only after addressing the stop condition in the rollout procedure: use the existing Node 22 gate container for syntax validation (no host installation), then install only the pinned gate file, recreate only gate, perform all checks and the scoped READ ONLY account report. Resolve health's null commit explicitly. Backup above must be verified and reused, never overwritten.

## 2026-11-14 — ورود کارکنان فقط با نام کاربری و پین — PR #88 ادغام و روی Production منتشر شد (`1ba8d70`)

- شاخهٔ `fix/pin-only-staff-login` از main در 9f10c4c. گزارش مالک: هیچ کارمندی با رمز ۴ رقمی وارد نمی‌شد و فقط مالک و مدیر سیستم وارد می‌شدند.
- علت: ورود PIN روی هر دستگاه ثبت‌نشده «رمز ثبت دستگاه» هم می‌خواست. حساب بدون این رمز (۱۱ تکنسین) هرگز وارد نمی‌شد و بقیه آن را نمی‌دانستند. این شرط با سند محصول (بخش ۳: «پین ۴ رقمی، بدون دومرحله‌ای») در تضاد بود و حذف شد.
- بررسی زنده فقط خواندنی با نام ساختگی: سرویس ورود سالم بود و فرم ورود فیلد رمز ثبت دستگاه را می‌خواست. هیچ رمز واقعی وارد نشد.
- آزمون: technician-pin، staff-usernames، staff-recovery و staff-invitations 29/29؛ typecheck و lint سبز؛ Playwright در CI.
- منتشر شد؛ بخش «وضعیت فعلی» را ببینید.

## 2026-11-14 — کد EXP برای کارشناس‌های موجود — PR #87 ادغام و همراه #88 منتشر شد (`1ba8d70`)

- شاخهٔ `feature/expert-code-existing-staff` از main در a170340 (PR #85 ادغام و روی Production). درخواست مالک: همهٔ کارشناس‌ها (کارشناس تصادفات، مسئول قطعات، مدیر خدمات) با EXP + دو رقم انتخابی او؛ تکنسین‌ها TECH + کد جایگاه.
- تا #85 کد EXP فقط هنگام ساخت حساب تازه داده می‌شد و حساب‌های موجود راهی برای گرفتن آن نداشتند. اکنون دکمهٔ «تعیین/تغییر کد EXP» در کارکنان؛ PIN، دستگاه و نشست حفظ می‌شود. راهنما: [شناسه کارکنان](docs/STAFF_IDENTIFIERS_FA.md).
- آزمون: staff-usernames 4/4، staff-recovery/invitations و احراز هویت 30/30، typecheck و lint سبز.
- منتشر شد؛ بخش «وضعیت فعلی» را ببینید.

## 2026-11-14 — ورود کارکنان و شناسه جایگاه — ادغام شد (PR #85) و روی Production منتشر شد (`a170340`)

- شاخه fix/staff-login-identifiers-20261114 از main در 43cdadc؛ آخرین commit برنامه 3ae3180. TECH از کد جایگاه؛ EXP از دو رقم انتخابی مالک. پذیرش فاصله نمایشی و ارقام فارسی در ورود؛ حساب‌های قدیمی و مالک محفوظ.
- رفع بارگذاری بی‌پایان نشست 401، پیام/تلاش مجدد خطای سرویس، پایان درخواست PIN معطل پس از ۲۰ ثانیه و بارگذاری کامل پس از ورود برای پاک‌شدن cache هویت قبلی.
- اسکریپت پیش‌نمایش/تبدیل تراکنشی شناسه‌های تکنسین با کنترل مقصد و نسخه، بدون بازنشانی رمز یا قطع نشست. هنوز اجرا روی داده واقعی ندارد. راهنما: [شناسه کارکنان](docs/STAFF_IDENTIFIERS_FA.md).
- محلی: shared 53/53، API مرتبط 11/11 + 3/3، مرورگر ورود/کارکنان 9/9، build/typecheck/lint و بررسی مستندات موفق. وضعیت CI سر شاخه در [PR #85](https://github.com/ali-hedax/manage-dealership-platform/pull/85/checks)؛ آزمون هم‌زمانی جابه‌جایی نام روی PostgreSQL واقعی به CI اضافه شده است.
- بررسی زنده فقط خواندنی: سرویس‌ها سالم، حساب موردنظر فعال و دارای PIN/رمز دستگاه و ورودهای موفق؛ بدون خواندن/درخواست رمز. ۱۱ تکنسین فاقد رمز ثبت دستگاه‌اند و تکمیل خصوصی از مسیر مالک باقی است.
- قدم بعد: CI نهایی و بازبینی؛ برای ادغام/انتشار و تبدیل واقعی، اجرای روال پشتیبان/بازیابی و اخذ مجوز صریح مالک طبق AGENTS.md. (وضعیت پیش از ادغام؛ اکنون منتشر شده — بخش «وضعیت فعلی» را ببینید.)

# PROGRESS — Manage by HEDAX

منبع واحد حقیقت: [سند جامع محصول](docs/PRODUCT_SPEC_FA.md) (تأیید مالک، ۱۹ آبان ۱۴۰۵). تاریخچهٔ قبلی: [بایگانی تا PR #74](docs/archive/PROGRESS_2026-11.md).

## وضعیت فعلی — Production روی `1ba8d70` — ۲۳ آبان ۱۴۰۵ (2026-11-14)

- **Production روی `1ba8d708d939a0d2f36672e10143d48b5fcfc0ed`** (ادغام PR #88، شامل #87) از 08:52 UTC. بدون migration (همان ۲۴). CI `main`: run 43575370737، ۶ از ۶ سبز. تصویرهای در حال اجرا همان artifact CI هستند. #87 جداگانه نصب نشد و با همین نسخه منتشر شد.
- ورود کارکنان فقط با نام کاربری و پین ۴ رقمی. نام ساختگی `TECH 99` اکنون `INVALID_CREDENTIALS` می‌گیرد (پیش از نصب `DEVICE_NOT_REGISTERED`).
- پشتیبان‌ها: `20261114T084941Z` (تمرین) و `20261114T085127Z` (نهایی). هر دو بازیابی شدند و اثرانگشت ۵۳ جدول برابر بود. تصویرهای بازگشت: `manage-{api,web}:rollback-deploy-20261114c` (همان a170340).
- **تبدیل نام کاربری تکنسین‌ها اعمال شد** (08:55 UTC، با تأیید مالک): ۱۱ حساب به TECH + کد جایگاه تغییر کرد و ۱۱ رویداد `user.username_aligned` ثبت شد. شناسه، PIN، دستگاه و نشست‌ها دست نخوردند. تمرین روی پشتیبان `20261114T085348Z`؛ پشتیبان پیش از اعمال: `20261114T085508Z`. نقشهٔ قبل/بعد فقط روی سرور است: `/home/manage/incoming/staff-usernames-20261114/`.
- حساب‌ها: هیچ حسابی قفل نیست. از ۱۴ حساب فعال غیرمالک فقط یک مدیر سیستم (ورود با ایمیل) PIN ندارد. حساب مسئول قطعات (`EXP 00`) غیرفعال است (مالک ساعت 07:47 UTC غیرفعالش کرد).
- **قدم بعدی:** اعلام نام‌های تازهٔ TECH به تکنسین‌ها؛ فعال کردن دوبارهٔ حساب مسئول قطعات و، در صورت تمایل، «تعیین کد EXP» (مثلاً ۲۰) توسط مالک.

## وضعیت قبلی — Production روی `a170340` — ۲۳ آبان ۱۴۰۵ (2026-11-14)

- **Production روی `a170340b3c1c62098346406a6d9945b688b18a60`** (ادغام PR #85) از 07:29 UTC. بدون migration (همان ۲۴). CI `main`: run 43567383358، ۶ از ۶ سبز. تصویرهای در حال اجرا همان artifact CI هستند.
- پشتیبان‌ها: `20261114T072706Z` (تمرین؛ بازیابی و اثرانگشت ۵۳ جدول برابر)، `20261114T072857Z` (نهایی با سرویس‌های متوقف؛ بازیابی و برابر). تصویرهای بازگشت: `manage-{api,web}:rollback-deploy-20261114` (همان 9e14c91). جزئیات در [TEST_REPORT](docs/TEST_REPORT.md).
- پیش‌نمایش تبدیل شناسهٔ تکنسین‌ها: ۱۱ تغییر، بدون مورد مبهم، **اعمال نشده** (`applied: false`). فایل خصوصی روی سرور: `/home/manage/incoming/staff-usernames-20261114/`.
- (پس از آن #87 و #88 منتشر شدند و تبدیل شناسه‌ها اعمال شد؛ «وضعیت فعلی» را ببینید.)

## وضعیت قبلی — Production روی `9e14c91` — ۲۱ آبان ۱۴۰۵ (2026-11-12)

- **Production روی `9e14c91`** از 11:23 UTC. شامل کارهای ۲ (#80) و ۳ (#81، migration 0023؛ تعداد migrationها ۲۴)، اسکریپت کار ۱ (#82)، ورود ظریف‌تر (#79) و پایداری آزمون ورود (#83). CI `main`: run 43200965594، ۶ از ۶ سبز. تصویرهای در حال اجرا همان artifact CI هستند.
- کار ۱ پیش از این استقرار، ساعت 09:50 UTC، روی Production اجرا شد: ۲۱ پرونده به «پذیرش» برگشت.
- پشتیبان‌ها: `20261112T094844Z` (پیش از بازنشانی)، `20261112T112137Z` (پیش از استقرار). تصویرهای بازگشت: `manage-{api,web}:rollback-deploy-20261112b`. پایگاه‌های تمرین نگه داشته شده‌اند (حذف فقط با تأیید مالک).
- **قدم بعدی:** پیگیری بازخورد کارکنان با شروع کار واقعی؛ اولین گزارش امداد ویژه و اولین الحاقیهٔ واقعی را برای اتصال‌ها و «رد شده/جایگزین» بازبینی کنید.

## کار ۱: بازنشانی مراحل آزمایشی — ۲۱ آبان ۱۴۰۵ — روی Production اجرا شد

- شاخهٔ `feature/reset-test-stages`. طبقه‌بندی «نگه دار / پاک کن / بازنشانی» با پیشنهادهای پیام قبلی تأیید شد (۲۱ آبان). امداد ویژه فقط از پرونده جدا می‌شود و اعلان‌ها خوانده‌شده علامت می‌خورند.
- تمرین روی نسخهٔ بازیابی‌شدهٔ پشتیبان `20261112T093235Z` در پایگاه `manage_reset_rehearsal_20261112` (نگه داشته شده). نتیجه در [TEST_REPORT](docs/TEST_REPORT.md) و در `/home/manage/incoming/reset-stages-20261112`.
- **اجرا روی Production** با تأیید مالک و بدون پرونده‌ٔ مستثنا: ۲۱ پرونده به «پذیرش» برگشت، با همان شمارش‌های تمرین. پشتیبان پیش از اجرا: `20261112T094844Z`. جزئیات در [TEST_REPORT](docs/TEST_REPORT.md).
- **قدم بعدی:** استقرار `main` (کارهای ۲ و ۳، migration 0023) با روال پشتیبان، تمرین و بازگشت. PRهای #80، #81 و #83 (پایداری آزمون ورود) ادغام شده‌اند.
## کار ۳: الحاقیه، قلم ردشده و جایگزین — ۲۱ آبان ۱۴۰۵ — PR #81 ادغام شد

- شاخهٔ `feature/assessment-rejections` از `main` (`5d12659`)، با migration افزایشی 0023. قالب واقعی ستون «وضعیت» از قبل در `assessment-sheet.ts` بود، پس نمونهٔ تازه از مالک لازم نشد.
- آزمون‌ها سبز ([TEST_REPORT](docs/TEST_REPORT.md)). PR کار ۲ (#80) و این PR هر دو بالای PROGRESS/CHANGELOG/TEST_REPORT نوشته‌اند؛ هنگام ادغام دومی، تداخل متنی فقط در همین سه سند است.
- **قدم بعدی:** کار ۱ (اسکریپت پاک‌سازی با dry-run) و ارسال جدول «نگه دار / پاک کن / بازنشانی» برای تأیید مالک، پیش از هر حذف.
## کار ۲: وضعیت امداد ویژه جلوی قطعه — ۲۱ آبان ۱۴۰۵ — PR #80 ادغام شد

- شاخهٔ `feature/emdad-auto-status` از `main` (`5d12659`). اتصال با شمارهٔ درخواست + کد فنی/شاسی، صف بررسی، تلاش دوباره، تاریخچه در فهرست قطعات. بدون migration.
- آزمون‌ها سبز ([TEST_REPORT](docs/TEST_REPORT.md)). **قدم بعدی:** کار ۳ (`feature/assessment-rejections`)، سپس کار ۱. ادغام و استقرار فقط با تأیید مالک.

## ورود ظریف‌تر — ۲۱ آبان ۱۴۰۵ (2026-11-12) — در انتظار بازبینی و ادغام مالک

- شاخهٔ `feature/login-refined-redesign` از `main`؛ فقط `apps/web/app/login/page.tsx` و بخش ورود در `manage-ui.css` (و تصویرها در `docs/design/login-refined`). API و Production دست نخورده‌اند.
- آزمون‌ها: تایپ‌چک و build سبز؛ Playwright ورود و موبایل ۵ از ۵ سبز ([TEST_REPORT](docs/TEST_REPORT.md)). CI روی PR باید اجرا شود.
- **قدم بعدی:** مالک تصویر را در PR ببیند؛ در صورت تأیید ادغام و استقرار طبق [RELEASE_RUNBOOK_RC1_FA](docs/RELEASE_RUNBOOK_RC1_FA.md). بعد از آن، همین مقیاس اندازه (فونت ۱۳–۱۴، کنترل ۳۶–۴۰، آیکون ۱۶) برای صفحه‌های داخلی و موبایل جداگانه طراحی شود.

## وضعیت فعلی — انتشار در Production — ۲۱ آبان ۱۴۰۵ (2026-11-12)

- **Production روی `462c122`** (ادغام PR #77 با merge commit؛ همهٔ commitهای نادیا حفظ شده) با دادهٔ واقعی، از 2026-11-12 06:32 UTC. نشانی: https://managebyhedax.ir
- CI: سر PR `fbb95d3` در run 43162309223 و commit ادغام‌شده در run 43163764028 — هر دو ۶ از ۶ سبز. تصویرهای Docker همان artifact `preview-images-462c122…` هستند (شناسهٔ تصویرهای در حال اجرا = CI).
- migrationها ۲۰ ← ۲۳؛ تمرین کامل روی نسخهٔ بازیابی‌شدهٔ پشتیبان و همان نتیجه در Production: ۴ حساب با نقش قدیمی نگاشت شد (همه از قبل غیرفعال؛ هیچ حسابی با migration غیرفعال نشد)، الگوی نقش یک نمایندگی به پیش‌فرض کد برگشت، اثرانگشت دادهٔ کسب‌وکار پیش و پس یکسان.
- پشتیبان پیش از نصب: `/home/manage/backups/operational/20261112T063104Z`؛ تصویرهای برگشت: `manage-{api,web}:rollback-rebuild-20261112`؛ پایگاه تمرین `manage_rebuild_rehearsal_20261112` برای بررسی نگه داشته شده (حذف فقط با تأیید مالک).
- بررسی زنده: سلامت API و پایگاه، `/login` ۲۰۰، APIهای خصوصی بدون ورود ۴۰۱، صفحهٔ ورود جدید در Chrome در ۱۴۴۰ و ۳۹۰ پیکسل بدون خطا. جزئیات در [TEST_REPORT](docs/TEST_REPORT.md).
- **قدم بعدی:** پیگیری بازخورد کاربران واقعی روی ظاهر و نقش‌های جدید؛ اسکن HawkScan پس از انتشار (نیازمند کلید مالک)؛ تصمیم مالک دربارهٔ حذف پایگاه تمرین و پشتیبان‌های قدیمی.

## نسخهٔ نامزد انتشار (RC1) — ۲۰ آبان ۱۴۰۵ (تاریخچه؛ وضعیت فعلی بالا)

`main` تا PR #74 (`cc1d7e1`) است و Production روی همان نسخه با دادهٔ واقعی کار می‌کند. بسته‌های ۰ تا ۹ ساخته شده‌اند؛ **هیچ‌چیز در `main` ادغام یا روی سرور مستقر نشده است**. Source by HEDAX، DNS، فایروال و سرور دست نخورده‌اند.

### یک PR یکپارچه

- شاخهٔ یکپارچه: `integration/spec-rebuild-rc1` در fork `nadiafallah/manage-dealership-platform` (همهٔ commitهای بسته‌ها حفظ شده؛ همان `feature/p9-visual-direction`).
- PR را باید روی مخزن مالک باز کرد: `https://github.com/ali-hedax/manage-dealership-platform/compare/main...nadiafallah:manage-dealership-platform:integration/spec-rebuild-rc1` — از این محیط دسترسی ساخت PR روی مخزن مالک نبود (پایین).
- commitها به ترتیب: بستهٔ ۰ سند و ماکاپ‌ها ← ۱ شش نقش (migration 0020) ← ۲ هشدار هزینه ← ۳ و ۴ فهرست واحد قطعات و موجودی قابل‌استفاده (0021) ← ۵ مسیر تعمیر و کارتابل تکنسین ← ۶ لایهٔ نمایش ← ۷ اتاق کنترل و تذکر (0022) ← ۸ دادهٔ نمونه و آزمون‌ها ← ۹ ظاهر تأییدشدهٔ مالک.
- تصویرهای مرجع در برابر نسخهٔ واقعی، صفحه‌ها در ۱۴۴۰/۷۶۸/۳۹۰ و یک ویدیوی کوتاه: [docs/design/p9](docs/design/p9/). راهنمای استقرار: [RELEASE_RUNBOOK_RC1_FA](docs/RELEASE_RUNBOOK_RC1_FA.md).

### تصمیم‌های بستهٔ ۹ (جایی که سند و تصویرها ساکت بودند)

- تصویرها فقط مرجع ظاهرند: متن، عدد، برچسب نقش و ترتیب مرحله‌های داخلشان کپی نشد؛ مرحله‌ها همان پنج مرحلهٔ سند‌اند.
- نقشهٔ کارگاه با SVG از جایگاه‌های واقعی ساخته می‌شود (نه عکس و نه WebGL) تا روی رایانه و گوشی معمولی سبک بماند؛ همهٔ نوشته‌ها HTML روی نقشه‌اند. در گوشی، نقشه داخل جعبهٔ خودش افقی می‌لغزد و فهرست خودروهای جایگاه زیر آن است.
- پس‌زمینهٔ صفحهٔ ورود همان نقشهٔ کارگاه است (محو، بی‌داده و بی‌نوشته)؛ عکس یا تصویر ساختهٔ دیگری به برنامه اضافه نشد.
- کارت پوشه فقط یک اقدام دارد: «باز کردن پرونده». در قدم بعدیِ دیگران، دکمهٔ «تذکر به …» تذکر را به تکنسین همان قدم، مسئول قطعات یا کارشناس پرونده می‌فرستد.
- مقصدهای منوی کناری (قطعات، تنظیمات، گزارش‌ها، پرونده‌ها) دکمهٔ «بازگشت» ندارند؛ زیرصفحه‌های تنظیمات «بازگشت به تنظیمات» دارند.
- عنوان میز مدیر سیستم «میز پشتیبانی مدیر سیستم» شد.

### وضعیت آزمون‌ها

جزئیات و commit آزموده‌شده (`9f79eb3`) در [TEST_REPORT](docs/TEST_REPORT.md). سبز در این محیط: ۵۲/۵۲ آزمون واحد `packages/shared`؛ TypeScript وب و همهٔ specهای Playwright بدون خطا (با انواع واقعی Playwright و جانشین‌های نوع‌دار React/SWR/Next)؛ API بدون خطای تازه؛ migrationهای ۰۰۰۰ تا ۰۰۲۲ و downها روی PostgreSQL 16؛ بررسی مستندات؛ ۴۸ بررسی چیدمان در ۳۶۰ تا ۱۴۴۰ پیکسل بدون اسکرول افقی، کنتراست، صفحه‌کلید، کاهش حرکت و چاپ روی صفحه‌های واقعی با دادهٔ ساختگی.
اجرا نشده (چون `pnpm install` در این محیط بسته است): lint، typecheck کامل، Jest API، `next build`، Playwright روی برنامهٔ واقعی، آزمون دود Docker و HawkScan. CI هم اجرا نشده. **تا CI روی commit ادغام‌شده سبز نشود، نسخه آمادهٔ انتشار نیست.**

### چیزهایی که به مالک نیاز دارد

1. باز کردن PR یکپارچه از پیوند بالا (یا افزودن `nadiafallah` به‌عنوان collaborator تا PR از این‌جا باز شود). Actions روی fork خاموش است و روشن کردنش تصمیم صاحب fork است؛ CI با PR روی مخزن مالک اجرا می‌شود.
2. بازبینی تصویرهای Playwright و [مقایسه‌ها](docs/design/p9/) و فهرست حساب‌هایی که migration 0020 غیرفعال می‌کند (کوئری در راهنمای استقرار).
3. اسکن امنیتی HawkScan با کلید API روی Preview پس از ادغام.

## گزارش بسته‌های ۰ تا ۸ (پیش از بستهٔ ۹)

`main` تا PR #74 است و Production روی نسخهٔ منتشرشدهٔ قبلی با دادهٔ واقعی کار می‌کند. همهٔ بسته‌های ۰ تا ۸ ساخته شده‌اند، روی شاخه‌های جدا هستند و **هیچ‌چیز در `main` ادغام یا روی سرور مستقر نشده است**. Source by HEDAX، DNS و سرور دست نخورده‌اند.

### PRها به ترتیب ادغام

شاخه‌ها در fork `nadiafallah/manage-dealership-platform` هستند (دسترسی push به مخزن علی نبود). هر شاخه روی شاخهٔ قبلی ساخته شده؛ پس PR هر بسته کارهای بسته‌های قبلی را هم نشان می‌دهد و بعد از ادغام قبلی خودبه‌خود کوچک می‌شود. به همین ترتیب ادغام شوند:

| ترتیب | بسته | شاخه | migration |
|---|---|---|---|
| ۱ | ۰ — سند، ماکاپ‌ها، CLAUDE.md، مرتب‌سازی | `feature/p0-spec-housekeeping` | — |
| ۲ | ۱ — شش نقش و ورود | `feature/p1-six-roles` | 0020 (برگشت‌پذیر) |
| ۳ | ۲ — هشدار هزینه به‌جای پیش‌پرداخت | `feature/p2-advance-alerts` | — |
| ۴ | ۳ و ۴ — فهرست واحد قطعات، ماشین وضعیت، موجودی قابل‌استفاده | `feature/p3-unified-parts` | 0021 |
| ۵ | ۵ — مسیر تعمیر و کارتابل تکنسین | `feature/p5-repair-plan` | — |
| ۶ | ۶ — لایهٔ نمایش جدید | `feature/p6-paper-ui` | — |
| ۷ | ۷ — اتاق کنترل، جدول هشدارها، تذکر | `feature/p7-control-room` | 0022 |
| ۸ | ۸ — دادهٔ نمونه، آزمون‌ها، مستندات و همین گزارش | `feature/p8-quality-delivery` | — |

پیوند ساخت PR هر شاخه: `https://github.com/ali-hedax/manage-dealership-platform/compare/main...nadiafallah:manage-dealership-platform:<شاخه>`

### تصمیم‌های گرفته‌شده (جایی که سند ساکت بود)

- نقش هدف migration نقش‌ها `accident_expert` است؛ حساب‌هایی که فقط «صندوق» بودند حفظ و غیرفعال می‌شوند؛ الگوهای دسترسی به پیش‌فرض سند برمی‌گردند و استثناهای شخصی می‌مانند. مدیر سیستم به‌طور پیش‌فرض اجازهٔ دعوت دارد و مالک می‌تواند بگیرد.
- سقف «قطعهٔ گران» ۵۰۰٬۰۰۰٬۰۰۰ ریال، «امداد ویژه دیر شده» ۳ روز از ثبت درخواست؛ هر دو قابل تنظیم. مسیرهای مالی قبلی پاسخ 410 می‌دهند و سابقه فقط‌خواندنی است؛ بستن مالی به مانده وابسته نیست.
- وضعیت قطعه ذخیره نمی‌شود، از دادهٔ موجود مشتق می‌شود (migration دادهٔ قطعه لازم نشد). مسیر قدیمی `/parts/:id/actions` برای سازگاری مانده. خرید بازار با مجوز پرداخت‌کننده قفل نمی‌شود. رزرو کل تعداد است. ضدتکرار فقط با قلم تعیین‌تکلیف‌نشده یکی می‌شود. صفحه‌های قدیمی موجودی و امداد ابزار پشتیبانی‌اند. «انعکاس» دستی حذف و با تحویل خودرو خودکار شد؛ لغو پرونده خودکار انعکاس نمی‌دهد.
- قدم‌های اول مسیر تعمیر پس از کارهای باز فعلی همان خودرو شروع می‌شوند؛ اجرت فقط برای قدمی که نفرش معلوم است و فقط با مجوز `wage.manage`.
- «قدم بعدی» با قاعدهٔ ثابت از داده ساخته می‌شود (بدون هوش مصنوعی). اولویت: قدم تمام‌شدهٔ منتظر تأیید ← «قطعه ندارم» بی‌پاسخ ← مانع ← کارشناسی ← امداد دیرشده ← قطعهٔ تعیین‌تکلیف‌نشده ← قطعهٔ آماده ← برنامه.
- پوشهٔ پرونده بر اساس نقش و مرحله باز می‌شود (مسئول قطعات: قطعات؛ کارشناس بدون برنامه در پذیرش/کارشناسی: کارشناسی؛ بقیه: کار امروز). پیوندهای `#case-…` تب درست را باز می‌کنند و چاپ همهٔ تب‌ها را چاپ می‌کند.
- بازهٔ اتاق کنترل: امروز، هفت روز اخیر، سی روز اخیر. میانگین هر مرحله از آخرین تغییر مرحله در ممیزی حساب می‌شود. زمان انتظار هشدار هزینه از آخرین قلم ثبت‌شده است.
- هشدار «گزارش امروز بارگذاری نشده» ساعت ۱۲ فقط برای گزارش امداد ویژه (تصمیم ۷ مالک)؛ یادآوری ساعت ۱۱ گزارش‌ها مثل قبل.
- دادهٔ نمونهٔ ۲۰ خودرویی پیش‌فرض است؛ مجموعهٔ Playwright با `DEMO_FLEET=false` همان پنج خودروی پایه را دارد تا آزمون‌های قبلی پایدار بمانند.

### وضعیت آزمون‌ها

جزئیات در [TEST_REPORT](docs/TEST_REPORT.md). سبز در این محیط: آزمون‌های واحد `packages/shared` (۵۲/۵۲، شامل ماشین وضعیت قطعه، مثال موجودی سند، مجوز شش نقش و مثال ۸ روزهٔ مسیر)، migrationهای ۰۰۰۰ تا ۰۰۲۲ روی PostgreSQL 16 با down، بررسی مستندات. اجرا نشده (چون `pnpm install` در این محیط بسته است): lint، typecheck کامل، Jest API، build و Playwright؛ CI هم اجرا نشده. **پیش از ادغام باید CI روی PRها سبز شود.**

### چیزهایی که به مالک نیاز دارد

1. دسترسی: افزودن نادیا (`nadiafallah`) به‌عنوان collaborator مخزن، یا باز کردن PRها از پیوندهای بالا.
2. CI: با باز شدن PR روی مخزن علی اجرا می‌شود؛ Actions روی fork خاموش است و روشن کردنش تصمیم صاحب fork است.
3. migration 0020 حساب‌های «فقط صندوق» را غیرفعال و نقش‌ها را تبدیل می‌کند؛ گزارش مقایسه در PR بستهٔ ۱ است و پیش از انتشار باید بازبینی شود.
4. اسکن امنیتی HawkScan اجرا نشد (کلید API و برنامهٔ در حال اجرا نبود).

### دستور دقیق استقرار برای مالک (اجرا نشده)

پس از ادغام هر هشت PR و سبز شدن هر شش بررسی CI روی commit نهایی `main` (طبق [DEPLOYMENT](docs/DEPLOYMENT.md) و [راهنمای انتشار](docs/RELEASE_RUNBOOK_20261107_FA.md)):

```bash
# روی سرور منیج، با کاربر manage
cd /opt/manage
bash deploy/operational/backup-operational.sh                 # پشتیبان + بازیابی آزمایشی طبق BACKUP_RESTORE
git fetch origin && git checkout <SHA نهایی main>
sha256sum -c preview-images.sha256                             # artifact «preview-images-<SHA>» همان اجرای CI؛ روی سرور build نشود
gunzip -c preview-images.tar.gz | docker load                  # manage-api و manage-web؛ تصاویر فعلی با برچسب rollback نگه داشته شوند
bash deploy/operational/operational-compose.sh run --rm api node dist/scripts/migrate.js   # 0020، 0021، 0022
bash deploy/operational/operational-compose.sh up -d api web
curl -fsS https://managebyhedax.ir/api/v1/health              # status: ok، db: ok، commit همان SHA
```

بازگشت: تصاویر rollback برگردانده شوند و چون migration دارد، پایگاه از پشتیبان پیش از نصب بازیابی شود (اسکریپت‌های `apps/api/src/db/down` فقط برای دادهٔ آزمایشی).

## گام بعدی

باز کردن PR یکپارچه روی مخزن مالک، سبز شدن هر شش بررسی CI روی آن، بازبینی و ادغام توسط مالک، سپس انتشار طبق [RELEASE_RUNBOOK_RC1_FA](docs/RELEASE_RUNBOOK_RC1_FA.md) با تأیید مالک.
