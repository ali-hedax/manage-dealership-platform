# FINAL EXECUTION PROMPT — Manage by HEDAX full rebuild

**Language rule:** all reports, PR descriptions, questions and summaries to the owner in Persian. UI text in Persian, exactly as written in the documents.

## 0. Inputs (put all four in docs/manage-reconstruction/ and read them fully)
1. **Manage-Requirements-Checklist.md** — the definition of done. Every ID must end as DONE with evidence.
2. **Manage-Blueprint-FA.md** — the approved product blueprint (Persian). Wins on any conflict.
3. **Manage-VSCode-Prompt-EN.md** — design system (Part B), data rules (Part C), working rules (A.5), and the original phase details.
4. **Manage-Blueprint-Prompt-EN.md** — technical notes for the data core, booking assistant, warranty returns, CRM.
Also read AGENTS.md, PROGRESS.md, CHANGELOG.md, PRODUCT_SPEC_FA.md §29.

## 1. Delivery strategy (owner decision)
The owner will present Manage to the group's management as one complete product. Therefore:
- **Finish Step 1A** (labour names, night list, stoppage report) and release it to production as already approved — these fix the live system.
- **Everything else is built on a staging environment** (separate subdomain and database, e.g. staging.managebyhedax.ir, fed by the same Pulse sources read-only). Production keeps running unchanged until the final cutover.
- Build internally in the order of section 3, one branch + PR per block, merged into a `rebuild` integration branch deployed continuously to staging.
- **Final cutover to production only with the owner's explicit approval**, after the full checklist is DONE and the acceptance week (section 5) passes; with backup, data migration rehearsal on a copy, tested rollback and smoke test.

## 2. Design gate — before any feature work (STOP for approval)
Build the locked design system (tokens, components, page templates per Part B) and a **design preview** route on staging (`/design-preview`) with realistic synthetic data, showing these screens at real quality:
1. Vision — overview on desktop, and TV mode
2. Special Assist officer's desk with the booking assistant (3 suggested slots)
3. Dispatch screen on tablet (technical expert at the door)
4. Technician job screen on phone (after QR scan: start / finish / تذکر)
5. Customer waiting-room TV board
6. Vehicle file (header + timeline)
7. Shop-floor board
Direction: luxurious, calm, refined, premium-car command room; dark theme for Vision and TV boards, warm light theme for desks; 21st.dev components for Vision; fine sizes (base 13px desktop), thin icons, no clutter. Send the owner screenshots of all screens (1440 / 1366 / 390 and 1920×1080 for TV boards) with a short Persian note, then **STOP and wait for approval**. After approval these screens are the binding visual reference for every page (QA-02).

## 3. Build order (internal; all on staging)
1. Data core: CORE-01…09, CORE-13 (incl. fixing Pulse staleness, full card ingestion, source registry, vehicle file, 12-month backfill).
2. Shell and people: CORE-10…12, PPL-01…05.
3. Reception & shop floor: REC-01…16 (dispatch, QR, shop-floor board, customer TV, comebacks, stopped vehicles).
4. Financial file and Arpa: REC-17…19 (Arpa Excel export working; API send behind config, disabled until the owner provides the API).
5. Collision additions: COL-01…08 (photo capture, provisional assessment from handwritten sheet, body-shell templates).
6. Special Assist: SA-01…11.
7. Booking & planning: BK-01…10.
8. Parts store & warranty returns: PS-01…06, WR-01…04 (writing bin locations into Kasb-o-Kar stays disabled until explicit owner approval).
9. CRM & SMS: CRM-01…05 (SMS adapter with a sandbox/mock provider; goes live when the owner buys an SMS provider account).
10. Vision: VIS-01…06.
After each block: run the full test suite incl. Collision regression, deploy to staging, and send a Persian report listing every checklist ID of that block with status and evidence (screenshot or test name). Missing samples never stop you: mark BLOCKED with the exact file and Kasb-o-Kar path needed, and continue.

## 4. Hard rules
- Collision module logic in production must never break; regression suite green on every PR.
- Never write to Kasb-o-Kar, Arpa, a payment device or send real SMS without explicit owner approval; build these behind config flags.
- No real customer data, secrets or one-time URLs in git or logs; synthetic fixtures only (the anonymised stoppage sample may be committed).
- No bare codes and no long model descriptions in the UI (CORE-06, CORE-07).
- Every page passes QA-01…QA-03.

## 5. Acceptance week (before cutover)
On staging with live Pulse data, alongside the real dealership work:
- Night list matches the physical yard count on 5 consecutive working days.
- Final statement totals equal the release desk's handwritten receipts for several days.
- Special Assist officer works a full week in staging; invite list matches «امداد ویژه های منتظر دعوت مشتری».
- Warranty-return counts equal the official export; re-importing a file changes nothing.
- Dispatch + QR start/finish used on real vehicles for at least 3 days.
Report results in Persian; fix gaps; then request cutover approval.

## 6. Hardware and accounts the owner will provide (list them in your first report with exact models/specs you need)
Thermal label printer at reception (route label + QR), handheld barcode scanner(s) for the warehouse, tablet for the technical expert (exists), smartphones for technicians (exist), TV for the customer waiting room, optional TV for the shop floor, SMS provider account with inbound SMS, Arpa Excel import sample and later API credentials.

Start now: finish Step 1A, then do section 2 and stop for approval.
