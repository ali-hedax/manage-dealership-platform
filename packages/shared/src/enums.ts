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
