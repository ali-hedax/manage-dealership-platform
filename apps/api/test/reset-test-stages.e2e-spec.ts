import { and, eq, inArray, ne } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { assessments, auditEvents, cases, customers, emdadRequests, partRequests, tasks, tenants, vehicles } from '../src/db/schema';
import { DEMO_TENANT_CODE } from '../src/demo/demo-seed.service';
import { parseArgs, resetTestStages, type SqlClient } from '../src/maintenance/reset-test-stages';
import { createHarness, type Harness } from './harness';

// Task 1 on the synthetic 20-car demo fleet (every stage present). PGlite here;
// the same SQL runs on PostgreSQL through the compiled script.
let h: Harness;
let client: SqlClient;
beforeAll(async () => {
  h = await createHarness({ withCases: true, fleet: true, config: { DEMO_OWNER_USERNAME: 'manager' } });
  client = (h.db.db as unknown as { $client: SqlClient }).$client;
}, 180_000);
afterAll(async () => {
  await h?.close();
});

const count = async (table: PgTable) => (await h.db.db.select().from(table)).length;
const opts = (over: Partial<Parameters<typeof resetTestStages>[1]> = {}) => ({ tenantCode: DEMO_TENANT_CODE, actorUsername: 'admin', exclude: [], execute: false, reason: 'آزمون', ...over });

it('refuses unsafe use: no confirmation, an unknown excluded case, or an actor who is not owner/system admin', async () => {
  expect(() => parseArgs(['--tenant', 'demo', '--actor', 'admin', '--execute'])).toThrow('--confirm');
  expect(() => parseArgs(['--tenant', 'demo', '--actor', 'admin', '--execute', '--confirm', 'other'])).toThrow('--confirm');
  expect(parseArgs(['--tenant', 'demo', '--actor', 'admin', '--exclude', 'A-1, A-2'])).toMatchObject({ execute: false, exclude: ['A-1', 'A-2'] });
  const parts = await count(partRequests);
  await expect(resetTestStages(client, opts({ exclude: ['NO-SUCH-CASE'], execute: true }))).rejects.toThrow('not found');
  await expect(resetTestStages(client, opts({ actorUsername: 'expert', execute: true }))).rejects.toThrow('owner or system administrator');
  expect((await resetTestStages(client, opts({ actorUsername: '@owner' }))).executed).toBe(false);
  expect(await count(partRequests)).toBe(parts);
});

it('dry run reports exactly what would change and changes nothing', async () => {
  const before = { parts: await count(partRequests), tasks: await count(tasks), assessments: await count(assessments) };
  expect(before.parts).toBeGreaterThan(10);
  const report = await resetTestStages(client, opts());
  expect(report).toMatchObject({ executed: false, keepFingerprintsEqual: true, auditEventId: null });
  expect(report.deleted.part_requests).toBe(before.parts);
  expect(report.deleted.tasks).toBe(before.tasks);
  expect(report.deleted.assessments).toBe(before.assessments);
  expect(report.cases.length).toBe(report.casesInScope);
  expect(report.cases.some((c) => c.stage !== 'reception' && c.parts > 0)).toBe(true);
  expect({ parts: await count(partRequests), tasks: await count(tasks), assessments: await count(assessments) }).toEqual(before);
});

it('keeps the case, intake, people and an excluded case; removes every trial stage; is repeatable and audited', async () => {
  const [tenant] = await h.db.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, DEMO_TENANT_CODE));
  const all = await h.db.db.select().from(cases).where(eq(cases.tenantId, tenant!.id));
  const withParts = new Set((await h.db.db.select({ caseId: partRequests.caseId }).from(partRequests)).map((p) => p.caseId));
  const kept = all.find((c) => withParts.has(c.id) && c.stage !== 'reception')!;
  const keptParts = (await h.db.db.select().from(partRequests).where(eq(partRequests.caseId, kept.id))).length;
  const people = { customers: await count(customers), vehicles: await count(vehicles), cases: all.length, emdad: await count(emdadRequests) };

  const report = await resetTestStages(client, opts({ exclude: [kept.caseNumber], execute: true }));
  expect(report).toMatchObject({ executed: true, casesInScope: all.length - 1, excluded: [kept.caseNumber], keepFingerprintsEqual: true });
  expect(report.reset.cases).toBe(all.length - 1);

  // Kept: every case, customer, vehicle and Emdad report line; the excluded case is untouched.
  expect({ customers: await count(customers), vehicles: await count(vehicles), cases: (await h.db.db.select().from(cases).where(eq(cases.tenantId, tenant!.id))).length, emdad: await count(emdadRequests) }).toEqual(people);
  const [excludedNow] = await h.db.db.select().from(cases).where(eq(cases.id, kept.id));
  expect(excludedNow).toMatchObject({ stage: kept.stage, status: kept.status, version: kept.version });
  expect((await h.db.db.select().from(partRequests).where(eq(partRequests.caseId, kept.id))).length).toBe(keptParts);
  // Removed: every stage record of the other cases; they are back at reception, with identity unchanged.
  const others = all.filter((c) => c.id !== kept.id).map((c) => c.id);
  expect(await h.db.db.select().from(partRequests).where(inArray(partRequests.caseId, others))).toHaveLength(0);
  expect(await h.db.db.select().from(tasks).where(inArray(tasks.caseId, others))).toHaveLength(0);
  expect(await h.db.db.select().from(assessments).where(inArray(assessments.caseId, others))).toHaveLength(0);
  const resetCases = await h.db.db.select().from(cases).where(inArray(cases.id, others));
  expect(resetCases.every((c) => c.stage === 'reception' && c.status === 'open' && c.repairPlan === null && c.actualDeliveryAt === null && c.technicalClosedAt === null)).toBe(true);
  for (const c of resetCases) {
    const was = all.find((x) => x.id === c.id)!;
    expect({ n: c.caseNumber, a: c.admissionNo, v: c.vehicleId, cu: c.customerId, cov: c.coverageType, r: c.responsibleUserId, at: c.admittedAt }).toEqual({ n: was.caseNumber, a: was.admissionNo, v: was.vehicleId, cu: was.customerId, cov: was.coverageType, r: was.responsibleUserId, at: was.admittedAt });
  }
  // Emdad lines of reset cases are unlinked, not deleted.
  expect(await h.db.db.select().from(emdadRequests).where(and(inArray(emdadRequests.caseId, others)))).toHaveLength(0);

  // One audit row with who, when and what; earlier audit history is untouched.
  const audit = await h.db.db.select().from(auditEvents).where(eq(auditEvents.action, 'maintenance.test_stages_reset'));
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({ id: report.auditEventId, tenantId: tenant!.id, reason: 'آزمون' });
  expect((await h.db.db.select().from(auditEvents).where(ne(auditEvents.action, 'maintenance.test_stages_reset'))).length).toBeGreaterThan(0);

  // Running again finds nothing more to delete.
  const again = await resetTestStages(client, opts({ exclude: [kept.caseNumber] }));
  expect(Object.values(again.deleted).every((n) => n === 0)).toBe(true);
}, 180_000);
