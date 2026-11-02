import { z } from 'zod';
import {
  ASSESSMENT_ITEM_ACTIONS,
  ASSESSMENT_KINDS,
  AUTHORIZATION_DECISIONS,
  AUTHORIZATION_METHODS,
  AUTHORIZATION_SOURCES,
  BLOCKER_REASONS,
  FINANCE_APPROVAL_KINDS,
  PART_ACTIONS,
  PART_INSPECTIONS,
  PART_SOURCES,
  PART_STATUSES,
  QC_CHECK_ITEMS,
  QC_RESULTS,
  QC_SAFETY_ITEMS,
  IMPORT_DEADLINE_TARGETS,
  DISCREPANCY_STATUSES,
  REPORT_PERIODS,
  REPORT_VIEWS,
  RECIPIENT_RELATIONS,
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
  'awaiting_authorization',
  'parts_overdue',
  'parts_to_order',
  'finance_pending',
  'overdue_official',
  'overdue_forecast',
  'no_deadline',
] as const;
export type CaseFlag = (typeof CASE_FLAGS)[number];

export const caseListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  stage: z.enum(CASE_STAGES).optional(),
  coverage: z.enum(COVERAGE_TYPES).optional(),
  status: z.enum([...CASE_STATUSES, 'all']).default('open'),
  flag: z.enum(CASE_FLAGS).optional(),
  blockerReason: z.enum(BLOCKER_REASONS).optional(),
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
  // "Part not arrived": the part request it waits for; handover resolves it.
  partRequestId: uuid.nullish(),
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

export const createPartSchema = z.object({
  description: z.string().trim().min(1).max(300),
  partNumber: optionalText(64),
  quantity: z.number().int().min(1).max(999).default(1),
  source: z.enum(PART_SOURCES),
  // Price accepted by the payer (assessment line); purchases above it need approval.
  approvedUnitPriceRial: rial.nullish(),
  notes: optionalText(1000),
});
export type CreatePartInput = z.infer<typeof createPartSchema>;

export const partsFromAssessmentSchema = z.object({
  source: z.enum(PART_SOURCES).optional(),
});
export type PartsFromAssessmentInput = z.infer<typeof partsFromAssessmentSchema>;

export const importPartsSchema = z.object({
  // .xlsx file as base64 (max ~1 MB).
  fileBase64: z.string().min(1).max(1_400_000),
  dryRun: z.boolean().default(true),
});
export type ImportPartsInput = z.infer<typeof importPartsSchema>;

export const partActionSchema = z
  .object({
    action: z.enum(PART_ACTIONS),
    expectedVersion: z.number().int().min(1),
    at: optionalIsoDate,
    note: optionalText(1000),
    // check_stock
    inStock: z.boolean().optional(),
    // order
    source: z.enum(PART_SOURCES).optional(),
    supplier: optionalText(120),
    orderRef: optionalText(64),
    unitPriceRial: rial.optional(),
    etaAt: optionalIsoDate,
    priceApprovalRef: optionalText(64),
    priceApprovedBy: optionalText(120),
    // receive
    receiptDocNo: optionalText(64),
    inspection: z.enum(PART_INSPECTIONS).optional(),
    // hand_over
    departmentId: uuid.nullish(),
    recipientName: optionalText(120),
  })
  .refine((v) => v.action !== 'check_stock' || v.inStock !== undefined, {
    message: 'نتیجه بررسی موجودی را مشخص کنید',
    path: ['inStock'],
  })
  .refine((v) => v.action !== 'update_eta' || !!v.etaAt, { message: 'زمان جدید رسیدن قطعه الزامی است', path: ['etaAt'] })
  .refine((v) => v.action !== 'receive' || !!v.inspection, {
    message: 'نتیجه کنترل قطعه هنگام رسید الزامی است',
    path: ['inspection'],
  })
  .refine((v) => v.action !== 'receive' || v.inspection === 'ok' || !!v.note, {
    message: 'برای قطعه اشتباه یا معیوب توضیح الزامی است',
    path: ['note'],
  })
  .refine((v) => v.action !== 'hand_over' || !!v.recipientName, {
    message: 'نام تحویل‌گیرنده در واحد تعمیر الزامی است',
    path: ['recipientName'],
  })
  .refine((v) => v.action !== 'cancel' || !!v.note, { message: 'برای لغو ذکر دلیل الزامی است', path: ['note'] });
export type PartActionInput = z.infer<typeof partActionSchema>;

export const financeSharesSchema = z.object({
  // Payer split of the estimate; null = not decided yet.
  customerShareRial: rial.nullable(),
  insurerShareRial: rial.nullable(),
  companyShareRial: rial.nullable(),
  note: optionalText(1000),
  // Omit when the case has no shares recorded yet.
  expectedVersion: z.number().int().min(1).optional(),
});
export type FinanceSharesInput = z.infer<typeof financeSharesSchema>;

export const proposeFinanceSchema = z.object({
  kind: z.enum(FINANCE_APPROVAL_KINDS),
  // Advance amount, or the spending limit of an exception.
  amountRial: rial.refine((v) => v > 0, 'مبلغ باید بیشتر از صفر باشد'),
  reason: z.string().trim().min(1).max(1000),
});
export type ProposeFinanceInput = z.infer<typeof proposeFinanceSchema>;

export const financeDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    expectedVersion: z.number().int().min(1),
    note: optionalText(1000),
  })
  .refine((v) => v.decision === 'approve' || !!v.note, { message: 'برای رد ذکر دلیل الزامی است', path: ['note'] });
export type FinanceDecisionInput = z.infer<typeof financeDecisionSchema>;

export const financePaymentSchema = z.object({
  expectedVersion: z.number().int().min(1),
  paymentRef: z.string().trim().min(1).max(64),
  at: optionalIsoDate,
});
export type FinancePaymentInput = z.infer<typeof financePaymentSchema>;

export const settlementPaymentSchema = z.object({
  amountRial: rial.refine((v) => v > 0, 'مبلغ باید بیشتر از صفر باشد'),
  paymentRef: z.string().trim().min(1).max(64),
  at: optionalIsoDate,
  note: optionalText(500),
});
export type SettlementPaymentInput = z.infer<typeof settlementPaymentSchema>;

// ------------------------------------------------- QC, closes and delivery

export const qcCheckSchema = z
  .object({
    item: z.enum(QC_CHECK_ITEMS),
    result: z.enum(QC_RESULTS),
    note: optionalText(500),
    // Unit that does the corrective work for a failed item.
    departmentId: uuid.nullish(),
  })
  .refine((v) => v.result !== 'fail' || !!v.note, { message: 'برای مورد ردشده شرح ایراد الزامی است', path: ['note'] })
  .refine((v) => v.result !== 'fail' || !!v.departmentId, {
    message: 'برای مورد ردشده واحد انجام کار اصلاحی را انتخاب کنید',
    path: ['departmentId'],
  })
  .refine((v) => v.result !== 'na' || !QC_SAFETY_ITEMS.includes(v.item), {
    message: 'موارد ایمنی باید بازبینی شوند و «بررسی نشد» برای آن‌ها پذیرفته نیست',
    path: ['result'],
  });
export type QcCheckInput = z.infer<typeof qcCheckSchema>;

export const recordQcSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    checks: z.array(qcCheckSchema).length(QC_CHECK_ITEMS.length),
    at: optionalIsoDate,
    note: optionalText(1000),
  })
  .refine((v) => new Set(v.checks.map((c) => c.item)).size === QC_CHECK_ITEMS.length, {
    message: 'همه موارد چک‌لیست کنترل کیفیت باید یک بار تعیین شوند',
    path: ['checks'],
  });
export type RecordQcInput = z.infer<typeof recordQcSchema>;

export const technicalCloseSchema = z.object({
  expectedVersion: z.number().int().min(1),
  note: optionalText(1000),
});
export type TechnicalCloseInput = z.infer<typeof technicalCloseSchema>;

export const financialCloseSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    // Close although part of the customer share is unpaid (manager only, reason required).
    waiveBalance: z.boolean().default(false),
    note: optionalText(1000),
  })
  .refine((v) => !v.waiveBalance || !!v.note, {
    message: 'برای بستن با مانده بدهی ذکر دلیل الزامی است',
    path: ['note'],
  });
export type FinancialCloseInput = z.infer<typeof financialCloseSchema>;

export const deliverySchema = z.object({
  expectedVersion: z.number().int().min(1),
  recipientName: z.string().trim().min(2).max(120),
  recipientRelation: z.enum(RECIPIENT_RELATIONS),
  // Recipient checked the vehicle and confirmed the handover (signed form).
  handoverConfirmed: z.literal(true, { error: 'تأیید تحویل‌گیرنده الزامی است' }),
  at: optionalIsoDate,
  note: optionalText(1000),
});
export type DeliveryInput = z.infer<typeof deliverySchema>;

// ------------------------------------------------- existing-vehicle import

export const vehicleImportDecisionsSchema = z.object({
  // Rows with a date but no time: record the day only (time shown as unknown).
  dateWithoutTime: z.boolean().default(false),
  deadlineAs: z.enum(IMPORT_DEADLINE_TARGETS).default('none'),
});
export type VehicleImportDecisions = z.infer<typeof vehicleImportDecisionsSchema>;

export const vehicleImportSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  // base64 of an .xlsx up to ~1 MB.
  fileBase64: z.string().min(1).max(1_400_000),
  decisions: vehicleImportDecisionsSchema.default({ dateWithoutTime: false, deadlineAs: 'none' }),
});
export type VehicleImportInput = z.infer<typeof vehicleImportSchema>;

// ------------------------------------------------------------------ reports

const jalaliDay = z
  .string()
  .trim()
  .regex(/^[0-9۰-۹]{4}[/-][0-9۰-۹]{1,2}[/-][0-9۰-۹]{1,2}$/, 'تاریخ را به شکل ۱۴۰۵/۰۸/۱۰ وارد کنید');

export const reportQuerySchema = z.object({
  view: z.enum(REPORT_VIEWS),
  period: z.enum(REPORT_PERIODS).default('month'),
  // Jalali days (Tehran), inclusive; only for period=custom.
  from: jalaliDay.optional(),
  to: jalaliDay.optional(),
  responsibleUserId: z.union([uuid, z.literal('me'), z.literal('none')]).optional(),
  departmentId: uuid.optional(),
  stage: z.enum(CASE_STAGES).optional(),
  coverage: z.enum(COVERAGE_TYPES).optional(),
  blockerReason: z.enum(BLOCKER_REASONS).optional(),
  partStatus: z.enum(PART_STATUSES).optional(),
  // Case number, admission number, plate, VIN or chassis.
  q: z.string().trim().max(100).optional(),
  // Work-list rows of one kind only (a KPI or chart bar opens its rows).
  kind: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

// ---------------------------------------------------- parts discrepancies

export const discrepancyListSchema = z.object({
  status: z.enum([...DISCREPANCY_STATUSES, 'active', 'all']).default('active'),
  caseId: uuid.optional(),
});
export type DiscrepancyListQuery = z.infer<typeof discrepancyListSchema>;

export const discrepancyAssignSchema = z.object({
  expectedVersion: z.number().int().min(1),
  // null releases the item back to "open".
  assigneeUserId: uuid.nullable(),
});
export type DiscrepancyAssignInput = z.infer<typeof discrepancyAssignSchema>;

export const discrepancyResolveSchema = z.object({
  expectedVersion: z.number().int().min(1),
  // resolved: the records were checked and corrected; dismissed: not a real discrepancy.
  outcome: z.enum(['resolved', 'dismissed']),
  reason: z.string().trim().min(5, 'دلیل و سابقه رسیدگی را بنویسید').max(1000),
});
export type DiscrepancyResolveInput = z.infer<typeof discrepancyResolveSchema>;
