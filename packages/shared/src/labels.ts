import type {
  BlockerReason,
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
