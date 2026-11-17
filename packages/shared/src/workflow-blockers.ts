import type { Permission } from './permissions';

// Persian guidance when a workflow action is blocked (owner, 2026-11-17). The API
// keeps every prerequisite and permission; it only explains the refusal with
// stable codes. Each blocker says what is missing, how to resolve it, which
// role can act, and where in the same case to go.

export const WORKFLOW_BLOCKER_CODES = [
  'ASSESSMENT_NOT_FINAL',
  'COVERAGE_UNKNOWN',
  'REPAIR_ROUTE_MISSING',
  'REPAIR_ROUTE_INCOMPLETE',
  'REPAIR_PLAN_NOT_CONFIRMED',
  'TASK_NOT_IN_PLAN',
  'DEPENDENCY_NOT_DONE',
] as const;
export type WorkflowBlockerCode = (typeof WORKFLOW_BLOCKER_CODES)[number];

/** Tab of the case folder where the blocker is resolved (matches the folder's tab keys). */
export type WorkflowBlockerTab = 'assessment' | 'plan' | 'execution';

export interface WorkflowBlocker {
  code: WorkflowBlockerCode;
  /** What is missing, in one sentence. */
  message: string;
  /** How to resolve it. */
  resolution: string;
  /** Role that can resolve it (shown to everyone else). */
  role: string;
  /** Permissions that let the current user resolve it (any one is enough). */
  permissions: Permission[];
  /** Button for an authorized user and where it goes in the same case. */
  actionLabel: string;
  target: { caseId: string; tab: WorkflowBlockerTab; anchor?: string };
}

const EXPERT = 'کارشناس تصادفات (یا مدیر سیستم)';

const GUIDE: Record<WorkflowBlockerCode, Omit<WorkflowBlocker, 'code' | 'target'> & { tab: WorkflowBlockerTab; anchor?: string }> = {
  ASSESSMENT_NOT_FINAL: {
    message: 'کارشناسی این خودرو هنوز نهایی نشده است (یا الحاقیهٔ باز دارد).',
    resolution: 'در گام «کارشناسی» اقلام را بررسی و کارشناسی یا الحاقیهٔ باز را نهایی کنید.',
    role: EXPERT, permissions: ['assessment.manage'], actionLabel: 'رفتن به کارشناسی', tab: 'assessment',
  },
  COVERAGE_UNKNOWN: {
    message: 'نوع پوشش این پرونده (کارت طلایی، بیمه یا شخصی) مشخص نشده است.',
    resolution: 'در گام «کارشناسی» نوع پوشش پرونده را انتخاب و ثبت کنید.',
    role: EXPERT, permissions: ['case.update'], actionLabel: 'تعیین نوع پوشش', tab: 'assessment',
  },
  REPAIR_ROUTE_MISSING: {
    message: 'برای شروع کار، مسیر تعمیر این خودرو باید مشخص شود.',
    resolution: 'در گام «برنامهٔ تعمیر» قدم‌های مسیر (واحد، جایگاه، تکنسین و روز کاری) را ثبت و سپس «تأیید برنامه و شروع اجرا» را بزنید.',
    role: EXPERT, permissions: ['task.manage'], actionLabel: 'تنظیم مسیر تعمیر', tab: 'plan', anchor: 'case-plan',
  },
  REPAIR_ROUTE_INCOMPLETE: {
    message: 'برای شروع کار، مسیر تعمیر این خودرو باید مشخص شود: جایگاه، تکنسین یا روز کاری همهٔ فعالیت‌ها هنوز تعیین نشده است.',
    resolution: 'در گام «برنامهٔ تعمیر» برای هر فعالیت جایگاه، تکنسین و روز کاری را کامل و برنامه را تأیید کنید.',
    role: EXPERT, permissions: ['task.manage'], actionLabel: 'تنظیم مسیر تعمیر', tab: 'plan', anchor: 'case-plan',
  },
  REPAIR_PLAN_NOT_CONFIRMED: {
    message: 'برنامهٔ تعمیر هنوز تأیید نشده یا پس از تأیید تغییر کرده است.',
    resolution: 'در گام «برنامهٔ تعمیر» مسیر را بازبینی و «تأیید برنامه و شروع اجرا» را بزنید.',
    role: EXPERT, permissions: ['case.update'], actionLabel: 'تأیید برنامهٔ تعمیر', tab: 'plan', anchor: 'case-plan',
  },
  TASK_NOT_IN_PLAN: {
    message: 'این فعالیت پس از تأیید برنامه اضافه شده و هنوز جزو برنامهٔ تأییدشده نیست.',
    resolution: 'در گام «برنامهٔ تعمیر» برنامهٔ تازه را دوباره تأیید کنید؛ کارهای در جریان دیگر متوقف نمی‌شوند.',
    role: EXPERT, permissions: ['case.update'], actionLabel: 'تأیید برنامهٔ تعمیر', tab: 'plan', anchor: 'case-plan',
  },
  DEPENDENCY_NOT_DONE: {
    message: 'فعالیت پیش‌نیاز این کار هنوز تمام و تأیید نشده است.',
    resolution: 'پس از پایان کار پیش‌نیاز، کارشناس آن را تأیید می‌کند؛ اگر این کار باید هم‌زمان انجام شود، در برنامهٔ تعمیر وابستگی را بردارید.',
    role: EXPERT, permissions: ['task.approve', 'task.manage'], actionLabel: 'رفتن به اجرای تعمیر', tab: 'execution', anchor: 'case-tasks',
  },
};

export function workflowBlocker(code: WorkflowBlockerCode, caseId: string, extra?: { message?: string }): WorkflowBlocker {
  const { tab, anchor, ...g } = GUIDE[code];
  return { code, ...g, ...(extra?.message ? { message: extra.message } : {}), target: { caseId, tab, ...(anchor ? { anchor } : {}) } };
}

/** True when a user with these permissions can resolve the blocker. */
export function canResolveBlocker(b: Pick<WorkflowBlocker, 'permissions'>, can: (p: Permission) => boolean): boolean {
  return b.permissions.some((p) => can(p));
}

/** Blockers attached to an API refusal (`details.blockers`), or an empty list. */
export function blockersOf(details: unknown): WorkflowBlocker[] {
  const list = (details as { blockers?: unknown } | null | undefined)?.blockers;
  return Array.isArray(list) ? (list.filter((b) => b && typeof b === 'object' && typeof (b as WorkflowBlocker).code === 'string') as WorkflowBlocker[]) : [];
}
