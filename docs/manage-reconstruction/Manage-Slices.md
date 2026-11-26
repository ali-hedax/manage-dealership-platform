# منیج — ۳۸ تکه‌ی کوچک ساخت

**روش:** هر بار یک تکه را بردار، «پیام ثابت» را بالای پرامپت همان تکه بگذار و به Codex یا Claude Code بده. وقتی گزارش داد، اینجا بیاور تا بررسی کنم. بعد تکه‌ی بعدی. ترتیب را رعایت کن؛ ستون «نیاز به» می‌گوید کدام تکه قبلش باید تمام شده باشد.

**قبل از اولین تکه:** پنج فایل md (Final Prompt، Checklist، Blueprint FA، Blueprint Prompt، VSCode Prompt) در `docs/manage-reconstruction/` پروژه باشند.

---

## پیام ثابت (بالای هر تکه بگذار)

```
Project: Manage by HEDAX rebuild. Read docs/manage-reconstruction/Manage-Final-Prompt-EN.md, Manage-Requirements-Checklist.md and Manage-Blueprint-FA.md before starting (skim if you already know them). Rules: work on a branch from `rebuild`, change only what this slice needs, never break the live Collision module (run its regression tests), no real customer data in git, deploy to STAGING only (production only where the slice says so). When done: open a PR into `rebuild`, deploy to staging, and send me a short report IN PERSIAN with screenshots (1440 / 390) and the status of each checklist ID in this slice. Then STOP.
```

---

## بخش ۱ — پایه (فقط به ترتیب، یک نفر)

### S01 — پایان گام ۱A (روی منیج اصلی)
**نتیجه‌ی قابل دیدن:** نام اجرت‌ها به جای کد؛ لیست شب درست با پنج‌شنبه؛ گزارش توقف.
```
Slice S01: finish Step 1A (labour names, night-list reconciliation and frozen version, stoppage report from «گزارش توقف خودرو» with the anonymised sample). This slice goes to PRODUCTION per the approved working mode (backup, rollback, smoke test; migrations only outside working hours). IDs: REC-05, REC-03 (partial), REC-16 (data only).
```

### S02 — محیط آزمایشی (staging)
**نتیجه:** یک آدرس جدا مثل staging.managebyhedax.ir که باز می‌شود. **نیاز به:** S01
```
Slice S02: create the staging environment (separate subdomain and database, Pulse reading the same sources READ-ONLY, basic auth or owner-only login) and the `rebuild` integration branch with auto-deploy to staging. Document how to deploy. No feature changes. ID: QA-05 (setup).
```

### S03 — سیستم طراحی
**نتیجه:** صفحه‌ی `/design-preview/components` با رنگ‌ها، فونت، دکمه‌ها، کارت خودرو، پلاک، جدول، کارت شاخص. **نیاز به:** S02
```
Slice S03: build the locked design system (tokens file, fonts, icon set, base components from Part B: plate, vehicle card, locked stepper, data table, KPI card, freshness badge, reminder, empty/loading/error states) and a page /design-preview/components showing all of them in light (desks) and dark (Vision/TV) themes. ID: CORE-12 (part 1).
```

### S04 — طرح ظاهری ۷ صفحه‌ی کلیدی ⛔ توقف برای تأیید
**نتیجه:** اسکرین‌شات ۷ صفحه که برای تأیید اینجا می‌آوری. **نیاز به:** S03
```
Slice S04: build static design previews with realistic synthetic data under /design-preview: (1) Vision overview desktop + TV, (2) Special Assist desk with booking assistant, (3) dispatch on tablet, (4) technician job on phone, (5) customer waiting-room TV, (6) vehicle file, (7) shop-floor board. Luxurious premium-car command-room feel, 21st.dev components for Vision. Screenshots 1440 / 390 and 1920×1080 for TV. STOP for owner approval; no logic. ID: CORE-12 (part 2).
```

### S05 — پوسته و منوی ۰ تا ۹
**نتیجه:** منوی جدید روی staging؛ همه‌ی صفحه‌های قدیمی از منوی جدید باز می‌شوند. **نیاز به:** S04 تأییدشده
```
Slice S05: new app shell and side menu 0–9 exactly as blueprint §2.3, using the approved design. Redirect old routes, hide «به‌زودی» modules from staff, back navigation everywhere, navigation tests (update sidebar spec). Restyle existing pages with tokens only, no logic changes. ID: CORE-10, CORE-12.
```

### S06 — برچسب فارسی کدها و نام کوتاه خودرو
**نتیجه:** هیچ «نحوه‌ی ثبت ۱» یا مشخصات بلند خودرو در صفحه‌ها نیست. **نیاز به:** S05
```
Slice S06: map every coded field to a Persian label (codes only in collapsible «جزئیات فنی»); short car name everywhere with an admin-editable model mapping table and collapsible «مشخصات کامل»; normalise Arabic ي/ك on import. IDs: CORE-05, CORE-06, CORE-07.
```

### S07 — رفع عقب‌ماندن پالس و صفحه‌ی منبع‌ها
**نتیجه:** در هاب داده برای هر منبع «آخرین موفقیت» و هشدار کهنگی؛ پالس هر ۱۰ دقیقه. **نیاز به:** S05
```
Slice S07: find and fix why Pulse stopped updating during working hours; receptions every 10 min in working hours (work calendar: 08:00–13:00, 15:30–18:30, Thursday 08:00–13:00, holidays/Ramadan configurable); source registry page with schedule, last success, staleness alarm, manual fallback guide. IDs: CORE-02, CORE-03, CORE-13.
```

### S08 — خواندن کامل کارت تعمیرات
**نتیجه:** در پرونده‌ی پذیرش، ایرادها و اجرت‌ها با اسم، تعمیرکار، زمان استاندارد. **نیاز به:** S07
```
Slice S08: ingest the full Kasb-o-Kar repair card (issues with names/status/notes/type/parts with names; labour lines with شرح تعمیر, نام تعمیرکار, زمان استاندارد, cost, cost bearer, تعداد سابقه, تاریخ آخرین تعمیر, status; «سالن تعمیرات», شماره هرم) and show it in the reception case. ID: CORE-01.
```

### S09 — آمار درست سرویس سریع / سالن
**نتیجه:** آمار امروز دیگر «۰ سرویس» نشان نمی‌دهد. **نیاز به:** S08
```
Slice S09: daily reception stats split by «سالن تعمیرات» (سرویس سریع / سالن تعمیرات) and per receptionist, replacing the labour-code approach. ID: REC-02.
```

### S10 — پرونده‌ی خودرو و جست‌وجوی سراسری
**نتیجه:** با پلاک یا شاسی (Ctrl+K) پرونده‌ی خودرو با خط زمانی باز می‌شود. **نیاز به:** S08
```
Slice S10: vehicle file per VIN with event timeline (receptions, issues, labour, parts, Collision case, Special Assist, stoppages, night-list appearances; more event types will be added later through a documented event API). Global search Ctrl+K by plate or VIN. Every vehicle card links to it. ID: CORE-08.
```

### S11 — بازیابی ۱۲ ماه گذشته
**نتیجه:** پرونده‌های خودرو سابقه‌ی یک سال را دارند. **نیاز به:** S10
```
Slice S11: one-time backfill of the last 12 months from Kasb-o-Kar into vehicle files; idempotent, resumable, progress page; link existing Collision cases. Run on staging only. ID: CORE-09.
```

### S12 — کارکنان و دسترسی‌ها
**نتیجه:** یک بخش کارکنان برای همه، سمت‌ها و جایگاه‌ها، ورود دو دری. **نیاز به:** S05
```
Slice S12: unified People module (6 base roles + job titles + module permissions + technician station), Collision staff migrated without interruption, login with two doors (PIN; email + second password for owner/admin; «مالک» not shown), guest read-only with masking and expiry. IDs: PPL-01…04.
```

### S13 — میز کار من
**نتیجه:** صفحه‌ی اول هر نفر کارهای امروزش را با دکمه‌ی «اقدام بعدی» نشان می‌دهد. **نیاز به:** S12
```
Slice S13: «میز کار من»: today's tasks, due items, discrepancies and reminders from all of a person's job titles, each with a next-action button; one-line morning summary. ID: CORE-11.
```

---

## بخش ۲ — پذیرش و سالن (مسیر A)

### S14 — تقسیم کار دم در (تبلت کارشناس فنی)
**نتیجه:** کارشناس فنی برای هر کار جایگاه و ترتیب را با چند لمس تعیین می‌کند. **نیاز به:** S08, S12
```
Slice S14: dispatch screen for the technical expert on tablet: new cards from Pulse, suggested station per labour (learned from history), confirm/change, order of stations; target ~10 seconds per vehicle. ID: REC-06.
```

### S15 — برچسب QR و شروع/پایان تکنسین با گوشی
**نتیجه:** برچسب مسیر چاپ می‌شود؛ تکنسین با اسکن QR کارش را شروع و تمام می‌کند. **نیاز به:** S14
```
Slice S15: print route label with QR on a thermal label printer (state the printer specs you support); technician scans QR on phone → own job → «شروع» / «پایان» / «تذکر» (part missing / late). Big buttons, minimal text. IDs: REC-07, REC-08.
```

### S16 — تابلوی سالن
**نتیجه:** هر جایگاه، خودروی فعلی، صف، و «خودروی X برود جایگاه ۳۶». **نیاز به:** S15
```
Slice S16: shop-floor board (PC and TV mode): each station's current vehicle, queue, vehicles waiting to move, move announcements after each «پایان». ID: REC-09.
```

### S17 — لیست شب کامل با جایگاه و کار مانده
**نتیجه:** لیست شب می‌گوید هر خودرو کجاست و کدام کارش مانده. **نیاز به:** S15
```
Slice S17: night list uses dispatch and start/finish data: done/remaining per labour, current and next station, technician; plus «کد تعمیرکار نامنطبق» report. IDs: REC-04, REC-10, REC-03 (complete).
```

### S18 — تابلوی انتظار مشتری و لینک پیگیری
**نتیجه:** تلویزیون سالن انتظار؛ مشتری با QR وضعیت را روی گوشی می‌بیند. **نیاز به:** S15
```
Slice S18: customer waiting-room TV board (partially masked plate, short car name, stage, estimated time left, no customer name, auto-rotation, large elegant type) and personal tracking link/QR for the customer's phone. IDs: REC-11, REC-12.
```

### S19 — خودروهای متوقف
**نتیجه:** هر توقف فعال یک پرونده با مراحل رسمی، مثل تصادفات. **نیاز به:** S10
```
Slice S19: stopped-vehicle cases from «گزارش توقف خودرو» (stepper of official stages, part lines, days stopped, reason, follow-up owner, linked Special Assist order), list «خودروهای متوقف», red alert on «تاخیر نمایندگی = بله», archive. ID: REC-16.
```

### S20 — برگشتی، تحویل به‌موقع، صف وضعیت‌ها
**نتیجه:** برگشتی‌ها به تعمیرکار قبلی وصل می‌شوند؛ درصد تحویل به‌موقع. **نیاز به:** S11
```
Slice S20: comeback detection (same labour, same VIN, configurable window default 30 days, linked to previous technician), on-time delivery (promised vs actual), and follow-up queues from official statuses. IDs: REC-13, REC-14, REC-15.
```

### S21 — پرونده‌ی مالی پذیرش
**نتیجه:** اجرت دستی، کار خارج و فروش آزاد (با شاسی) در یک پرونده. **نیاز به:** S08
```
Slice S21: financial file per reception: Kasb-o-Kar customer share + manual labour (description, technician code, amount, mandatory reason, no cap, no approval, audited) + outside work + free sale linked by VIN from «گزارش فروش طی دوره» (invoice number fallback). ID: REC-17.
```

### S22 — صورت‌حساب نهایی و بارکد پرداخت
**نتیجه:** صورت‌حساب چاپی با بارکد. **نیاز به:** S21
```
Slice S22: «صورت‌حساب نهایی» with completeness check, unique number, print/PDF, payment barcode, issued/paid/void, lock after issue, payment-device adapter behind config (manual payment for now). ID: REC-18.
```

### S23 — ارسال روزانه به آرپا (اکسل)
**نتیجه:** آخر روز یک اکسل از کارت‌های ترخیص‌شده‌ی امروز. **نیاز به:** S22
```
Slice S23: «ارسال به آرپا» page: end-of-day package of cards released that day, Excel export (format configurable until the Arpa import sample arrives), API send behind config, each card sent once, mapping table to Arpa accounts, «اختلاف با آرپا» for post-send changes. ID: REC-19.
```

---

## بخش ۳ — تصادفات

### S24 — ورود خودکار پذیرش تصادفی
**نتیجه:** سرپرست تصادفات با یک کلیک پرونده می‌سازد و کارشناسی کپی می‌شود. **نیاز به:** S08, S12
```
Slice S24: likely-accident receptions → «سرپرست تصادفات» approval queue → one click creates the Collision case and copies card issues/labour/parts into the assessment (never overwrite an existing assessment); stoppage and Special Assist badges; SLA timestamps. IDs: COL-01, COL-02, COL-07, COL-08.
```

### S25 — عکس برگه و کارشناسی موقت
**نتیجه:** عکس برگه‌ی تکنسین ← فهرست قطعه ← تأمین فوری. **نیاز به:** S24
```
Slice S25: NEW multi-page photo capture inside the case; provisional assessment from the handwritten sheet (AI reading → part list matched to catalogue/stock/model, uncertain lines flagged, expert confirms, status «کارشناسی موقت», parts supply starts); later reconciliation with the official assessment via supplement logic; body-shell templates per model. IDs: COL-03…06.
```

---

## بخش ۴ — امداد ویژه و نوبت‌دهی (مسیر B)

### S26 — پرونده‌های امداد ویژه از «منتظر دعوت»
**نتیجه:** هر ۱۰۸ خودرو پرونده با مرحله‌ی هر قطعه. **نیاز به:** S10
```
Slice S26: read «امداد ویژه های منتظر دعوت مشتری» (paginated grid) and the Special Assist report; case per vehicle with part lifecycle; officer desk (4 tabs, columns, 20 working days, yellow 11 / red 18); one-click call log, two unanswered = failed, pre-arrival reminder; non-use reasons with «در کسب‌وکار هم ثبت شود» tick; reception-card photo; auto checks; cancelled report; inspector export; archive. IDs: SA-01…04, SA-06…11.
```

### S27 — سیاست ظرفیت و تقویم نوبت
**نتیجه:** مدیر سقف‌ها را می‌گذارد؛ تقویم روز × شیفت با سه نوار رنگی. **نیاز به:** S11, S12
```
Slice S27: booking centre: company bookings read from Kasb-o-Kar, dealership bookings stored in Manage; manager policy (total cap, quick-service cap per weekday/shift); job types with learned hours/duration/overnight probability; three fill indicators; yard alert at 50; walk-in reserve; «نوبت‌های فردا»; phone booking form with 3 suggested days; capacity heatmap; standard-time unit inference. IDs: BK-01…09.
```

### S28 — دستیار نوبت امداد ویژه
**نتیجه:** دکمه‌ی «دعوت» سه زمان پیشنهادی می‌دهد. **نیاز به:** S26, S27
```
Slice S28: booking assistant on «دعوت»: 3 slots (day + shift + station) before the deadline, skill match, most free capacity, all arrived parts of one VIN in one visit; tentative reservation until Pulse finds the booking. ID: SA-05, BK-10.
```

---

## بخش ۵ — انبار و داغی (مسیر C)

### S29 — بارنامه و منیج اسکن
**نتیجه:** انباردار با بارکدخوان بارنامه را تیک می‌زند. **نیاز به:** S07
```
Slice S29: bill of lading every 2 h from «رسید بارنامه»; Manage Scan with handheld scanner (keyboard wedge) and camera fallback; green/yellow/red; complete/short/over report; resumable; notify on match with open Special Assist/Collision requests. ID: PS-01.
```

### S30 — میز داغی
**نتیجه:** فهرست جمع‌آوری ماه با بارکد، تیک و بسته‌بندی. **نیاز به:** S07
```
Slice S30: warranty-return desk «منیج می‌گوید، کاربر تیک می‌زند»: month's collection list ordered for packing, barcode, pack / under-3-months badges, scan or tick, bundle guidance, totals, bundle states, countdown to delivery date, shortages alert; robust parser. IDs: WR-01…04.
```

### S31 — تحلیل انبار
**نتیجه:** ارزش موجودی، راکد، نرخ تأمین، فروش بالاتر از قیمت شرکت. **نیاز به:** S11
```
Slice S31: stock value, dead stock >12 months, months' supply, fill rate, monthly purchases oil vs parts, loss-making and retention reports with suggested actions, sales above company price, ABC cycle counting, bin-location list and upload with preview (no writing to Kasb-o-Kar). IDs: PS-02…06.
```

---

## بخش ۶ — مشتری و پیامک

### S32 — صف برگشتی و نارضایتی
**نتیجه:** کارشناس CRM یک صف دارد. **نیاز به:** S20
```
Slice S32: CRM queue «رسیدگی به برگشتی و نارضایتی» from the external follow-up list (manual upload) + Manage comebacks, merged, outcomes recorded; owner change never carries call history. IDs: CRM-01, CRM-05.
```

### S33 — پیامک (یادآور سرویس، قطعه رسید، نوبت با پیامک)
**نتیجه:** پیامک‌ها در حالت آزمایشی ساخته و فرستاده می‌شوند. **نیاز به:** S27
```
Slice S33: provider-agnostic SMS adapter with a mock provider; periodic-service reminder (5000 km or 6 months, km estimated), «قطعه رسید», day-before booking reminder, two-way SMS booking; templates, opt-out, daytime only. Real sending stays off until the owner provides an account. IDs: CRM-02…04.
```

---

## بخش ۷ — دیدبان و پایان

### S34 — دیدبان: نمای کلی و حالت تلویزیون
**نتیجه:** مدیر روی کامپیوتر و تلویزیون نمای کلی را می‌بیند. **نیاز به:** S17, S19, S26
```
Slice S34: Vision overview on the approved design (dark luxurious, 21st.dev), periods day…year with comparison, drill-down to list and vehicle file, insight sentences, تذکر from rows, TV mode with revocable link and auto-rotation. IDs: VIS-01, VIS-02, VIS-06.
```

### S35 — دیدبان: زبانه‌ها، شاخص‌ها، ارزیابی کارکنان
**نتیجه:** همه‌ی زبانه‌ها با هدف قابل‌تنظیم. **نیاز به:** S34 و بخش‌های مربوط
```
Slice S35: Vision tabs (Collision, reception, Special Assist, stopped vehicles, parts store, warranty returns, booking & capacity, staff evaluation), KPI dictionary with owner-editable targets and colour by distance to target, staff evaluation with formula version and plain-language hints. IDs: VIS-03…05.
```

### S36 — آموزش داخل منیج
**نتیجه:** معرفی اولین ورود، دکمه‌ی «؟»، راهنمای چاپی. **نیاز به:** همه‌ی بخش‌ها
```
Slice S36: onboarding per role (first-login tour, «؟» on every page, guided first task, practice mode with synthetic data, printable one-page guide per role). ID: PPL-05.
```

### S37 — بررسی کامل چک‌لیست
**نتیجه:** گزارش وضعیت همه‌ی شماره‌ها. **نیاز به:** S01–S36
```
Slice S37: go through every ID in Manage-Requirements-Checklist.md on staging and report DONE / PARTIAL / BLOCKED with evidence; fix all PARTIAL items that do not need owner input; run the full test suite. IDs: all, QA-01…04.
```

### S38 — هفته‌ی آزمایش و جایگزینی ⛔ با تأیید تو
**نتیجه:** منیج جدید جای قدیمی را می‌گیرد. **نیاز به:** S37
```
Slice S38: acceptance week on staging per Final Prompt section 5, report results; after the owner's explicit approval, cutover to production with backup, rehearsed data migration, tested rollback and smoke test. ID: QA-05.
```
