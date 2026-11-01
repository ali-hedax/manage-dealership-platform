import type {
  AssessmentItemAction,
  AssessmentKind,
  AssessmentStatus,
  AuthorizationMethod,
  AuthorizationSource,
  AuthorizationStatus,
  BlockerReason,
  ItemApprovalStatus,
  CaseStage,
  CaseStatus,
  CoverageType,
  ModuleKey,
  Role,
  TaskStatus,
} from './enums';

export const ROLE_LABELS: Record<Role, string> = {
  accident_expert: 'کارشناس تصادفات',
  accident_supervisor: 'سرپرست تصادفات',
  service_manager: 'مدیر خدمات',
  parts_clerk: 'قطعات',
  cashier: 'مالی و صندوق',
  qc_inspector: 'کنترل کیفیت',
  system_admin: 'مدیر سیستم',
};

export const COVERAGE_LABELS: Record<CoverageType, string> = {
  golden_card: 'کارت طلایی / امداد خودرو',
  insurance: 'بیمه بدنه',
  personal: 'شخصی (مشتری)',
  mixed: 'ترکیبی',
  unknown: 'نامشخص',
};

export const STAGE_LABELS: Record<CaseStage, string> = {
  reception: 'پذیرش',
  assessment: 'کارشناسی',
  awaiting_approval: 'در انتظار مجوز / تأیید',
  awaiting_parts: 'در انتظار قطعه',
  in_repair: 'در حال تعمیر',
  quality_control: 'کنترل کیفیت',
  ready_for_delivery: 'آماده تحویل',
  delivered: 'تحویل‌شده',
};

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: 'باز',
  closed: 'بسته',
  cancelled: 'لغوشده',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'شروع‌نشده',
  in_progress: 'در حال انجام',
  blocked: 'دارای مانع',
  done: 'اتمام (منتظر تأیید)',
  approved: 'تأییدشده',
};

export const BLOCKER_REASON_LABELS: Record<BlockerReason, string> = {
  part_not_arrived: 'قطعه نرسیده',
  part_wrong_or_defective: 'قطعه اشتباه یا معیوب',
  authorization: 'مجوز',
  financial: 'مالی / پیش‌پرداخت',
  capacity: 'ظرفیت',
  technical_issue: 'مشکل فنی',
  reassessment: 'کارشناسی مجدد',
  staffing: 'نیروی انسانی',
  customer: 'مشتری',
  no_follow_up: 'عدم پیگیری',
  other: 'سایر',
};

export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  initial: 'کارشناسی اولیه',
  supplement: 'الحاقیه',
};

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  draft: 'پیش‌نویس',
  final: 'نهایی',
  superseded: 'جایگزین‌شده با الحاقیه',
};

export const ASSESSMENT_ITEM_ACTION_LABELS: Record<AssessmentItemAction, string> = {
  replace: 'تعویض',
  repair: 'تعمیر',
};

export const AUTHORIZATION_STATUS_LABELS: Record<AuthorizationStatus, string> = {
  not_required: 'نیاز به مجوز جدید ندارد',
  pending: 'در انتظار مجوز',
  approved: 'مجوز ثبت شد',
  partially_approved: 'مجوز جزئی',
  rejected: 'مجوز رد شد',
};

export const AUTHORIZATION_SOURCE_LABELS: Record<AuthorizationSource, string> = {
  golden_card: 'سامانه کارت طلایی',
  insurer: 'شرکت بیمه',
  customer: 'مشتری',
};

export const AUTHORIZATION_METHOD_LABELS: Record<AuthorizationMethod, string> = {
  official_system: 'ثبت در سامانه رسمی',
  written: 'کتبی',
  phone: 'تلفنی',
  in_person: 'حضوری',
};

export const ITEM_APPROVAL_LABELS: Record<ItemApprovalStatus, string> = {
  pending: 'در انتظار',
  approved: 'تأییدشده',
  rejected: 'ردشده',
};

export const MODULE_LABELS: Record<ModuleKey, string> = {
  accident: 'خودروهای تصادفی',
  reception: 'پذیرش و خدمات عمومی',
  periodic_service: 'سرویس دوره‌ای و تعمیرات عادی',
  warranty: 'گارانتی',
  parts_inventory: 'انبار، قطعات و تأمین‌کنندگان',
  finance: 'مالی پیشرفته و حسابداری',
  workforce: 'کارکنان، ظرفیت و کارتابل تکنسین',
  customer_comms: 'اطلاع‌رسانی و رضایت مشتری',
  multi_dealership: 'چندنمایندگی و چندبرند',
  integrations: 'اتصال به سامانه‌های رسمی',
  ai_assistant: 'دستیار هوشمند',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'case.created': 'ایجاد پرونده',
  'case.updated': 'ویرایش پرونده',
  'case.stage_changed': 'تغییر مرحله',
  'task.created': 'ایجاد فعالیت',
  'task.updated': 'ویرایش فعالیت',
  'task.started': 'شروع فعالیت',
  'task.completed': 'اتمام فعالیت',
  'task.approved': 'تأیید سرپرست',
  'task.reopened': 'بازگشایی فعالیت',
  'task.blocked': 'ثبت مانع',
  'blocker.created': 'ثبت مانع',
  'blocker.acknowledged': 'اقدام روی مانع',
  'blocker.resolved': 'رفع مانع',
  'assessment.created': 'شروع کارشناسی',
  'assessment.supplement_created': 'شروع الحاقیه (آسیب پنهان)',
  'assessment.item_added': 'افزودن قلم کارشناسی',
  'assessment.item_updated': 'ویرایش قلم کارشناسی',
  'assessment.item_removed': 'حذف قلم از پیش‌نویس',
  'assessment.finalized': 'نهایی‌شدن کارشناسی',
  'assessment.superseded': 'جایگزینی با الحاقیه',
  'assessment.authorization_recorded': 'ثبت مجوز',
};

// Keys produced by the API in CaseListItem.missingFields ('نیازمند تکمیل').
export const MISSING_FIELD_LABELS: Record<string, string> = {
  customer_name: 'نام مالک',
  customer_phone: 'تلفن مالک',
  vehicle_model: 'مدل خودرو',
  vehicle_identity: 'پلاک یا VIN',
  odometer: 'کیلومتر',
  damage_description: 'شرح خسارت',
  responsible: 'مسئول پرونده',
  coverage_type: 'نوع پوشش',
  golden_card_file_no: 'شماره پرونده کارت طلایی',
  official_deadline: 'مهلت رسمی',
  insurer: 'شرکت بیمه',
  insurance_claim_no: 'شماره خسارت بیمه',
};
