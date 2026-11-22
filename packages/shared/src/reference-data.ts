import { z } from 'zod';

export const REFERENCE_KINDS = ['parts', 'customers', 'appointments'] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];
export const REFERENCE_FIELDS = {
  parts: { partNumber: 'کد فنی', description: 'نام قطعه', vehicleUse:'مصرف خودرو', quantity: 'موجودی فایل', unit: 'واحد شمارش', location: 'محل انبار' },
  customers: { chassis: 'شماره شاسی ثبت‌شده', vin: 'VIN کامل', fullName: 'نام مشتری', phone: 'تلفن همراه', plate: 'پلاک', model: 'مدل خودرو', trim: 'شرح تیپ خودرو', admissionNo: 'شماره کارت پذیرش ایران‌خودرو', customerNo: 'شماره مشتری', visitedOn: 'تاریخ سابقه (عین فایل)', isacoCode: 'کد محصول ایساکو' },
  // «لیست نوبت پذیرش» (ISACO): tracking only; Manage never creates or moves an appointment.
  appointments: { appointmentNo: 'شماره نوبت', vin: 'VIN کامل', chassis: 'شماره شاسی', admissionNo: 'شماره پذیرش', appointmentDate: 'تاریخ نوبت', appointmentTime: 'ساعت نوبت', status: 'وضعیت نوبت', serviceType: 'نوع خدمت', fullName: 'نام مشتری', phone: 'تلفن همراه', plate: 'پلاک' },
} as const;
export type ReferenceField = keyof typeof REFERENCE_FIELDS.parts | keyof typeof REFERENCE_FIELDS.customers | keyof typeof REFERENCE_FIELDS.appointments;
export const referenceFileSchema = z.object({
  kind: z.enum(REFERENCE_KINDS),
  fileName: z.string().trim().min(1).max(200).regex(/\.(xlsx|xls|xml|html?)$/i, 'فایل xlsx یا خروجی xls ایساکو را انتخاب کنید'),
  fileBase64: z.string().min(4).max(6_670_000).regex(/^[A-Za-z0-9+/]*={0,2}$/),
});
export const referencePreviewSchema = referenceFileSchema.extend({
  sheetIndex: z.number().int().min(0).max(30),
  headerRow: z.number().int().min(1).max(100),
  offset: z.number().int().min(0).max(100_000).default(0),
  mapping: z.partialRecord(z.enum(['partNumber','description','vehicleUse','quantity','unit','location','chassis','vin','fullName','phone','plate','model','trim','admissionNo','customerNo','visitedOn','isacoCode','appointmentNo','appointmentDate','appointmentTime','status','serviceType']),z.number().int().min(0).max(511)),
});
export const referenceSearchSchema = z.object({ query: z.string().trim().min(2).max(100) });
/**
 * Smart assessment catalog search scope (owner, 2026-11-22): the case's vehicle family
 * (default), one chosen catalog family, or the whole catalog. Compatibility is always
 * judged against the CASE vehicle; another scope never changes the case and marks every
 * part outside the case's family as needing a technical check.
 */
export const ASSESSMENT_SEARCH_SCOPES = ['case', 'vehicle', 'all'] as const;
export type AssessmentSearchScope = (typeof ASSESSMENT_SEARCH_SCOPES)[number];
/** Ranked results per page; later pages are read with `offset`. */
export const ASSESSMENT_SEARCH_PAGE = 100;
export const assessmentCatalogSearchSchema = z.object({
  query: z.string().trim().min(2).max(100),
  scope: z.enum(ASSESSMENT_SEARCH_SCOPES).default('case'),
  /** Catalog family key (from the case's vehicle list); required for `vehicle`. */
  family: z.string().trim().min(1).max(120).optional(),
  offset: z.number().int().min(0).max(5000).default(0),
}).refine((v) => v.scope !== 'vehicle' || !!v.family, { message: 'خودروی موردنظر را انتخاب کنید', path: ['family'] });
export type AssessmentCatalogSearchInput = z.infer<typeof assessmentCatalogSearchSchema>;
export type ReferenceFileInput = z.infer<typeof referenceFileSchema>;
export type ReferencePreviewInput = z.infer<typeof referencePreviewSchema>;
export interface ReferenceInspection { sheets: { name: string; index: number; rows: { rowNo: number; cells: string[] }[]; rowCount: number }[] }
export interface ReferenceRecord {
  id: string; kind: ReferenceKind; data: Partial<Record<ReferenceField,string>>;
  fileName: string; importedAt: string; version: number;
  caseMatches?:{id:string;caseNumber:string;admissionNo:string|null}[];
}
export type ReferenceOutcome = 'new'|'update'|'unchanged'|'duplicate'|'error'|'conflict';
export const REFERENCE_OUTCOME_LABELS:Record<ReferenceOutcome,string>={new:'جدید',update:'به‌روزرسانی',unchanged:'بدون تغییر',duplicate:'تکراری',error:'نیازمند اصلاح',conflict:'مغایرت هم‌زمانی'};
export interface ReferencePlanRow {
  rowNo: number; data: Partial<Record<ReferenceField,string>>; source: string[];
  key: string; lookupKey: string; outcome: ReferenceOutcome; messages: string[];
  expectedVersion: number | null;
}
export interface ReferenceImport {
  id: string; kind: ReferenceKind; fileName: string; sheetName: string; headerRow: number;
  status: 'preview'|'applied'; createdAt: string; appliedAt: string|null;
  counts: Record<ReferenceOutcome,number>; rows: ReferencePlanRow[];
  offset:number; totalRows:number; batchSize:number;
}

/** Header texts of the customer-history file that mean «کد محصول ایساکو» (column suggestion only; the operator confirms). */
export const ISACO_HEADER_ALIASES = ['کد محصول ایساکو', 'كد محصول ايساكو', 'کد محصول', 'كد محصول', 'کد کالای ایساکو', 'ISACO Product Code', 'ISACO Code', 'Product Code'];
/** Index of the header that names the ISACO product code, or -1. */
export function isacoHeaderIndex(headers: readonly string[]): number {
  const n = (x: string) => x.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s‌_-]+/g, '').toLowerCase();
  const wanted = ISACO_HEADER_ALIASES.map(n);
  return headers.findIndex((h) => wanted.includes(n(h ?? '')));
}

/** Normalized header text of one sheet row; the saved signature recognizes the same report next time. */
export function headerSignature(cells: readonly string[]): string {
  const n = (x: string) => x.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c_-]+/g, '').toLowerCase();
  return cells.map((c) => n(c ?? '')).filter(Boolean).join('|');
}
/** Column mapping remembered after the first confirmed import of a report layout. */
export interface SavedReferenceMapping { signature: string; headerRow: number; sheetIndex: number; mapping: Partial<Record<ReferenceField, number>>; savedAt: string }
