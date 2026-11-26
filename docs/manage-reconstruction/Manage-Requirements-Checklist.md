# Manage by HEDAX — Requirements Checklist (source of truth for "done")

Every item has an ID. The agent reports each ID as: DONE (with screenshot/test) · PARTIAL (what is missing) · BLOCKED (exact sample/decision needed). Nothing is "done" without evidence. Persian UI strings are exact.

## CORE — data, vehicle file, shell
- CORE-01 Pulse reads the full Kasb-o-Kar repair card: «سالن تعمیرات», شماره هرم, warranty; per issue name/status/notes/type/parts with names; per labour line شرح تعمیر, نام تعمیرکار, زمان استاندارد, cost, cost bearer, تعداد سابقه, تاریخ آخرین تعمیر, status.
- CORE-02 Source registry: schedule, last success, staleness alarm, manual fallback with step-by-step guide, for every source.
- CORE-03 Receptions/cards every 10 min in working hours; Pulse staleness bug (no read 14:01–18:48) found and fixed.
- CORE-04 All new sources registered (stoppage, waiting-for-invite, cancelled Special Assist, technician work, planned repair start/finish, warranty-return reports, sales, bill of lading, stock turnover, loss-making parts, retention time, bin locations, follow-up list, Arpa import format).
- CORE-05 Arabic ي/ك → Persian ی/ک on every import; keys stored as text with leading zeros.
- CORE-06 No bare codes in UI: every coded field has a Persian label (e.g. «نحوهٔ ثبت ۱» → meaning); codes only in collapsible «جزئیات فنی».
- CORE-07 Short car name everywhere; full spec only in collapsible «مشخصات کامل»; admin-editable mapping table.
- CORE-08 Vehicle file per VIN with full event timeline; opened from every card and from global search (Ctrl+K, plate or VIN).
- CORE-09 12-month backfill, idempotent and resumable; existing Collision cases linked.
- CORE-10 Side menu 0–9 exactly as blueprint §2.3; old routes redirected; navigation tests.
- CORE-11 «میز کار من»: today's tasks from all job titles, each with a next-action button; morning summary line.
- CORE-12 Design system locked (tokens, components, page templates) per prompt Part B and the approved design preview.
- CORE-13 Working calendar: two shifts 08:00–13:00, 15:30–18:30; Thursday 08:00–13:00; Ramadan/holidays configurable.

## PEOPLE — staff and access
- PPL-01 One unified People module for all departments; Collision staff migrated without interruption.
- PPL-02 6 base access roles + job titles + module permissions + station for technicians; owner/admin create titles and stations.
- PPL-03 Login: two doors; PIN for staff/managers/guests (TECH/EXP/MGR/GST); email + second password for owner/admin; «مالک» not shown.
- PPL-04 Guest read-only with server-side masking and expiry.
- PPL-05 Onboarding per role: first-login tour («منیج برای تو…» / «تو فقط…»), «؟» help on every page, guided first task, practice mode with synthetic data, printable one-page guide per role.

## RECEPTION — reception to release
- REC-01 Today / open / released, date-range search, vehicle history.
- REC-02 Daily stats: quick service vs workshop from «سالن تعمیرات»; per receptionist.
- REC-03 Night list auto-built at cut-off (18:00, Thursday 12:30), supervisor approval deadline (18:45, Thursday 13:15), frozen approved version, reconciliation with reasons, past lists searchable, physical vs card count, carried-over badge.
- REC-04 Night list shows labour names, done/remaining per labour, current and next station (from dispatch).
- REC-05 Labour names never shown as codes (fix in night-list.service.ts and everywhere); reprocessing script.
- REC-06 Dispatch at the door (technical expert, tablet): suggested station per labour learned from history, confirm/change, order of stations; ~10 s per vehicle.
- REC-07 Route label with QR printed on a thermal label printer at reception.
- REC-08 Technician scans QR on phone → own job opens → «شروع» / «پایان»; «تذکر» for missing/late part.
- REC-09 Shop-floor board: each station's current vehicle, queue, vehicles waiting to move; "move vehicle X to station 36" announcements; usable on PC and TV.
- REC-10 «کد تعمیرکار نامنطبق» report: Kasb-o-Kar technician code vs dispatched station; same technician on two stations at once.
- REC-11 Customer waiting-room TV: partially masked plate, short car name, stage, estimated time remaining; no customer name; auto-rotating; elegant large type.
- REC-12 Personal tracking link/QR for the customer on their own phone (token link, same data as REC-11).
- REC-13 On-time delivery: promised vs actual release.
- REC-14 Comeback detection: same labour on same VIN within configurable window (default 30 days) → linked to previous technician; feeds CRM queue and Vision.
- REC-15 Official statuses («ترخیص شده با قطعه تامین نشده», «در انتظار مراجعه مشتری») feed follow-up queues.
- REC-16 Stopped vehicles: each active stoppage a case like Collision (stepper of official stages, part lines, days, reason, follow-up owner, linked Special Assist), list «خودروهای متوقف», red alert on «تاخیر نمایندگی = بله», archive.
- REC-17 Financial file per reception: Kasb-o-Kar customer share + manual labour (description, technician code, amount, mandatory reason, no cap, no approval, audited) + outside work (contractor, description, amount) + free sale linked by VIN (or invoice number fallback).
- REC-18 Final statement «صورت‌حساب نهایی»: completeness check, unique number, print/PDF, payment barcode, states issued/paid/void, lock after issue, payment-device adapter ready (manual payment until device).
- REC-19 «ارسال به آرپا»: end-of-day package of cards released that day; Excel export in Arpa import format; one-click API send ready behind config; each card sent once with Arpa doc no./export date; mapping table row type → Arpa account; post-send changes shown as «اختلاف با آرپا».

## COLLISION
- COL-01 Existing logic unchanged; Collision regression suite green on every PR.
- COL-02 Likely-accident reception → «سرپرست تصادفات» one-click approval → case created; card issues/labour/parts copied into assessment; existing assessment never overwritten.
- COL-03 NEW photo capture: multi-page photo/scan from phone camera inside the case.
- COL-04 Provisional assessment from the technician's handwritten sheet: AI reading → part list with technical codes matched to catalogue/stock and model; uncertain lines flagged; expert confirms; status «کارشناسی موقت»; parts supply starts immediately.
- COL-05 Official assessment later reconciled against provisional with supplement (الحاقیه) logic.
- COL-06 Body-shell replacement template per model, editable and learned from history.
- COL-07 Official stoppage and Special Assist badges on Collision cards.
- COL-08 SLA timestamps recorded for Vision (reception → assessment → parts decision → stations → QC → delivery).

## SPECIAL ASSIST
- SA-01 Case per vehicle; part lifecycle requested → in purchase → arrived → inviting → booked → replaced; exits with mandatory reason.
- SA-02 Official invite source «امداد ویژه های منتظر دعوت مشتری» (paginated grid); all current waiting vehicles become cases with reception and part stage.
- SA-03 Officer desk: 4 tabs, columns per blueprint, sorted by arrival, 20 working days, yellow day 11, red day 18.
- SA-04 Calls logged with one click; two unanswered = failed; periodic pre-arrival status-call reminder (default 10 days, can be off).
- SA-05 Booking assistant: 3 suggested slots (day + shift + station) before deadline, skill match, free capacity, all arrived parts of one VIN in one visit.
- SA-06 Auto checks: replaced from stock → removed from invite list and part released; replaced only with valid link to request + part + installing reception; released part consumption tracked.
- SA-07 Reception card photo from inside the case.
- SA-08 Non-use reasons list + requesting station; reminder «در کسب‌وکار هم ثبت شود» with confirm tick.
- SA-09 Cancelled Special Assist report linked to requesting station.
- SA-10 Inspector trail export per part/VIN; archive after 2 months; nothing deleted.
- SA-11 Exports «تأمین‌نشده‌های بیش از ۳۰ روز» and «رسیده ولی دعوت‌نشده».

## BOOKING & PLANNING
- BK-01 Booking centre desk for the booking/CRM officer; company online bookings (~40%) read from Kasb-o-Kar; dealership bookings (phone, Special Assist, later SMS) stored only in Manage.
- BK-02 Manager policy: daily total reception cap and separate quick-service cap, per weekday and shift.
- BK-03 Job type at booking (oil/periodic, Special Assist part, inspection/diagnosis, specific repair, body/accident) with learned station hours, duration and overnight probability.
- BK-04 Three fill indicators per day (total cap, quick-service cap, station hours %); suggestions only where all three have room for that job type.
- BK-05 Yard alert when current + likely overnight vehicles exceed 50.
- BK-06 Walk-in reserve learned from history; unfilled quota by noon of previous day released to walk-ins.
- BK-07 Screens: calendar day × shift with three bars; «نوبت‌های فردا» with channel; phone booking form → 3 suggested days.
- BK-08 Capacity board day × station heatmap (green <70%, yellow 70–100%, red >100%) visible to everyone who books.
- BK-09 Standard-time unit inferred from actual durations; values labelled «تخمینی» until confirmed.
- BK-10 Technician productivity = standard time of finished work ÷ attended hours (actual start/finish from REC-08; calendar hours fallback).

## PARTS STORE & WARRANTY RETURNS
- PS-01 Bill of lading every 2 h; Manage Scan with handheld scanner (camera fallback); green/yellow/red feedback; complete/short/over report; resumable; match to open Special Assist/Collision requests.
- PS-02 Stock value, dead stock >12 months (% and value), months' supply, fill rate, monthly purchase oil vs parts.
- PS-03 Loss-making parts and retention-time reports with a suggested action per dead item.
- PS-04 Sales above company price from Collision pricing and suffixed free-sale codes; traceable per transaction.
- PS-05 ABC cycle counting (A monthly, B quarterly, C twice a year) with variance reasons.
- PS-06 Bin locations: list without location, Excel upload, preview, approval; writing to Kasb-o-Kar only in Phase 3 with explicit owner approval.
- WR-01 Warranty-return desk «منیج می‌گوید، کاربر تیک می‌زند»: month's collection list ordered for packing; name, code, qty, barcode, reception, warranty card; pack and under-3-months badges, pack items grouped.
- WR-02 Scan or tick each part; Manage tells which bundle; totals per bundle and month (labour count, total qty, physical count).
- WR-03 Bundle states collecting → packed → ready → handed over; countdown to the company's delivery date (user enters it); shortages alerted before.
- WR-04 Parser handles leading zeros, multi-card rows, card across lines, repeated headers, page totals, «هزار ریال» column.

## CRM & SMS
- CRM-01 One queue «رسیدگی به برگشتی و نارضایتی»: external follow-up list (manual upload until source) + Manage comebacks, merged, outcome and invite recorded; no day-3 call by Manage.
- CRM-02 Periodic-service reminder: 5000 km or 6 months, daily km estimated from last two receptions; SMS before due; no booking → CRM call list.
- CRM-03 SMS provider-agnostic adapter (Iranian provider), editable templates, opt-out, daytime sending; used for service reminders, «قطعه رسید», day-before booking reminder.
- CRM-04 Two-way SMS booking: customer texts → job type question → free slots for that type → confirm with a number → booking created.
- CRM-05 Owner change never carries call history to the new owner.

## VISION
- VIS-01 Dark luxurious theme on 21st.dev components; desktop, mobile and TV mode (revocable read-only link, auto-rotation, masked data).
- VIS-02 Periods day/week/month/6 months/year (Jalali), comparison with previous period; every number drills down to its list and vehicle file; PDF/Excel.
- VIS-03 Tabs: overview, Collision, reception, Special Assist, stopped vehicles, parts store, warranty returns, booking & capacity, staff evaluation.
- VIS-04 KPI dictionary (source, formula, owner-editable target) for all KPIs in blueprint §5; card colour from distance to target.
- VIS-05 Staff evaluation: on-time % per person with formula version; plain-language root cause and suggested action; visible only to senior managers and the department head.
- VIS-06 1–3 plain-language insight sentences per page; تذکر to the responsible person from any row.

## QUALITY GATES (apply to every item)
- QA-01 Before/after screenshots at 1440 / 1366 / 390 for every changed page.
- QA-02 Matches the approved design preview; tokens only; no overlap, no horizontal scroll, AA contrast, empty/loading/error states, back navigation.
- QA-03 Unit, integration and UI tests with synthetic data incl. leading zeros, duplicate/corrected files, VIN change, two receptions per VIN, mid-import failure, concurrency, month/holiday boundaries, guest masking.
- QA-04 No real customer data, secrets or one-time URLs in git or logs.
- QA-05 Production untouched until the final cutover; then backup, tested rollback, smoke test.
