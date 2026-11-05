import type { Assessment, CaseDetail, Department, TimelineEvent } from '@manage/shared';
import { Client, createHarness, daysAgo, daysAhead, type Harness } from './harness';
import { writeSheet } from '../src/parts/xlsx';

// Issue #8: versioned assessments and supplements (acceptance scenario 5).

let h: Harness;
let expert: Client;
let supervisor: Client;
let parts: Client;
let depts: Department[];

const dept = (code: string) => depts.find((d) => d.code === code)!.id;
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();

async function newCase(body: object = {}): Promise<CaseDetail> {
  const res = await expert.post('/cases', {
    customer: { fullName: 'مشتری آزمون کارشناسی', phone: '09000002222' },
    vehicle: { brand: 'ایران‌خودرو', model: 'تارا', vin: `TESTVIN${Math.random().toString().slice(2, 12)}` },
    odometerKm: 12000,
    admittedAt: daysAgo(2),
    damageDescription: 'تصادف از جلو',
    coverageType: 'insurance',
    insurerName: 'بیمه آزمون',
    insuranceClaimNo: 'TEST-CLAIM-1',
    officialDeadlineAt: daysAhead(10),
    ...body,
  });
  expect(res.status).toBe(201);
  return res.body;
}

const caseOf = async (id: string): Promise<CaseDetail> => (await expert.get(`/cases/${id}`)).body;

async function addItem(a: Assessment, item: object): Promise<Assessment> {
  const res = await expert.post(`/assessments/${a.id}/items`, { expectedVersion: a.version, ...item });
  expect(res.status).toBe(201);
  return res.body;
}

/** Initial assessment with a replaced bumper and body labour, finalized and approved by the insurer. */
async function approvedInitial(caseId: string): Promise<Assessment> {
  let a: Assessment = (
    await expert.post(`/cases/${caseId}/assessments`, {
      kind: 'initial',
      assessorName: 'کارشناس بیمه آزمون',
      assessorOrg: 'بیمه آزمون',
    })
  ).body;
  a = await addItem(a, {
    action: 'replace',
    description: 'سپر جلو',
    partNumber: 'TEST-PN-100',
    quantity: 1,
    unitPriceRial: 40_000_000,
    labourDepartmentId: dept('body'),
    labourRial: 5_000_000,
  });
  a = await addItem(a, {
    action: 'repair',
    description: 'صافکاری گلگیر',
    labourDepartmentId: dept('body'),
    labourRial: 8_000_000,
  });
  a = (await expert.post(`/assessments/${a.id}/finalize`, { expectedVersion: a.version })).body;
  const res = await expert.post(`/assessments/${a.id}/authorization`, {
    expectedVersion: a.version,
    decision: 'approved',
    source: 'insurer',
    method: 'official_system',
    reference: 'TEST-AUTH-1',
  });
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  h = await createHarness();
  [expert, supervisor, parts] = await Promise.all(['expert', 'supervisor', 'parts'].map((u) => h.login(u)));
  depts = (await supervisor.get('/departments')).body;
});

afterAll(async () => {
  await h?.close();
});

describe('assessment Excel import', () => {
  it('looks up a vehicle by exact identity across admissions without a fuzzy match', async () => {
    const vin = 'TESTVIN00000088A1';
    const c = await newCase({vehicle:{vin,model:'تارا'}});
    const exact = await expert.get(`/cases?status=all&vehicleIdentity=${vin}`);
    expect(exact.body.items.map((v:{id:string})=>v.id)).toEqual([c.id]);
    expect((await expert.get('/cases?status=all&vehicleIdentity=00000088A1')).body.total).toBe(0);
    expect((await expert.get('/cases?status=all&vehicleIdentity=------')).body.code).toBe('VEHICLE_IDENTITY_INVALID');
  });
  it('previews without writes, imports atomically with version/audit and rejects repeats or an unauthorized role', async () => {
    const c = await newCase();
    const a = (await expert.post(`/cases/${c.id}/assessments`, {kind:'initial',assessorName:'کارشناس آزمون'})).body as Assessment;
    const fileBase64 = Buffer.from(writeSheet('آزمون', [['شرح قطعه','شماره فنی','تعداد','فی','مبلغ'],['قطعه ساختگی','00123456','2','100','200']])).toString('base64');
    const body = {fileBase64, currency:'rial', expectedVersion:a.version, dryRun:true};
    const preview = await expert.post(`/assessments/${a.id}/import`,body);
    expect(preview.status).toBe(201); expect(preview.body.rows).toHaveLength(1); expect(preview.body.applied).toBe(false);
    expect((await expert.get(`/cases/${c.id}/assessments`)).body[0].items).toHaveLength(0);
    expect((await parts.post(`/assessments/${a.id}/import`,body)).status).toBe(403);
    const applied = await expert.post(`/assessments/${a.id}/import`,{...body,dryRun:false});
    expect(applied.status).toBe(201); expect(applied.body.applied).toBe(true);
    expect((await expert.post(`/assessments/${a.id}/import`,{...body,dryRun:false})).status).toBe(409);
    const saved = (await expert.get(`/cases/${c.id}/assessments`)).body[0] as Assessment;
    expect(saved.items).toHaveLength(1); expect(saved.authorizationStatus).not.toBe('approved');
    expect((await expert.post(`/assessments/${a.id}/import`,{...body,expectedVersion:saved.version})).body.rows[0].outcome).toBe('unchanged');
    expect((await expert.post(`/assessments/${a.id}/import`,{...body,expectedVersion:saved.version,dryRun:false})).body.applied).toBe(true);
    expect((await expert.get(`/cases/${c.id}/assessments`)).body[0].items).toHaveLength(1);
    const timeline = (await expert.get(`/cases/${c.id}/timeline`)).body as TimelineEvent[];
    expect(JSON.stringify(timeline)).toContain('assessment.items_imported');
  });
  it('does not write any valid row if another row is invalid', async () => {
    const c = await newCase();
    const a = (await expert.post(`/cases/${c.id}/assessments`,{kind:'initial',assessorName:'کارشناس آزمون'})).body as Assessment;
    const fileBase64 = Buffer.from(writeSheet('آزمون',[['شرح قطعه','شماره فنی','تعداد','فی','مبلغ'],['سالم','00123456','1','100','100'],['خطادار','00123457','0','100','100']])).toString('base64');
    expect((await expert.post(`/assessments/${a.id}/import`,{fileBase64,currency:'rial',expectedVersion:a.version,dryRun:false})).body.code).toBe('ASSESSMENT_IMPORT_INVALID');
    expect((await expert.get(`/cases/${c.id}/assessments`)).body[0].items).toHaveLength(0);
  });
});

describe('initial assessment', () => {
  it('drafts and finalizes without creating a generic authorization blocker', async () => {
    const c = await newCase();
    expect(c.stage).toBe('reception');

    let a: Assessment = (
      await expert.post(`/cases/${c.id}/assessments`, { kind: 'initial', assessorName: 'کارشناس بیمه آزمون' })
    ).body;
    expect(a.versionNo).toBe(1);
    expect(a.status).toBe('draft');
    expect((await caseOf(c.id)).stage).toBe('assessment');

    const empty = await expert.post(`/assessments/${a.id}/finalize`, { expectedVersion: a.version });
    expect(empty.body.code).toBe('EMPTY_ASSESSMENT');

    a = await addItem(a, {
      action: 'replace',
      description: 'چراغ جلو راست',
      partNumber: 'TEST-PN-200',
      quantity: 2,
      unitPriceRial: 15_000_000,
      labourDepartmentId: dept('electrical'),
      labourRial: 3_000_000,
    });
    expect(a.totals).toEqual({
      partsRial: 30_000_000,
      labourRial: 3_000_000,
      totalRial: 33_000_000,
      approvedRial: 33_000_000,
    });
    expect(a.items[0]!.labourDepartment?.id).toBe(dept('electrical'));

    const stale = await expert.post(`/assessments/${a.id}/items`, {
      expectedVersion: a.version - 1,
      action: 'repair',
      description: 'x',
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const fin = await expert.post(`/assessments/${a.id}/finalize`, { expectedVersion: a.version });
    expect(fin.status).toBe(201);
    a = fin.body;
    expect(a.status).toBe('final');
    expect(a.authorizationStatus).toBe('not_required');
    expect(a.blockerId).toBeNull();

    const kase = await caseOf(c.id);
    expect(kase.stage).toBe('assessment');
    expect(kase.blockers.filter(b=>b.reason==='authorization')).toHaveLength(0);

    // Final versions are immutable; the waiting blocker closes only with the decision.
    const edit = await expert.patch(`/assessment-items/${a.items[0]!.id}`, {
      expectedVersion: a.version,
      unitPriceRial: 1,
    });
    expect(edit.body.code).toBe('ASSESSMENT_FINAL');

    // Insurer approval is valid only with its reference in the official system.
    const noRef = await expert.post(`/assessments/${a.id}/authorization`, {
      expectedVersion: a.version,
      decision: 'approved',
      source: 'insurer',
      method: 'phone',
    });
    expect(noRef.status).toBe(400);
    expect(JSON.stringify(noRef.body.details)).toContain('reference');

    const ok = await expert.post(`/assessments/${a.id}/authorization`, {
      expectedVersion: a.version,
      decision: 'approved',
      source: 'insurer',
      method: 'official_system',
      reference: 'TEST-AUTH-2',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.authorizationStatus).toBe('approved');
    expect(ok.body.authorization.reference).toBe('TEST-AUTH-2');
    expect(ok.body.items.every((i: { approvalStatus: string }) => i.approvalStatus === 'approved')).toBe(true);
    const after = await caseOf(c.id);
    expect(after.blockers.filter(b=>b.reason==='authorization')).toHaveLength(0);

    const again = await expert.post(`/assessments/${a.id}/authorization`, {
      expectedVersion: ok.body.version,
      decision: 'approved',
      source: 'customer',
      method: 'in_person',
    });
    expect(again.body.code).toBe('AUTHORIZATION_NOT_PENDING');
  });

  it('accepts a decision recorded afterwards, but not one older than the assessment', async () => {
    const c = await newCase();
    let a: Assessment = (
      await expert.post(`/cases/${c.id}/assessments`, {
        kind: 'initial',
        assessorName: 'الف',
        assessedAt: daysAgo(1),
      })
    ).body;
    a = await addItem(a, { action: 'repair', description: 'صافکاری', labourRial: 1_000_000 });
    a = (await expert.post(`/assessments/${a.id}/finalize`, { expectedVersion: a.version })).body;
    // The wait started when the assessment was done, not when it was typed in.
    expect((await caseOf(c.id)).blockers.filter(b=>b.reason==='authorization')).toHaveLength(0);

    const body = { expectedVersion: a.version, decision: 'approved', source: 'customer', method: 'phone' };
    const tooEarly = await expert.post(`/assessments/${a.id}/authorization`, { ...body, at: daysAgo(2) });
    expect(tooEarly.body.code).toBe('INVALID_TIME');
    const decidedAt = hoursAgo(12);
    const late = await expert.post(`/assessments/${a.id}/authorization`, { ...body, at: decidedAt });
    expect(late.status).toBe(201);
    expect(late.body.authorization.at).toBe(decidedAt);
  });

  it('allows a single initial assessment and one draft at a time', async () => {
    const c = await newCase();
    const first = await expert.post(`/cases/${c.id}/assessments`, { kind: 'initial', assessorName: 'الف' });
    expect(first.status).toBe(201);
    const draft2 = await expert.post(`/cases/${c.id}/assessments`, { kind: 'initial', assessorName: 'ب' });
    expect(draft2.status).toBe(409);
    expect(draft2.body.code).toBe('ASSESSMENT_DRAFT_EXISTS');

    const c2 = await newCase();
    const early = await expert.post(`/cases/${c2.id}/assessments`, {
      kind: 'supplement',
      assessorName: 'الف',
      reason: 'آسیب پنهان',
    });
    expect(early.body.code).toBe('NO_FINAL_ASSESSMENT');
  });

  it('enforces permissions on the server', async () => {
    const c = await newCase();
    const denied = await parts.post(`/cases/${c.id}/assessments`, { kind: 'initial', assessorName: 'الف' });
    expect(denied.status).toBe(403);
    const read = await parts.get(`/cases/${c.id}/assessments`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual([]);
  });
});

describe('acceptance 5: supplement after hidden damage', () => {
  it('keeps the approved version, re-prices, moves the forecast and waits for new authorization', async () => {
    const c = await newCase({ forecastDeliveryAt: daysAhead(5) });
    const v1 = await approvedInitial(c.id);
    expect(v1.totals.totalRial).toBe(53_000_000);

    // Repair is under way when disassembly reveals a cracked radiator support.
    const task = (await supervisor.post(`/cases/${c.id}/tasks`, { departmentId: dept('body'), title: 'صافکاری' }))
      .body;
    await supervisor.post(`/tasks/${task.id}/actions`, { action: 'start', expectedVersion: task.version });
    expect((await caseOf(c.id)).stage).toBe('in_repair');

    const noReason = await expert.post(`/cases/${c.id}/assessments`, { kind: 'supplement', assessorName: 'الف' });
    expect(noReason.status).toBe(400);

    const discoveredAt = hoursAgo(3);
    let v2: Assessment = (
      await expert.post(`/cases/${c.id}/assessments`, {
        kind: 'supplement',
        assessorName: 'کارشناس بیمه آزمون',
        reason: 'پس از دمونتاژ، ترک در سینی جلو مشاهده شد',
        discoveredAt,
      })
    ).body;
    expect(v2.versionNo).toBe(2);
    expect(v2.items).toHaveLength(2);
    expect(v2.items.every((i) => !i.changed && i.originItemId)).toBe(true);

    const same = await expert.post(`/assessments/${v2.id}/finalize`, { expectedVersion: v2.version });
    expect(same.body.code).toBe('NO_CHANGES');

    v2 = await addItem(v2, {
      action: 'replace',
      description: 'سینی جلو',
      partNumber: 'TEST-PN-300',
      unitPriceRial: 25_000_000,
      labourDepartmentId: dept('body'),
      labourRial: 7_000_000,
      evidence: 'عکس شماره ۴ در پوشه پرونده',
    });
    const bumper = v2.items.find((i) => i.description === 'سپر جلو')!;
    const repriced = await expert.patch(`/assessment-items/${bumper.id}`, {
      expectedVersion: v2.version,
      unitPriceRial: 42_000_000,
    });
    expect(repriced.status).toBe(200);
    v2 = repriced.body;
    expect(v2.items.find((i) => i.id === bumper.id)!.changed).toBe(true);
    expect(v2.totals.totalRial).toBe(53_000_000 + 2_000_000 + 32_000_000);

    const newForecast = daysAhead(8);
    const fin = await expert.post(`/assessments/${v2.id}/finalize`, {
      expectedVersion: v2.version,
      forecastDeliveryAt: newForecast,
    });
    expect(fin.status).toBe(201);
    v2 = fin.body;
    expect(v2.status).toBe('final');
    expect(v2.deltaRial).toBe(34_000_000);
    expect(v2.requiresFinancialReview).toBe(true);
    expect(v2.authorizationStatus).toBe('not_required');

    // The approved version is preserved exactly.
    const versions: Assessment[] = (await expert.get(`/cases/${c.id}/assessments`)).body;
    const old = versions.find((x) => x.id === v1.id)!;
    expect(old.status).toBe('superseded');
    expect(old.authorizationStatus).toBe('approved');
    expect(old.totals.totalRial).toBe(53_000_000);
    expect(old.items.find((i) => i.description === 'سپر جلو')!.unitPriceRial).toBe(40_000_000);
    expect(old.items).toHaveLength(2);

    // Schedule: forecast moved, official deadline untouched; the wait counts from the discovery.
    const kase = await caseOf(c.id);
    expect(new Date(kase.forecastDeliveryAt!).getTime()).toBe(new Date(newForecast).getTime());
    expect(kase.officialDeadlineAt).toBe(c.officialDeadlineAt);
    expect(kase.stage).toBe('in_repair');
    expect(v2.blockerId).toBeNull();
    expect(kase.blockers.filter(b=>b.reason==='authorization')).toHaveLength(0);

    // No delivery while the supplement waits for authorization; work itself continues.
    const gate = await supervisor.post(`/cases/${c.id}/stage`, { stage: 'delivered', expectedVersion: kase.version });
    expect(gate.body.code).toBe('DELIVERY_GATE');
    expect(kase.tasks[0]!.status).toBe('in_progress');

    // Insurer approves the re-priced bumper but rejects the new radiator support.
    const support = v2.items.find((i) => i.description === 'سینی جلو')!;
    const partial = await expert.post(`/assessments/${v2.id}/authorization`, {
      expectedVersion: v2.version,
      decision: 'partially_approved',
      source: 'insurer',
      method: 'official_system',
      reference: 'TEST-AUTH-3',
      rejectedItemIds: [support.id],
      note: 'سینی جلو تعمیری تشخیص داده شد',
    });
    expect(partial.status).toBe(201);
    v2 = partial.body;
    expect(v2.authorizationStatus).toBe('partially_approved');
    expect(v2.totals.approvedRial).toBe(87_000_000 - 32_000_000);
    expect(v2.items.find((i) => i.id === support.id)!.approvalStatus).toBe('rejected');
    expect((await caseOf(c.id)).blockers.filter(b=>b.reason==='authorization')).toHaveLength(0);

    const timeline: TimelineEvent[] = (await expert.get(`/cases/${c.id}/timeline`)).body;
    const actions = timeline.map((e) => e.action);
    for (const a of [
      'assessment.supplement_created',
      'assessment.item_added',
      'assessment.item_updated',
      'assessment.finalized',
      'assessment.superseded',
      'assessment.authorization_recorded',
    ]) {
      expect(actions).toContain(a);
    }
    const priceChange = timeline.find((e) => e.action === 'assessment.item_updated')!;
    expect(priceChange.summary).toMatchObject({
      before: { unitPriceRial: 40_000_000 },
      after: { unitPriceRial: 42_000_000 },
    });
  });

  it('a supplement that only removes lines needs no new authorization', async () => {
    const c = await newCase();
    await approvedInitial(c.id);
    let v2: Assessment = (
      await expert.post(`/cases/${c.id}/assessments`, {
        kind: 'supplement',
        assessorName: 'الف',
        reason: 'گلگیر نیازی به صافکاری نداشت',
      })
    ).body;
    const fender = v2.items.find((i) => i.description === 'صافکاری گلگیر')!;
    v2 = (await expert.post(`/assessment-items/${fender.id}/remove`, { expectedVersion: v2.version })).body;
    v2 = (await expert.post(`/assessments/${v2.id}/finalize`, { expectedVersion: v2.version })).body;
    expect(v2.authorizationStatus).toBe('not_required');
    expect(v2.blockerId).toBeNull();
    expect(v2.deltaRial).toBe(-8_000_000);
    expect(v2.requiresFinancialReview).toBe(false);
    expect((await caseOf(c.id)).openBlockers).toBe(0);
  });
});
