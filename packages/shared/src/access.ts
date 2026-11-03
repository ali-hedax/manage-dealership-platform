import { z } from 'zod';
import { ROLES, type Role } from './enums';
import { PERMISSIONS, type Permission, type PermissionOverrides, type PermissionTemplates } from './permissions';

export const PERMISSION_LABELS: Record<Permission,string> = {
 'case.read':'مشاهده پرونده‌ها','case.create':'ثبت پرونده','case.update':'ویرایش پرونده و مرحله',
 'customer.pii.read':'مشاهده تلفن و اطلاعات تماس مشتری','task.manage':'ثبت و پیشبرد فعالیت تعمیر','task.approve':'تأیید فعالیت تعمیر',
 'blocker.report':'ثبت مانع','blocker.manage':'پیگیری و رفع مانع','assessment.manage':'ثبت و نهایی‌کردن کارشناسی و الحاقیه',
 'assessment.authorize':'ثبت نتیجه مجوز رسمی کارشناسی','part.request':'ثبت نیاز قطعه','part.manage':'رزرو، سفارش، دریافت و تحویل قطعه',
 'finance.propose':'پیشنهاد سهم و پیش‌پرداخت','finance.approve':'تأیید هزینه و استثنای مالی','finance.payment':'ثبت دریافت و پرداخت',
 'finance.close':'بستن مالی','qc.inspect':'ثبت کنترل کیفیت','case.technical_close':'بستن فنی','case.deliver':'ثبت تحویل خودرو',
 'case.import':'ورود خودروهای موجود از اکسل','report.manager':'گزارش جامع مدیر خدمات','dashboard.read':'مشاهده داشبورد',
 'audit.read':'مشاهده تاریخچه پرونده','user.manage':'دعوت و مدیریت کارکنان','settings.manage':'تنظیمات سامانه',
 'reference.parts.read':'جست‌وجوی کاتالوگ قطعات','reference.parts.manage':'ورود و اصلاح کاتالوگ قطعات',
 'reference.customers.read':'جست‌وجوی سوابق مشتری و خودرو','reference.customers.manage':'ورود سوابق ماهانه پذیرش',
};
export const PERMISSION_GROUPS: {title:string;permissions:Permission[]}[] = [
 {title:'پرونده و مشتری',permissions:['case.read','case.create','case.update','customer.pii.read','case.import']},
 {title:'کارشناسی و تعمیر',permissions:['assessment.manage','assessment.authorize','task.manage','task.approve','blocker.report','blocker.manage']},
 {title:'قطعات',permissions:['part.request','part.manage','reference.parts.read','reference.parts.manage']},
 {title:'مالی و صندوق',permissions:['finance.propose','finance.approve','finance.payment','finance.close']},
 {title:'کنترل کیفیت و تحویل',permissions:['qc.inspect','case.technical_close','case.deliver']},
 {title:'گزارش، اطلاعات پایه و مدیریت',permissions:['dashboard.read','report.manager','audit.read','reference.customers.read','reference.customers.manage','user.manage','settings.manage']},
];
const permissionList = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).refine(v=>new Set(v).size===v.length,'دسترسی تکراری است');
export const accessUpdateSchema = z.object({expectedVersion:z.number().int().positive(),expectedTemplateVersion:z.number().int().positive(),roles:z.array(z.enum(ROLES)).min(1).max(ROLES.length),allow:permissionList,deny:permissionList}).strict().refine(v=>!v.allow.some(p=>v.deny.includes(p)),'یک دسترسی نمی‌تواند هم مجاز و هم ممنوع باشد');
export const templateUpdateSchema = z.object({expectedVersion:z.number().int().positive(),permissions:permissionList}).strict();
export type AccessUpdate = z.infer<typeof accessUpdateSchema>;
export type TemplateUpdate = z.infer<typeof templateUpdateSchema>;
export interface StaffAccess {id:string;displayName:string;email:string|null;roles:Role[];isOwner:boolean;isActive:boolean;version:number;overrides:PermissionOverrides;permissions:Permission[]}
export interface AccessCatalog {version:number;templates:PermissionTemplates;staff:StaffAccess[]}
