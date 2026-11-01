# Accident-repair workflow (phase 1)

Status key: **✅ implemented and tested** · **◐ partial** · **○ planned**.

## 1. Admission and case — ✅

- Each visit is a separate case with a unique number (`AC-1405-0007`). A vehicle with the same VIN is reused, so its history spans cases.
- Recorded: owner and phone, brand/model/trim/year/plate/VIN/km, **real admission time** (may be in the past) and creation time in Manage, damage description, vehicle location, responsible person, stage.
- Vehicles already in the workshop: tick "خودرو از قبل در تعمیرگاه است", enter the past admission time and current stage. Delivered cases cannot be created directly.
- Unknown fields stay empty and the case is flagged "نیازمند تکمیل" with the list of missing items.

## 2. Payment and coverage — ✅ (basic)

- Types: golden card / roadside, body insurance, personal, mixed, initially unknown.
- Implemented: golden card file number, insurer and claim number, free-text coverage notes; golden card without file number or official deadline is flagged incomplete.
- Official approval exists only when recorded in the official system; Manage stores the reference, it does not approve.
- ✅ Approved items and labour and phone/written/in-person approvals (assessment authorization, §3); customer approval for personal cases is an authorization with source "customer".
- ✅ Payer shares per case (customer / insurer / company), supplier introduced by the insurer as a part source, price differences on parts (§6), advance payment (§7).
- ○ Invoicing, settlement and accounting export (financial close, issue #12 / later finance module).

## 3. Assessment and supplements — ✅

- **Initial assessment** (version 1): assessor name and organisation, assessment time, lines with replace/repair, part number, quantity, unit price, labour amount and labour department, evidence reference. Amounts are whole Rials. Starting it moves a case in "پذیرش" to "کارشناسی".
- **Draft → final**: lines are edited only in the draft; finalizing freezes the lines and totals. A final version cannot be changed — any change is a supplement.
- **Authorization**: a final version that needs authorization opens an «مجوز» blocker on the case (start = assessment time, or discovery time for hidden damage). Only recording the decision closes it; it cannot be resolved by hand. The decision records source (golden-card system / insurer / customer), method, **official reference (required for golden card and insurer)**, time and note. Partial approval marks rejected lines; the approved amount excludes them. Finalizing the initial assessment moves a case in "پذیرش/کارشناسی" to "در انتظار مجوز / تأیید". Manage records the decision; it never issues it.
- **Supplement (الحاقیه) after hidden damage**: requires a description and the discovery time. It copies the previous version's lines into a new draft; added or edited lines are marked «جدید» / «تغییرکرده» and need a fresh decision, unchanged lines keep theirs. On finalize the previous version becomes «جایگزین‌شده» and stays exactly as approved; its pending wait (if any) is closed. A supplement that only removes lines needs no new authorization. Finalizing can move the internal **forecast** (audited); the **official deadline is never changed** here.
- Costs: totals per version, difference to the previous version, approved amount. A supplement that raises the cost is flagged for financial re-approval; the financial gate itself is issue #10.
- Parts: the replace lines of the current version are the parts needs that the parts module (#9) will consume.
- No delivery while an authorization is pending (open blocker); repair work that does not depend on it continues.

## 4. Division of work and follow-up — ✅

- Departments are configurable per tenant (seeded: body, paint, mechanical, electrical/battery, suspension, assembly/disassembly, QC).
- Each activity: department, technician name/code, dependencies, planned and actual start/end, status, weight, notes.
- Phase 1: only the supervisor records status. Actions: **شروع** (blocked until prerequisites are done), **ثبت مانع**, **اتمام**, **تأیید سرپرست**, **بازگشایی** (reason required, for corrective work). Parallel and sequential work both supported; cycles rejected.
- Routine actions are one click with the current time; "ثبت با زمان دیگر" records a past time when the supervisor logs afterwards.
- Starting the first activity moves a pre-repair case to "در حال تعمیر" automatically (audited as automatic).
- Progress % is weighted by activity weight, not a count of ticks.

## 5. Scheduling and capacity — ◐

- ✅ Three independent times on every case: official deadline / commitment, internal forecast, actual delivery. Changing the official deadline or admission time requires a reason (audited). The forecast never overwrites the official deadline.
- ○ Rule-based forecast from capacity, dependencies, parts and working hours (delivery 3); AI forecasting only after real data exists.

## 6. Parts and supply — ✅

- **Need**: from the authorized "replace" lines of the current assessment («ثبت از کارشناسی»; each line once, followed across supplements), manually, or by **Excel import** (.xlsx, first row = column titles: شرح قطعه، شماره فنی، تعداد، منبع، قیمت تأییدشده واحد (ریال)، توضیح). Import always shows a preview; a file with any error imports nothing. A synthetic sample is downloadable from the import dialog.
- **Source**: company part (Iran Khodro), dealership stock, authorized external purchase, supplier introduced by the insurer, customer-supplied.
- **Steps, each with its own time**: stock check → reservation (stock) or order (supplier, order number, unit price, ETA; the first ETA is kept when it moves) → receipt with inspection (correct / wrong / defective; wrong or defective requires a note and goes back to re-order) → handover to the repair unit (unit and recipient) or cancel (reason).
- **Controls when ordering**: the assessment line must be authorized (a line changed by a pending supplement cannot be ordered); a price above the approved unit price needs the assessor's name and approval reference (or a supplement); purchases pass the financial gate (§7). Stock reservation and customer-supplied parts are not purchases.
- **Link to delays**: a "part not arrived" / "wrong or defective part" blocker can name the part. Recording its handover resolves the blocker and returns the activity to work. Reporting "not arrived" for a part whose handover is recorded is refused with a discrepancy message (full discrepancy review: issue #11).
- Dashboard and case list: overdue parts (ETA passed) and parts not yet ordered.

## 7. Financial control — ✅ (purchase gate)

- **Estimate** = approved amount of the current final assessment version. **Customer share** is recorded per case, or derived: personal = whole estimate, golden card / insurance = 0, mixed / unknown = must be recorded.
- **Advance**: expert (or supervisor/manager) proposes amount and reason → **service manager approves** → **cashier confirms receipt** with a payment reference. The approver is never the proposer (enforced by the API, not only hidden in the UI).
- **Exception**: purchases without the advance up to a recorded limit, with reason, approved by a service manager other than the proposer; spending against it is tracked.
- **Gate**: only **part purchases** are held. Documentation, planning, stock reservation, customer-supplied parts and repair activities continue. Open when: no customer share, or a paid advance covers the current estimate, or an approved exception has enough limit left. A supplement that raises the estimate closes the gate again ("re-approval required").
- Finance panel: estimate, shares, received, balance, committed purchases, approvals with who/when.
- ○ Costly *labour* gating needs labour cost per activity (later); invoicing and settlement: issue #12.

## 8. Delay accountability — ◐

- ✅ Blockers with reason, description, **occurrence time**, **recording time** (gap shown as "X بعد از بروز"), follow-ups (count + last time) and resolution (who, when, note). Resolving the last blocker on an activity returns it to its previous state.
- ✅ Dashboard: open blockers by reason, blockers without follow-up for 24 h, department load.
- ○ Discrepancy check "part not arrived" vs recorded handover to the unit (needs the parts module). It raises an item for manager review, never an automatic verdict.
- ✅ Audit records cannot be edited or deleted (database trigger).

## 9. Completion — ◐

- ✅ Delivery gate: a case can move to "تحویل‌شده" only when every activity is approved by the supervisor and no blocker is open; actual delivery time and technical close time are recorded.
- ○ QC checklist and corrective activity, parts/labour reconciliation, supplement reconciliation, financial settlement as a separate gate, recipient and handover confirmation, archive (delivery 2).

## Roles (phase 1)

| Role | Can |
| --- | --- |
| کارشناس تصادفات | Create/edit cases, see customer contact, report case-level blockers, read timeline |
| سرپرست تصادفات | Above + manage activities, approve completion, follow up / resolve blockers |
| مدیر خدمات | Everything above, all cases, settings |
| قطعات، کنترل کیفیت | Read cases (phone masked), report blockers |
| مالی و صندوق | Read cases with contact details |
| مدیر سیستم | Account administration only — no access to customer cases |
