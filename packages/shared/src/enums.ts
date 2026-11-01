// Domain vocabulary. Values are stable identifiers stored in the database and
// used in the API; Persian display labels live in labels.ts.

export const ROLES = [
  'accident_expert', // کارشناس تصادفات
  'accident_supervisor', // مسئول پیگیری / سرپرست تصادفات
  'service_manager', // مدیر خدمات
  'parts_clerk', // قطعات
  'cashier', // مالی / صندوق
  'qc_inspector', // کنترل کیفیت
  'system_admin', // مدیر سیستم
] as const;
export type Role = (typeof ROLES)[number];

export const COVERAGE_TYPES = ['golden_card', 'insurance', 'personal', 'mixed', 'unknown'] as const;
export type CoverageType = (typeof COVERAGE_TYPES)[number];

// Ordered pipeline of an accident case. Stage is set explicitly by staff in
// phase 1; later phases derive parts of it from tasks, approvals and QC.
export const CASE_STAGES = [
  'reception',
  'assessment',
  'awaiting_approval',
  'awaiting_parts',
  'in_repair',
  'quality_control',
  'ready_for_delivery',
  'delivered',
] as const;
export type CaseStage = (typeof CASE_STAGES)[number];

export const CASE_STATUSES = ['open', 'closed', 'cancelled'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const TASK_STATUSES = ['pending', 'in_progress', 'blocked', 'done', 'approved'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_ACTIONS = ['start', 'complete', 'approve', 'reopen'] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

export const BLOCKER_REASONS = [
  'part_not_arrived',
  'part_wrong_or_defective',
  'authorization',
  'financial',
  'capacity',
  'technical_issue',
  'reassessment',
  'staffing',
  'customer',
  'no_follow_up',
  'other',
] as const;
export type BlockerReason = (typeof BLOCKER_REASONS)[number];

// Assessment versions: the initial assessment and each supplement (الحاقیه)
// raised by hidden damage. A final version is immutable; a supplement is a new
// version that copies the previous items and adds or changes lines.
export const ASSESSMENT_KINDS = ['initial', 'supplement'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_STATUSES = ['draft', 'final', 'superseded'] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const ASSESSMENT_ITEM_ACTIONS = ['replace', 'repair'] as const;
export type AssessmentItemAction = (typeof ASSESSMENT_ITEM_ACTIONS)[number];

// Authorization is granted outside Manage (golden-card system, insurer,
// customer); Manage records the decision and its official reference only.
export const AUTHORIZATION_STATUSES = [
  'not_required',
  'pending',
  'approved',
  'partially_approved',
  'rejected',
] as const;
export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export const AUTHORIZATION_DECISIONS = ['approved', 'partially_approved', 'rejected'] as const;
export type AuthorizationDecision = (typeof AUTHORIZATION_DECISIONS)[number];

export const AUTHORIZATION_SOURCES = ['golden_card', 'insurer', 'customer'] as const;
export type AuthorizationSource = (typeof AUTHORIZATION_SOURCES)[number];

export const AUTHORIZATION_METHODS = ['official_system', 'written', 'phone', 'in_person'] as const;
export type AuthorizationMethod = (typeof AUTHORIZATION_METHODS)[number];

export const ITEM_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ItemApprovalStatus = (typeof ITEM_APPROVAL_STATUSES)[number];

// Default repair departments seeded per tenant; each tenant can rename,
// disable or add departments.
export const DEFAULT_DEPARTMENTS = [
  { code: 'body', name: 'صافکاری' },
  { code: 'paint', name: 'نقاشی' },
  { code: 'mechanical', name: 'مکانیکی' },
  { code: 'electrical', name: 'برق و باتری‌سازی' },
  { code: 'suspension', name: 'جلوبندی' },
  { code: 'assembly', name: 'مونتاژ و دمونتاژ' },
  { code: 'qc', name: 'کنترل کیفیت' },
] as const;

// Platform modules. Only modules marked "active" are implemented; the rest are
// visible in navigation as roadmap items and must not expose fake actions.
export const MODULES = [
  { key: 'accident', status: 'active' },
  { key: 'reception', status: 'planned' },
  { key: 'periodic_service', status: 'planned' },
  { key: 'warranty', status: 'planned' },
  { key: 'parts_inventory', status: 'planned' },
  { key: 'finance', status: 'planned' },
  { key: 'workforce', status: 'planned' },
  { key: 'customer_comms', status: 'planned' },
  { key: 'multi_dealership', status: 'planned' },
  { key: 'integrations', status: 'planned' },
  { key: 'ai_assistant', status: 'planned' },
] as const;
export type ModuleKey = (typeof MODULES)[number]['key'];
