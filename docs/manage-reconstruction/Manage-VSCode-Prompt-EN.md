# Execution Prompt — Manage by HEDAX Reconstruction
### For the VS Code agent (Claude Code / Codex) — from Ali Hedayatshodeh, owner of Manage and service manager of Iran Khodro dealership 1307, Qom

> **LANGUAGE RULE (mandatory):** This prompt is in English, but **every report, PR description, progress note, question and summary you write for the owner must be in Persian (فارسی)**. All user-facing UI text stays in Persian. Persian labels quoted in this prompt (in «» or Persian script) are the exact UI strings / official source names — use them verbatim. Code, identifiers and commit messages may be in English.

> **How to run this:** Execute **Phase 1 step by step**, one branch and one PR per step, in the order given. After Phase 1, **stop and report** (in Persian). Phases 2 and 3 start only after the owner explicitly approves.

---

## Part A — Context (always applies)

### A.1 What Manage is
Manage is the integrated operations system for a car dealership. Tagline: «از پذیرش تا تحویل، با دید روشن.» Manage works **alongside** Iran Khodro's کسب‌وکار system (b2b.isaco.ir, "Kasb-o-Kar"), never in parallel with it: it pulls data itself (Manage Pulse), stores it with provenance (Manage Nexus), and shows each person only today's work. Goals: eliminate double entry, surface work that is currently not getting done, and give managers a precise, luxurious overview (دیدبان / Manage Vision).

### A.2 Read before doing anything
`AGENTS.md`, `PROGRESS.md`, `PRODUCT_SPEC_FA.md` (especially **section 29 — approved decisions**), `docs/manage-reconstruction/Manage-Scenario.md`, the latest test report, and open PRs (especially #109). Work from the **latest `main`**. On conflict, the newer approved decision (section 29 and this prompt) wins.

### A.3 Fixed principles
1. **No double entry.** Users enter only what exists in no other system (a reason, a call outcome, a linked invoice number, a decision). Prefer picking from a list over typing.
2. **Person-centric.** Each person sees only the modules they have access to. Everyone's home page is «میز کار من» (My Desk).
3. **Nothing is deleted.** Closing = archiving. Every change is audited (who, what, when, before/after).
4. **The Collision (تصادفات) module is in live use.** Do not change its logic or desks. Only connect it to the new menu, the unified People module, and Vision.
5. **Units:** money in rial; Jalali (Solar Hijri) dates; weeks start on Saturday; deadlines in **working days** (configurable work calendar with half-day Thursday and holidays).
6. **Missing data is not zero.** Where the source is empty, show «نامشخص» — never 0 and never a raw code.

### A.4 Approved decisions (summary of spec section 29)
- Keep the existing **6 base access roles**. Job titles (پذیرشگر، انباردار، …) are only **labels + per-module permissions** on a person.
- Special Assist (امداد ویژه): deadline **20 working days** from part arrival; yellow from day 11, red from day 18. **Two unanswered calls = failed contact.** At the deadline Manage warns, and the responsible person releases the part with one click (no automatic release).
- A booking found in Kasb-o-Kar is linked to the part automatically.
- Staff score = 100 × (due tasks completed on time ÷ all due tasks in the period).
- Guest: whole system read-only with masked data (mobile number, full name, full VIN, amounts).
- New side menu 0–9 (see A.6).

### A.5 Agent working rules
- Each step = one branch + one reviewable PR with a Persian description. **Merge and release only with the owner's explicit approval.**
- **Before changing any page, take screenshots of its current state** (desktop 1440, laptop 1366, mobile 390) and put them in the PR next to the new screenshots. Never redesign a page without first looking at its current version.
- Additive migrations with a `down`; back up before any production change, per project instructions.
- **You do not log into Kasb-o-Kar or Arpa yourself and you do not write to production.** Work with the existing Pulse/Nexus code and synthetic fixtures. Wherever a real sample is needed, write in the "Samples needed" section of your report **exactly which file, from which menu path**, then continue with the next independent task. Do not stall.
- No passwords, tokens, real customer data or one-time URLs in git or logs.
- Source by HEDAX is out of scope.
- At the end of every step update `PROGRESS.md`, `TEST_REPORT` and `CHANGELOG`; mark each item as one of: in code / tested / released / verified at the dealership.

### A.6 Information architecture — side menu

| # | Menu label (UI, Persian) | Code key | Existing routes that move under it | Who sees it |
|---|---|---|---|---|
| 0 | میز کار من | `desk` | (new) | everyone |
| 1 | تصادفات | `collision` | `accidents`, `cases` | collision team, parts supply, related technicians, managers |
| 2 | پذیرش تا ترخیص | `service-flow` | `reception`, `reception/night` | reception, release desk, storekeeper (free sale / outside work only), managers |
| 3 | امداد ویژه | `special-assist` | `special-aid` | Special Assist officer, reception, managers |
| 4 | انبار قطعات | `parts-store` | `stock` + داغی (warranty returns) | warehouse, parts supply, managers |
| 5 | برنامه‌ریزی تعمیرات | `workshop-planning` | `workshop` | planning, managers (marked «به‌زودی» for now) |
| 6 | ارتباط با مشتری | `crm` | — | CRM, managers («به‌زودی» for now) |
| 7 | دیدبان | `vision` | current control room, `reports/people`, report center | senior managers, owner |
| 8 | کارکنان و دسترسی‌ها | `people` | `users` | owner, system admin |
| 9 | هاب داده | `nexus` | `settings/nexus`, `settings/pulse` | owner, system admin |

- Do not bolt the new menu onto the old structure. For every active page produce a table "new title ← old route ← allowed roles ← back route", redirect old routes, and write navigation tests (update `sidebar-20261119.spec.ts`).
- «به‌زودی» (coming soon) modules are visible only to owner and system admin; hidden from staff.
- From any card on any desk, one click must reach that case and its **next action**. Every page has a back button.

---

## Part B — Design system (applies to every page)

**Overall direction:** luxurious, calm, refined, visibly intelligent — the "command room of a premium car brand", not a generic admin panel. Acceptance test: a low-literacy user finds their task without training; a manager sees at a glance where work is stuck. The current redesigned login page (fine type, hairline car line art) is the reference for the overall feel.

### B.1 Tokens (one central token file; no stray colours or sizes inside components)
- **Font:** one free variable Persian font (suggested: Estedad or Vazirmatn), weights 300–600, Persian digits, tabular figures in tables and numbers.
- **Type scale:** base 13px desktop / 14px mobile; 12 small, 15 card title, 18 page title, 28–40 only for Vision headline numbers.
- **Sizes:** input and button height 34px (40 on mobile); icons 16px with 1.25 stroke from one icon family (e.g. Lucide); spacing on a 4/8 grid; radius 10px cards, 8px controls. **Everything smaller and finer than the current build** — the owner's main complaint is oversized UI on laptops.
- **Desk colours (light):** background warm ivory `#FAFAF7`, surface `#FFFFFF`, line `#E7E5DF`, text `#1B1D22`, muted text `#6B6F76`, champagne accent `#A8844F`.
- **Vision colours (dark, default on TV):** graphite background `#0F1115`, layers `#171A21` / `#1F232B`, same champagne accent.
- **Status colours (meaning only, never decoration):** good `#2E7D5B`, warning `#B7791F`, critical `#B3261E`, info `#3B6E8F`. Coverage types کارت طلایی / بیمه / شخصی each get one small fixed tag.
- **Depth and motion:** soft two-layer shadows instead of heavy borders; animations 180–280ms; respect `prefers-reduced-motion`. A 3D feel only in Vision, and light.
- **Copy tone:** warm, polite, colloquial Persian («امروز ۳ خودرو منتظر قطعه‌اند»), short, no technical jargon for users.

### B.2 Base components (build once, reuse everywhere)
1. **Iranian licence plate** with correct proportions and font, in three sizes.
2. **Vehicle card:** short car name (ریرا، سورن…) · plate · customer name · current station or stage · "day n" badge · beneath in fine type: case number and reception number. No colour/trim details. Status shown only by a thin coloured strip on the card's edge.
3. **Locked stepper:** each stage unlocks only when the previous one is complete; current stage highlighted, later stages dimmed and locked.
4. **Data table:** sticky header, sorting, filters, Excel/PDF export, compact density for laptops, collapses into cards on mobile.
5. **KPI card:** number, comparison with the previous period, one line of explanation, click → the list behind the number.
6. **Data freshness badge:** «آخرین به‌روزرسانی: ۱۰ دقیقه پیش», plus a stale indicator when the source is behind.
7. **تذکر (reminder/nudge):** short message from anyone to anyone, linked to a vehicle.
8. **Empty, loading and error states** for every list, each with one guiding sentence.

### B.3 Page templates
- **Desk:** one-sentence summary of today at the top → queue of cards ordered by urgency → detail side panel (desktop) or separate screen (mobile). Small search, few icons.
- **Case:** vehicle header (large card) → stepper → only the current stage's content → collapsed history at the bottom.
- **Report:** period picker → KPI row → one main chart → table → export.
- **Technician desk (basic phones):** only their own vehicle cards, two big buttons «شروع» and «پایان», a «تذکر» button (part missing / part late), wage per vehicle and monthly total. Minimal text.
- **Data hub:** one card per source: name, method (automatic via Pulse / manual), last success, row count, errors, and a step-by-step guide "where in Kasb-o-Kar to get this report" for manual upload.

### B.4 Per-page quality checklist (include in every PR)
- [ ] Before/after screenshots at all three sizes
- [ ] No horizontal scroll on mobile; no overlapping text anywhere
- [ ] Text contrast at least WCAG AA
- [ ] All colours and sizes come from tokens
- [ ] Back navigation, empty, loading and error states exist
- [ ] Initial page load under 2 seconds on an ordinary laptop

---

## Part C — Data rules (Pulse and Nexus)

- Every row links to its source, period, file/version, official identifier, event time and observation time. File hash detects duplicates; a correction with the same event key creates a new version, never an overwrite.
- **Keys are stored as text**, preserving leading zeros (part number, reception number, warranty card number). A short chassis number may be linked only through a documented relationship to the full VIN.
- A row missing from a limited export ≠ the row was cancelled.
- Ambiguous matches (several candidates, several receptions for one VIN, owner/mobile changed) go to a **review queue**, never a guess.
- Manual file upload passes through the same validation as automatic ingestion. Changed headers, an abnormal drop in row count, or a login page instead of a file → preview and warning, not ingestion.
- Concurrency lock per tenant/source/period, checkpoints, limited retries, record of last success; during a source outage show the last valid version with a staleness indicator.
- Every operational change: tenant, server-side permission check, transaction, audit, `expectedVersion`.
- Design for multiple dealerships and brands (tenant), even though there is one dealership today.

---

## Part D — Phase 1 (in this order; one PR per step)

### Step 1A — Urgent fixes (owner's first priority)
**1. Labour (اجرت) names.** The UI currently shows a code instead of the Persian labour name.
- Evidence in code: `apps/api/src/pulse/kasb-protocol.ts` (`DrerGrprRpr` = code, `DrerDesc` = description); `apps/api/src/pulse/pulse-map.ts` maps only that field; `apps/api/src/pulse/night-list.service.ts` around line 172: `x.description || x.code || 'اجرت'`.
- Fix: show the Persian labour name from the official description or an approved labour reference table. If absent, show «نام اجرت در منبع مشخص نیست» and add the row to a data-review queue. **Never a code or a bare number in the name column.** Keep the internal code for matching.
- The primary column must be «نام اجرت» in staff desks, the night list, reports, detail views and print/PDF/Excel. Reprocess historical data with a repeatable script.
- Acceptance: on a case with several labour lines, every line's name and status equals the official ISACO card.

**2. Night list (لیست شب) correctness.**
- Evidence: same service around line 103 (`isOpen=true && admittedAt<now`); regeneration only adds, so rows that no longer qualify remain; render around lines 160–190 reads current tables, so an old report shows today's status.
- Fix:
  - **Cut-off from the work calendar:** Saturday–Wednesday build at 18:00, supervisor approval deadline 18:45; Thursday build at 12:30, deadline 12:50 (the dealership closes before 13:00); holidays: no build. All configurable.
  - Re-reconcile the draft (add **and remove**) while keeping staff notes; show the differences; manual add/remove requires a reason and is logged.
  - After supervisor approval, **freeze that day's version** (vehicle details, labour names and statuses, station, reason). Old reports must never show today's status.
  - Badge for «مانده از دیروز / پریروز»; physical vehicle count shown separately from reception-card count.
  - The supervisor resolves "card open but vehicle has left" and "vehicle present but missing from the list" with a reason.
  - Past night lists are searchable and viewable; old reports without evidence are labelled «داده‌ی تاریخی ناقص».
- Required tests: reception after cut-off, release before cut-off with late sync, release next day, several receptions for one vehicle, re-run, correction with reason, Thursday, holiday.

**3. Official stoppage report (توقف رسمی), separate from the night list.**
- Source: ISACO → خدمات ← عملیات ← تعمیرات خودرو ← جزئیات کارت ← بررسی وضعیت توقف.
- Distinct states: active stoppage / resolved / successful query with no record / error / stale data. Each field (reason, part, dates) only if present in the source.
- Comparison view: night-list only / official stoppage only / both.
- Until a real positive and a real resolved sample have been validated, label the report «در حال اعتبارسنجی» and do not claim full coverage.

### Step 1B — Design system, shell and menu
- Tokens and components from Part B.
- New shell (side menu 0–9, header, back navigation) and redirects for old routes per A.6.
- **«میز کار من»:** each person's tasks for today, due items, discrepancies and reminders from all their job titles in one place, each with a "next action" button.
- Visual restyle of existing pages using tokens only (no logic changes), with before/after screenshots.

### Step 1C — People and access (unified)
- One module for all departments, including migrating the current Collision staff without interrupting their work.
- Model: person → base access role (the 6 roles of section 29) → one or more job titles → module permissions → station (for technicians).
- Job titles follow the formal pattern «سرپرست [department]» (head) and «کارشناس [department]» (member), plus: پذیرشگر، مسئول ترخیص، انباردار، مسئول تأمین قطعه، کارشناس امداد ویژه، کارشناس فنی، کارشناس برنامه‌ریزی، کارشناس CRM، technicians (صافکار، نقاش، جلوبندی، باتری‌ساز، مکانیک…)، مدیر عامل، مدیر نمایندگی، مدیر خدمات، مدیر مالی، مهمان. Owner and system admin can create new job titles and stations.
- Login: staff, managers and guests use username + 4-digit PIN (TECH + station code; EXP / MGR / GST + two digits). Owner and system admin use email + second password. The login page has exactly two doors, and the word «مالک» does not appear on it.
- Guest: read-only, expiry date, server-side masking.
- Staff invitations: owner and system admin (owner can revoke this from the system admin). Deactivating staff and switching the system on/off: owner only.

### Step 1D — Reception to release (پذیرش تا ترخیص)
- **Today / open / released** views, date-range search, vehicle history.
- **Daily stats:** total receptions; repair vs periodic service & oil (from a configurable list of service labour codes; receptions with no labour form their own bucket); count per receptionist.
- **Case view:** for Special Assist show only part name, part number, Special Assist number and status — **remove the amount.**
- **Outside work (کار خارج از نمایندگی):** multiple lines per case (description, contractor, amount), entered by receptionist or storekeeper.
- **Free sale (فروش آزاد):** the storekeeper enters the sales invoice number on the case; Manage reads lines and amounts from «بازرگانی ← گزارشات فروش ← گزارش فروش طی دوره». Not-found or duplicate numbers (numbers may repeat across years or document types) → warning.
- Receptions that look like accident jobs go to the collision expert's draft queue (a suggestion, not a definitive classification).

### Step 1E — Special Assist (امداد ویژه), complete
- Case per vehicle, with independent receptions and parts. Part lifecycle: requested ← in purchase ← arrived & ready to invite ← inviting ← booked ← replaced. Exits, each with a mandatory reason: replaced from stock, declined / not used, deadline reached → released.
- **Special Assist officer's desk:** four tabs (در انتظار تأمین / آماده‌ی دعوت / نوبت‌داده‌شده / تعیین تکلیف‌شده). Columns: short car name (full model on one click), VIN, plate, customer name and mobile, part name, part number, Special Assist number, status, arrival date, working days left. «آماده‌ی دعوت» sorted by arrival date, coloured yellow/red per section 29.
- **Calls:** each call logged with one click (پاسخ داد و نوبت گرفت / پاسخ داد و انصراف داد / پاسخ نداد / خاموش / شماره اشتباه). A periodic status-call reminder while waiting for the part (default every 10 days, can be switched off).
- **Booking:** done in Kasb-o-Kar's booking system; in Manage only the date and **station code** are entered. A booking found in the booking report links automatically. "Station load" view: Special Assist bookings per station for today, tomorrow and the following days.
- **Automatic checks:** if the same part number was already replaced on the same VIN from stock, remove the customer from the invite list and release the part immediately. "Replaced" only with a valid link to the same request, part and installing reception (a stock issue or an old repair is not proof of installation). Track consumption of a released part on another VIN.
- **Reception card:** photo or scan attached **from inside the case itself** (phone camera or upload, multiple pages).
- **Standard reasons for non-use:** wrong part number, defective part, wrong diagnosis by technical expert, wrong diagnosis by technician, part not needed, replaced from stock, no show after two calls, customer declined, vehicle sold, other. Also record the requesting station code.
- **Inspection trail:** full history per part or VIN with Excel/PDF export for Iran Khodro inspectors. Cases archive two months after part arrival; never deleted.
- Exports: "unsupplied for more than 30 days" (to send to the company) and "arrived but not invited".
- The Collision module's parts desk keeps its own separate flow.

### Step 1F — Warranty returns (قطعات داغی), operational module (new owner request)
- Sources: خدمات ← گزارش ← تحویل داغی («تحویل داغی یک روزه»، «بارکد قطعه داغی»، «قطعات پک»). Daily report for the previous day.
- Known report structure (sample of 1405/09/04, HTML, seven pages, 35 cards): separate summary counts for labour lines, total part quantity and physical part count (three independent measures); headers: ردیف، شماره فنی، شرح قطعه، تعداد، هزینه (هزار ریال)، شرح محصول، کد سازنده، کد قطعه، شرح سازنده، کسری، شماره کارت گارانتی (کد اصلاحی قطعه); at the end, lists «کارت‌های گارانتی پک‌دار» and «کارت‌های گارانتی با عمر تا سه ماه».
- The parser must handle: leading zeros, a row with several cards and quantities in parentheses, one card across several lines, repeated headers, page totals (not items). Only the «هزار ریال» column is multiplied by 1000, and the original value is kept. Consumables and fluids are not converted to physical counts.
- The reception number is not in this report; build the warranty card → reception link from an official source, never by guessing or trimming digits. Ambiguous cases → discrepancy queue.
- **Warranty-return expert's desk:** day, reception, vehicle, part number and name, expected vs matched quantity, barcode, card, pack, age, discrepancy reason, owner, evidence; filters by day/status/owner; PDF and Excel; manager summary.

### Phase 1 exit gate (stop here)
- Automatic night list matches the physical yard count on 5 consecutive nights.
- The Special Assist officer runs a full week of work inside Manage.
- Daily warranty-return counts match the official export, and re-importing the same file has no effect.
- No labour name appears as a code anywhere.
- Final report **in Persian** for the owner: for each step, the manual work eliminated, real coverage, test results, risks, remaining items, and **an exact list of samples or decisions needed from the owner.**

---

## Part E — Phase 2 (only after owner approval)

1. **Manage Scan and bill-of-lading receipt:** Pulse reads bills of lading every 2 hours from «بازرگانی ← عملیات خرید ← رسید بارنامه». The storekeeper scans the part's own barcode with a **handheld scanner** (USB/Bluetooth, keyboard-wedge); phone camera is the fallback. Each scan ticks and counts with sound and colour (green = on the bill, yellow = over quantity, red = not on the bill). Finishing gives complete / short / over with a printable report. Partial receipts are saved and resumable. Notify the relevant expert when an arrived part matches an open Special Assist or Collision request. Confirm the barcode format from a real label sample.
2. **Warehouse analytics:** stock value; value and percentage of dead stock (no consumption for over a year), from «بازرگانی ← گزارشات انبار ← سرجمع گردش انبار به تفکیک کالا» (first the past year, then incremental; transfers between warehouses are not consumption); monthly purchases split oil vs parts; **sales above company price** from two sources: Collision pricing above company price, and free sales with a suffixed part number (an English letter appended to the code) — strip the suffix and compare with the company price at the sale date. Every transaction traceable.
3. **Final statement («صورت‌حساب نهایی» — use this name, not «فاکتور»):** total in rial = customer's payable share of the Kasb-o-Kar invoice (excluding warranty share) + outside work + linked free sales not already counted, including returns and corrections. Completeness check before issuing. Unique number, print/PDF, **payment barcode** (statement number + amount). States: issued / paid / void; locked after issuing, a change means void + reissue with history. Build a payment-device adapter layer now; until the device is purchased, payment is recorded manually. Gate: matches the release desk's handwritten receipt over several days.
4. **Vision (دیدبان / Manage Vision):** extend the existing control room using **21st.dev** components. Luxurious dark theme, light animated charts, subtle 3D feel. Works on mobile, desktop and **TV** (a read-only link the owner creates and can revoke; pages auto-rotate; sensitive data masked). Periods: day, week, month, 6 months, year (Jalali), compared with the previous period. Every number → the list behind it. 1–3 plain-language insight sentences at the top of each page. Send a تذکر to the responsible person from any row.
   - **Tabs:** نمای کلی · تصادفات · پذیرش تا ترخیص · امداد ویژه · انبار · داغی · ارزیابی کارکنان.
   - **Collision:** list of vehicles in the workshop (coverage, stage, progress %, days in workshop, days behind plan, delayed section and reason), ranking of delay causes, performance by station.
   - **Reception:** counts by type and receptionist; which station holds the most overnight vehicles and its dominant reason.
   - **Special Assist:** count and amount registered, supplied, unsupplied with age, average supply days, replaced and not replaced, arrived but unused (sitting in stock), arrived but not invited, reasons for non-use, stations that requested but did not use; funnel by customer and by part (arrived → invited → came → installed).
   - **Staff evaluation (working-day deadlines):** collision expert 1 day from reception to finalised assessment and dispatch; parts supply officer 3 days from finalised assessment to a decision on every part, and 1 day after each obstacle is cleared (supplement, rejected assessment, part-number change); technician per the days in the repair route; Special Assist officer 20 working days; reception supervisor sends the night list by the deadline. Score per section 29, with a formula version (`packages/shared/src/employee-performance.ts` currently defines weighted formula 1.0.0; historical results must be re-readable with their own version). For low scores, a simple hint (root cause + suggested action). Scores visible only to senior managers and that department's head.
   - **KPI dictionary:** for every KPI card document source, field, numerator and denominator, frequency and limitations in one file.

## Part F — Phase 3 (only after owner approval)
1. **Arpa** integration (API, server inside the dealership) for outside work and bill-of-lading receipts.
2. Writing **physical bin locations** into Kasb-o-Kar from Excel (list of parts without a location ← upload ← row-by-row preview ← warehouse head approval ← write ← per-row success/failure report).
3. **Payment device** integration after purchase and specs are provided; payment only with valid confirmation, and a network drop must never cause a double charge.
4. **Stock-taking, workshop planning, CRM:** data foundations and «به‌زودی» menu only for now. For planning, already provision a "standard labour time" field and actual start/finish timestamps.
- Every write to an external system: row-level preview, manual approval, idempotency key, receipt, log.

---

## Part G — Samples needed from the owner (ask for these precisely in your Persian report)
- One multi-labour reception card (its permitted export) to match labour names
- One positive and one resolved sample of «بررسی وضعیت توقف»
- Export of «گزارش فروش طی دوره» for one day
- Exports of «بارکد قطعه داغی» and «قطعات پک» for the same day as the warranty-return sample
- A few photos of part barcode labels + one bill-of-lading Excel
- Export of «سرجمع گردش انبار به تفکیک کالا» for the past year

**Reminder: all reports, PR descriptions and questions to the owner must be written in Persian.**
