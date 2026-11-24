import { z } from 'zod';
import { toLatinDigits } from './text';

export const CASE_STEPS = ['intake', 'assessment', 'plan', 'execution', 'quality', 'completion'] as const;
export type CaseStep = typeof CASE_STEPS[number];
export const CASE_STEP_LABELS: Record<CaseStep, string> = { intake: 'پذیرش', assessment: 'کارشناسی', plan: 'برنامهٔ تعمیر', execution: 'اجرای تعمیر', quality: 'کنترل کیفیت', completion: 'تکمیل پرونده و تحویل' };
export interface WorkflowRecord {
  /** QC history stays immutable; reversal metadata belongs to the versioned case. */
  qcReversals?: Record<string, { at: string; reason: string; by: string }>;
  qcTransition?: { inspectionId: string; previousStage: import('./enums').CaseStage; invoiceVersion: number;
    invoiceRequestedAt?: string; invoiceCompletedAt?: string; invoiceAssigneeId?: string | null };
  guided?: boolean;
  planConfirmedAt?: string;
  planTaskIds?: string[];
  planSignature?: string;
  invoiceRequestedAt?: string;
  invoiceCompletedAt?: string;
  invoiceAssigneeId?: string | null;
  financialClosedStatementVersion?: number;
  deductible?: { percent: number; source: 'assessment' | 'manual'; assessmentId?: string };
}
export interface CaseWorkflow {
  planConfirmed: boolean;
  current: CaseStep;
  record: WorkflowRecord;
  requirements: Record<'plan' | 'execution' | 'quality', string[]>;
  /** The same requirements as stable codes with Persian guidance (who can act, where to go). */
  blockers?: Record<'plan' | 'execution', import('./workflow-blockers').WorkflowBlocker[]>;
  invoicePending: boolean;
}
export const workflowActionSchema = z.object({
  action: z.literal('confirm_plan'), expectedVersion: z.number().int().positive(),
});
/** Percentages are explicit percentages, never a fractional multiplier. */
export function parseDeductible(value: unknown): number | null {
  const text = toLatinDigits(String(value ?? '')).replace(/\s/g, '').replace(/[٪%]$/, '').replace('٫', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
export function deductibleShare(basisRial: number, percent: number): number {
  if (!Number.isSafeInteger(basisRial) || basisRial < 0 || parseDeductible(percent) === null) throw new Error('Invalid invoice amount');
  return Number((BigInt(basisRial) * BigInt(Math.round(percent * 100)) + 5000n) / 10000n);
}
export const deductibleSchema = z.object({ percent: z.number().min(0).max(100).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-8), expectedVersion: z.number().int().positive() });
