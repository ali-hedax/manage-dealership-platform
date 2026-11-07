import { z } from 'zod';
import { reserveSchema } from './daily-reports';
import type { CoverageType } from './enums';

const version = z.number().int().positive();
const price = z.number().int().min(0).max(1_000_000_000_000);
const ref = z.string().trim().min(1).max(64);
export const partsWorkbenchActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reserve'), expectedVersion: version, stock: reserveSchema.omit({ partRequestId: true, quantity: true }), salePriceRial: price }),
  z.object({ action: z.literal('market'), expectedVersion: version, supplier: z.string().trim().min(1).max(120), purchasePriceRial: price, salePriceRial: price.optional(), orderRef: ref.optional() }),
  z.object({ action: z.literal('emdad'), requestNo: ref, requestedAt: z.iso.datetime({ offset: true }), etaAt: z.iso.datetime({ offset: true }).optional(),
    parts: z.array(z.object({ id: z.uuid(), expectedVersion: version, companyPriceRial: price, salePriceRial: price.optional() })).min(1).max(100).refine(rows => new Set(rows.map(row => row.id)).size === rows.length) }),
  z.object({ action: z.literal('received'), expectedVersion: version, emdadId: z.uuid(), salePriceRial: price }),
  z.object({ action: z.literal('return'), expectedVersion: version, reason: z.string().trim().min(1).max(300) }),
]);
export type PartsWorkbenchAction = z.infer<typeof partsWorkbenchActionSchema>;
export const partPickupSchema = z.object({ partId: z.uuid(), expectedVersion: version });
export type PartPickup = z.infer<typeof partPickupSchema>;

export interface PartsWorkbenchLine {
  id: string;
  description: string;
  partNumber: string | null;
  quantity: number;
  version: number;
  action: 'reserve' | 'market' | 'emdad' | 'received' | 'handover' | 'follow_up';
  suggestedPriceRial: number | null;
  stock: { snapshotId: string; fullStockCode: string; locationAddress: string; available: string } | null;
  emdadId: string | null;
  emdadRef: string | null;
  emdadAverageDays: number | null;
  blocking: boolean;
  overdue: boolean;
  overdueHandover: boolean;
  /** Manage's next-step advice for the parts person, if any. */
  advice?: string | null;
}
export interface PartsWorkbench {
  counts: { decision: number; ready: number; overdueEmdad: number };
  inTransit: number;
  cards: {
    id: string;
    plate: string | null;
    model: string;
    color: string | null;
    coverage: CoverageType;
    caseNumber: string;
    waiting: string | null;
    items: PartsWorkbenchLine[];
  }[];
}

export const contractorSchema = z.object({
  name: z.string().trim().min(1).max(120), phone: z.string().trim().min(1).max(32),
  specialty: z.string().trim().min(1).max(120), active: z.boolean().default(true), expectedVersion: version.optional(),
});
export const externalWorkCreateSchema = z.object({
  departmentId: z.uuid(), title: z.string().trim().min(1).max(160),
  durationDays: z.number().min(0.25).max(180).multipleOf(0.25), plannedStartAt: z.iso.datetime({ offset: true }).optional(),
  dependsOn: z.array(z.uuid()).max(100).default([]),
});
export const externalWorkActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('coordinate'), expectedVersion: version, contractorId: z.uuid(),
    mode: z.enum(['send', 'visit']), appointmentAt: z.iso.datetime({ offset: true }), promisedAt: z.iso.datetime({ offset: true }), priceRial: price }),
  z.object({ action: z.enum(['dispatch', 'complete']), expectedVersion: version, expectedTaskVersion: version }),
]);
export const partConsumptionSchema = z.object({ expectedVersion: version, salePriceRial: price.optional() });
export const statementSendSchema = z.object({ expectedVersion: z.number().int().nonnegative() });
export const EXTERNAL_STATUS_LABELS = { pending: 'ثبت شد', coordinated: 'هماهنگ شد', dispatched: 'ارسال شد / پیمانکار آمد', done: 'منتظر تأیید', approved: 'تأیید شد' } as const;
export interface Contractor {
  id: string; name: string; phone: string; specialty: string; active: boolean; version: number;
}
export interface ExternalWork {
  id: string; caseId: string; caseNumber: string; title: string; plate: string | null; departmentId: string;
  status: keyof typeof EXTERNAL_STATUS_LABELS; contractorId: string | null; contractorName: string | null;
  mode: 'send' | 'visit' | null; appointmentAt: string | null; promisedAt: string | null;
  priceRial: number | null; overdue: boolean; version: number; taskVersion: number;
}
export interface StatementLine {
  id: string; code: string | null; description: string; quantity: number; source: string;
  priceRial: number | null; assessmentRial: number | null; reference: string | null;
}
export interface StatementSnapshot {
  caseNumber: string; plate: string | null; admissionNo: string | null; coverage: CoverageType;
  dealership: string; parts: StatementLine[]; external: StatementLine[];
}
export interface PartsStatement {
  live: StatementSnapshot;
  versions: { number: number; sentAt: string; snapshot: StatementSnapshot; added: string[]; removed: string[]; changed: string[] }[];
  unconfirmed: { id: string; description: string; version: number; priceRial: number | null }[];
  consumed: { id: string; description: string; version: number; priceRial: number | null }[];
  readyToSend: boolean;
}
export interface PartsOperationsNotice {
  caseId: string; caseNumber: string; plate: string | null; message: string; key: string;
}
