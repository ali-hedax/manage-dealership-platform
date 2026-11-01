import { z } from 'zod';
import {
  ASSESSMENT_ITEM_ACTIONS,
  ASSESSMENT_KINDS,
  AUTHORIZATION_DECISIONS,
  AUTHORIZATION_METHODS,
  AUTHORIZATION_SOURCES,
  BLOCKER_REASONS,
  CASE_STAGES,
  CASE_STATUSES,
  COVERAGE_TYPES,
  TASK_ACTIONS,
} from './enums';

// Request contracts validated by the API. All timestamps travel as ISO-8601
// UTC strings; the web app converts Jalali input before sending.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();

const isoDate = z.iso.datetime({ offset: true });
const optionalIsoDate = isoDate.nullish();
const uuid = z.uuid();

export const loginSchema = z.object({
  // Needed only when the same username exists in more than one dealership.
  tenantCode: z.string().trim().max(32).optional(),
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const customerInputSchema = z.object({
  fullName: optionalText(120),
  phone: optionalText(32),
});

export const vehicleInputSchema = z.object({
  brand: optionalText(60),
  model: optionalText(80),
  trim: optionalText(80),
  modelYear: z.number().int().min(1300).max(2100).nullish(),
  plate: optionalText(32),
  vin: optionalText(32),
  color: optionalText(40),
});

const caseFields = {
  customer: customerInputSchema.optional(),
  vehicle: vehicleInputSchema.optional(),
  odometerKm: z.number().int().min(0).max(5_000_000).nullish(),
  admittedAt: isoDate,
  damageDescription: optionalText(4000),
  vehicleLocation: optionalText(200),
  coverageType: z.enum(COVERAGE_TYPES),
  goldenCardFileNo: optionalText(64),
  insurerName: optionalText(120),
  insuranceClaimNo: optionalText(64),
  coverageNotes: optionalText(2000),
  responsibleUserId: uuid.nullish(),
  officialDeadlineAt: optionalIsoDate,
  forecastDeliveryAt: optionalIsoDate,
  stage: z.enum(CASE_STAGES).optional(),
  isLegacyEntry: z.boolean().optional(),
};

export const createCaseSchema = z.object({
  ...caseFields,
  coverageType: caseFields.coverageType.default('unknown'),
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z
  .object({
    ...caseFields,
    admittedAt: isoDate.optional(),
    coverageType: caseFields.coverageType.optional(),
    expectedVersion: z.number().int().min(1),
    // Required by the API when official deadline or admission time changes.
    reason: optionalText(500),
  })
  .omit({ stage: true });
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

export const changeStageSchema = z.object({
  stage: z.enum(CASE_STAGES),
  expectedVersion: z.number().int().min(1),
  note: optionalText(500),
});
export type ChangeStageInput = z.infer<typeof changeStageSchema>;

export const CASE_FLAGS = [
  'overdue',
  'due_soon',
  'blocked',
  'needs_completion',
  'unassigned',
  'ready',
  'legacy',
] as const;
export type CaseFlag = (typeof CASE_FLAGS)[number];

export const caseListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  stage: z.enum(CASE_STAGES).optional(),
  coverage: z.enum(COVERAGE_TYPES).optional(),
  status: z.enum([...CASE_STATUSES, 'all']).default('open'),
  flag: z.enum(CASE_FLAGS).optional(),
  responsibleUserId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type CaseListQuery = z.infer<typeof caseListQuerySchema>;

export const createTaskSchema = z.object({
  departmentId: uuid,
  title: optionalText(200),
  technicianName: optionalText(120),
  technicianCode: optionalText(32),
  plannedStartAt: optionalIsoDate,
  plannedEndAt: optionalIsoDate,
  dependsOn: z.array(uuid).max(20).optional(),
  weight: z.number().int().min(1).max(10).default(1),
  notes: optionalText(2000),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema
  .partial()
  .omit({ weight: true })
  .extend({
    weight: z.number().int().min(1).max(10).optional(),
    expectedVersion: z.number().int().min(1),
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskActionSchema = z
  .object({
    action: z.enum(TASK_ACTIONS),
    expectedVersion: z.number().int().min(1),
    // When the event actually happened; supervisors often record afterwards.
    at: optionalIsoDate,
    note: optionalText(1000),
  })
  .refine((v) => v.action !== 'reopen' || !!v.note, {
    message: 'برای بازگشایی فعالیت ذکر دلیل الزامی است',
    path: ['note'],
  });
export type TaskActionInput = z.infer<typeof taskActionSchema>;

export const createBlockerSchema = z.object({
  reason: z.enum(BLOCKER_REASONS),
  description: optionalText(2000),
  taskId: uuid.nullish(),
  // When the problem actually started (may be earlier than recording time).
  occurredAt: optionalIsoDate,
  // Optimistic-lock version of the task when blocking a task.
  expectedTaskVersion: z.number().int().min(1).optional(),
});
export type CreateBlockerInput = z.infer<typeof createBlockerSchema>;

export const blockerFollowUpSchema = z.object({
  note: optionalText(1000),
  at: optionalIsoDate,
});
export type BlockerFollowUpInput = z.infer<typeof blockerFollowUpSchema>;

export const resolveBlockerSchema = z.object({
  note: z.string().trim().min(1).max(1000),
  at: optionalIsoDate,
});
export type ResolveBlockerInput = z.infer<typeof resolveBlockerSchema>;

// Amounts are whole Rials (no decimals), safely below Number.MAX_SAFE_INTEGER.
const rial = z.number().int().min(0).max(1_000_000_000_000);

export const createAssessmentSchema = z
  .object({
    kind: z.enum(ASSESSMENT_KINDS),
    // External assessor (insurer / golden card expert) or the dealership expert.
    assessorName: z.string().trim().min(1).max(120),
    assessorOrg: optionalText(120),
    assessedAt: optionalIsoDate,
    // Supplement only: what was found and when it was discovered.
    reason: optionalText(2000),
    discoveredAt: optionalIsoDate,
    notes: optionalText(2000),
  })
  .refine((v) => v.kind !== 'supplement' || !!v.reason, {
    message: 'برای الحاقیه شرح آسیب پنهان الزامی است',
    path: ['reason'],
  });
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

const assessmentItemFields = {
  action: z.enum(ASSESSMENT_ITEM_ACTIONS),
  description: z.string().trim().min(1).max(300),
  partNumber: optionalText(64),
  quantity: z.number().int().min(1).max(999).default(1),
  unitPriceRial: rial.default(0),
  labourDepartmentId: uuid.nullish(),
  labourRial: rial.default(0),
  // References to photos or documents until file upload exists (issue #13).
  evidence: optionalText(1000),
};

export const assessmentItemSchema = z.object({
  ...assessmentItemFields,
  expectedVersion: z.number().int().min(1),
});
export type AssessmentItemInput = z.infer<typeof assessmentItemSchema>;

export const updateAssessmentItemSchema = z.object({
  action: assessmentItemFields.action.optional(),
  description: assessmentItemFields.description.optional(),
  partNumber: assessmentItemFields.partNumber,
  quantity: z.number().int().min(1).max(999).optional(),
  unitPriceRial: rial.optional(),
  labourDepartmentId: assessmentItemFields.labourDepartmentId,
  labourRial: rial.optional(),
  evidence: assessmentItemFields.evidence,
  expectedVersion: z.number().int().min(1),
});
export type UpdateAssessmentItemInput = z.infer<typeof updateAssessmentItemSchema>;

export const removeAssessmentItemSchema = z.object({
  expectedVersion: z.number().int().min(1),
});
export type RemoveAssessmentItemInput = z.infer<typeof removeAssessmentItemSchema>;

export const finalizeAssessmentSchema = z.object({
  expectedVersion: z.number().int().min(1),
  // A supplement usually moves the internal forecast; the official deadline
  // is changed only through the case form with a reason.
  forecastDeliveryAt: optionalIsoDate,
  note: optionalText(1000),
});
export type FinalizeAssessmentInput = z.infer<typeof finalizeAssessmentSchema>;

export const recordAuthorizationSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    decision: z.enum(AUTHORIZATION_DECISIONS),
    source: z.enum(AUTHORIZATION_SOURCES),
    method: z.enum(AUTHORIZATION_METHODS),
    // Reference number in the official system (golden card / insurer).
    reference: optionalText(64),
    at: optionalIsoDate,
    rejectedItemIds: z.array(uuid).max(200).default([]),
    note: optionalText(1000),
  })
  .refine((v) => v.source === 'customer' || !!v.reference, {
    message: 'تأیید کارت طلایی یا بیمه فقط با شماره ثبت در سامانه رسمی معتبر است',
    path: ['reference'],
  })
  .refine((v) => v.decision !== 'partially_approved' || v.rejectedItemIds.length > 0, {
    message: 'برای تأیید جزئی، اقلام ردشده را مشخص کنید',
    path: ['rejectedItemIds'],
  })
  .refine((v) => v.decision === 'approved' || !!v.note, {
    message: 'برای رد یا تأیید جزئی ذکر توضیح الزامی است',
    path: ['note'],
  });
export type RecordAuthorizationInput = z.infer<typeof recordAuthorizationSchema>;
