import { z } from 'zod';

export const PICKING_BATCH_LIMIT = 300;

const selection = z.object({
  partId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  quantity: z.number().int().min(1).max(999),
  departmentId: z.uuid().nullable(),
});

export const createPickingBatchSchema = z.object({
  id: z.uuid(),
  items: z.array(selection).min(1).max(PICKING_BATCH_LIMIT).refine(
    (items) => new Set(items.map((item) => item.partId)).size === items.length,
    'هر قطعه فقط یک بار در نوبت انتخاب شود',
  ),
});

const batchVersion = z.object({ expectedVersion: z.number().int().positive() });
export const closePickingBatchSchema = z.discriminatedUnion('action', [
  batchVersion.extend({ action: z.literal('cancel') }),
  batchVersion.extend({
    action: z.literal('deliver'),
    recipientName: z.string().trim().min(1, 'نام تحویل‌گیرنده را وارد کنید').max(120),
    prices: z.array(z.object({ partId: z.uuid(), saleUnitRial: z.number().int().min(0).max(1_000_000_000_000) })).max(PICKING_BATCH_LIMIT),
  }),
]);

export type CreatePickingBatch = z.infer<typeof createPickingBatchSchema>;
export type ClosePickingBatch = z.infer<typeof closePickingBatchSchema>;
export type PickingDepartment = { id: string; name: string };

export interface PickingCandidate {
  partId: string;
  version: number;
  caseId: string;
  caseNumber: string;
  admissionNo: string | null;
  vehicle: string;
  plate: string | null;
  description: string;
  code: string;
  available: number;
  departmentId: string | null;
  saleUnitRial: number | null;
}

export interface PickingBatchLine extends PickingCandidate {
  quantity: number;
  department: string | null;
  shelves: {
    reservationId: string;
    version: number;
    code: string;
    address: string;
    quantity: number;
  }[];
}

export interface PickingBatch {
  id: string;
  version: number;
  status: 'pending' | 'delivered' | 'cancelled';
  items: PickingBatchLine[];
  createdAt: string;
  createdByName: string;
  closedAt: string | null;
  recipientName: string | null;
}
