import { z } from 'zod';

export const REFERENCE_KINDS = ['parts', 'customers'] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];
export const REFERENCE_FIELDS = {
  parts: { partNumber: 'کد فنی', description: 'نام قطعه', quantity: 'موجودی فایل', unit: 'واحد شمارش', location: 'محل انبار' },
  customers: { chassis: 'شماره شاسی ثبت‌شده', vin: 'VIN کامل', fullName: 'نام مشتری', phone: 'تلفن همراه', plate: 'پلاک', model: 'مدل خودرو', visitedOn: 'تاریخ سابقه (عین فایل)' },
} as const;
export type ReferenceField = keyof typeof REFERENCE_FIELDS.parts | keyof typeof REFERENCE_FIELDS.customers;
export const referenceFileSchema = z.object({
  kind: z.enum(REFERENCE_KINDS),
  fileName: z.string().trim().min(1).max(200).regex(/\.xlsx$/i),
  fileBase64: z.string().min(4).max(1_340_000).regex(/^[A-Za-z0-9+/]*={0,2}$/),
});
export const referencePreviewSchema = referenceFileSchema.extend({
  sheetIndex: z.number().int().min(0).max(30),
  headerRow: z.number().int().min(1).max(100),
  mapping: z.partialRecord(z.enum(['partNumber','description','quantity','unit','location','chassis','vin','fullName','phone','plate','model','visitedOn']),z.number().int().min(0).max(511)),
});
export const referenceSearchSchema = z.object({ query: z.string().trim().min(2).max(100) });
export type ReferenceFileInput = z.infer<typeof referenceFileSchema>;
export type ReferencePreviewInput = z.infer<typeof referencePreviewSchema>;
export interface ReferenceInspection { sheets: { name: string; index: number; rows: { rowNo: number; cells: string[] }[]; rowCount: number }[] }
export interface ReferenceRecord {
  id: string; kind: ReferenceKind; data: Partial<Record<ReferenceField,string>>;
  fileName: string; importedAt: string; version: number;
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
}
