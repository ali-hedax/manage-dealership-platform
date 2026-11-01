# Accident-repair workflow (phase 1)

Status key: **✅ implemented and tested** · **◐ partial** · **○ planned**.

## 1. Admission and case — ✅

- Each visit is a separate case with a unique number (`AC-1405-0007`). A vehicle with the same VIN is reused, so its history spans cases.
- Recorded: owner and phone, brand/model/trim/year/plate/VIN/km, **real admission time** (may be in the past) and creation time in Manage, damage description, vehicle location, responsible person, stage.
- Vehicles already in the workshop: tick "خودرو از قبل در تعمیرگاه است", enter the past admission time and current stage. Delivered cases cannot be created directly.
- Unknown fields stay empty and the case is flagged "نیازمند تکمیل" with the list of missing items.

## 2. Payment and coverage — ◐

- Types: golden card / roadside, body insurance, personal, mixed, initially unknown.
- Implemented: golden card file number, insurer and claim number, free-text coverage notes; golden card without file number or official deadline is flagged incomplete.
- Official approval exists only when recorded in the official system; Manage stores the reference, it does not approve.
- ○ Approved items/labour, insurer vs customer share, price differences, phone/written approvals, supplier introduced by insurer, advance payment and customer approval for personal cases (delivery 2).

## 3. Assessment and supplements — ○ (delivery 2)

Versioned assessments with items (part number, qty, price, labour by unit, authorization, evidence, assessor); supplements on hidden damage keep the previous version and request new approvals.

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

## 6. Parts and supply — ○ (delivery 2)

Need → stock check → reservation → authorized source → price → request/authorization → order → ETA → receipt → quality check → handover to the repair unit, with times. Manual entry and Excel import first.

## 7. Financial control — ○ (delivery 2)

Expert proposes advance payment → service manager approves spending → cashier confirms receipt. Missing advance blocks only parts purchase and costly work; documentation and planning continue. Exceptions need a recorded approval with limit and reason. No user approves their own proposal.

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
