import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { REFERENCE_FIELDS, REFERENCE_OUTCOME_LABELS, normalizePersian, normalizeVin, toLatinDigits, type ReferenceFileInput, type ReferencePreviewInput, type ReferenceKind, type ReferencePlanRow, type ReferenceImport, type ReferenceRecord, type ReferenceOutcome, type ReferenceField } from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { referenceEntries, referenceImports } from '../db/schema';
import { readWorkbook, writeSheet } from '../parts/xlsx';

type Entry = typeof referenceEntries.$inferSelect;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const code=(value:string)=>toLatinDigits(value).replace(/\s+/g,'').toUpperCase();
const counts=(rows:ReferencePlanRow[])=>Object.fromEntries((['new','update','unchanged','duplicate','error','conflict'] as ReferenceOutcome[]).map(o=>[o,rows.filter(r=>r.outcome===o).length])) as ReferenceImport['counts'];
const changed=(a:Record<string,string>,b:Record<string,string>)=>Object.entries(b).some(([k,v])=>v!==a[k]);

@Injectable()
export class ReferenceDataService {
 constructor(@Inject(DATABASE)private readonly handle:DatabaseHandle,private readonly audit:AuditService){}
 private get db(){return this.handle.db;}
 private allow(actor:Actor,kind:ReferenceKind,manage=false){
  const permission=`reference.${kind}.${manage?'manage':'read'}` as const;
  if(!actor.user.permissions.has(permission)||(kind==='customers'&&!actor.user.permissions.has('customer.pii.read')))throw forbidden();
 }
 private workbook(input:ReferenceFileInput){
  const bytes=Buffer.from(input.fileBase64,'base64');if(bytes.length>1_000_000)throw badRequest('REFERENCE_FILE_LARGE','فایل باید کمتر از یک مگابایت باشد؛ آن را به چند بخش تقسیم کنید');
  try{const sheets=readWorkbook(bytes);if(sheets.some(s=>s.rows.some(r=>r.length>128)))throw Error('حداکثر ۱۲۸ ستون پذیرفته می‌شود؛ فقط ستون‌های موردنیاز را نگه دارید');return sheets;}catch(e){throw badRequest('REFERENCE_FILE_INVALID',e instanceof Error?e.message:'فایل خوانده نشد');}
 }
 inspect(actor:Actor,input:ReferenceFileInput){
  this.allow(actor,input.kind,true);
  return {sheets:this.workbook(input).map((s,index)=>({index,name:s.name,rowCount:s.rows.length,rows:s.rows.slice(0,100).map((cells,i)=>({rowNo:i+1,cells:cells.map(v=>v.slice(0,80))}))}))};
 }
 private parseRow(kind:ReferenceKind,source:string[],rowNo:number,mapping:ReferencePreviewInput['mapping']):ReferencePlanRow{
  const data:ReferencePlanRow['data']={};const messages:string[]=[];
  for(const [field,col] of Object.entries(mapping)){
   if(col===undefined)continue;
   const value=source[col]?.trim()||'';if(value.length>500)messages.push(`مقدار ستون ${col+1} بیش از ۵۰۰ نویسه است`);
   if(value)data[field as ReferenceField]=normalizePersian(value);
  }
  let key='',lookupKey='';
  if(kind==='parts'){
   if(!data.partNumber||!data.description)messages.push('کد فنی و نام قطعه الزامی‌اند');
   data.partNumber=code(data.partNumber||'');key=data.partNumber;lookupKey=key;
   if(data.partNumber.length>80)messages.push('کد فنی بیش از ۸۰ نویسه است');
   if(data.quantity&&!/^\d+(?:\.\d+)?$/.test(toLatinDigits(data.quantity).replace(/,/g,'')))messages.push('موجودی باید عدد نامنفی باشد؛ مقدار نامعلوم را خالی بگذارید');
  }else{
   if(data.vin){data.vin=normalizeVin(data.vin);if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(data.vin))messages.push('VIN کامل باید ۱۷ نویسه معتبر داشته باشد');}
   if(data.chassis)data.chassis=code(data.chassis);
   lookupKey=data.vin||data.chassis||'';
   if(!lookupKey||lookupKey.length<6)messages.push('VIN کامل یا شماره شاسی حداقل شش نویسه لازم است');
   if(!data.fullName&&!data.phone)messages.push('نام مشتری یا تلفن لازم است');
   if(data.phone){const p=toLatinDigits(data.phone).replace(/[\s()-]/g,'');data.phone=p.startsWith('+98')?'0'+p.slice(3):p.startsWith('0098')?'0'+p.slice(4):p;if(!/^09\d{9}$/.test(data.phone))messages.push('تلفن همراه معتبر نیست؛ ستون تلفن را در اکسل به‌صورت متن نگه دارید');}
   // A vehicle may have several historical owners/visits. Never merge by VIN alone.
   key=hash(JSON.stringify(Object.keys(data).sort().map(k=>[k,data[k as ReferenceField]])));
  }
  return {rowNo,data,source,key,lookupKey,outcome:messages.length?'error':'new',messages,expectedVersion:null};
 }
 async preview(actor:Actor,input:ReferencePreviewInput){
  this.allow(actor,input.kind,true);
  const allowed=Object.keys(REFERENCE_FIELDS[input.kind]);const mapped=Object.keys(input.mapping);
  if(mapped.some(k=>!allowed.includes(k))||new Set(Object.values(input.mapping)).size!==mapped.length)throw badRequest('REFERENCE_MAPPING','هر ستون فقط به یک فیلد مرتبط وصل شود');
  if(input.kind==='parts'&&(!mapped.includes('partNumber')||!mapped.includes('description')))throw badRequest('REFERENCE_MAPPING','ستون کد فنی و نام قطعه را انتخاب کنید');
  if(input.kind==='customers'&&!mapped.includes('vin')&&!mapped.includes('chassis'))throw badRequest('REFERENCE_MAPPING','ستون شماره شاسی یا VIN را انتخاب کنید');
  const sheet=this.workbook(input)[input.sheetIndex];if(!sheet||!sheet.rows[input.headerRow-1]?.some(Boolean))throw badRequest('REFERENCE_SHEET','برگه یا ردیف سربرگ معتبر نیست');
  const maxCol=sheet.rows[input.headerRow-1]!.length;if(Object.values(input.mapping).some(c=>c!==undefined&&c>=maxCol))throw badRequest('REFERENCE_MAPPING','ستون انتخاب‌شده خارج از سربرگ است');
  const content=sheet.rows.slice(input.headerRow).map((r,i)=>({source:r,rowNo:input.headerRow+i+1})).filter(r=>r.source.some(Boolean));
  if(!content.length||content.length>10_000)throw badRequest('REFERENCE_ROWS','هر فایل باید بین یک تا ده هزار ردیف داده داشته باشد');
  const existing=await this.db.select().from(referenceEntries).where(and(eq(referenceEntries.tenantId,actor.user.tenantId),eq(referenceEntries.kind,input.kind)));
  const byKey=new Map(existing.map(e=>[e.identityKey,e]));
  const plans=content.map(r=>this.parseRow(input.kind,r.source,r.rowNo,input.mapping));
  const groups=new Map<string,ReferencePlanRow[]>();for(const p of plans)if(p.outcome!=='error')groups.set(p.key,[...(groups.get(p.key)||[]),p]);
  for(const group of groups.values())if(group.length>1){
   const duplicates=input.kind==='parts'?group:group.slice(1);
   for(const p of duplicates){p.outcome='duplicate';p.messages.push(`شناسه تکراری در ردیف‌های ${group.map(r=>r.rowNo).join('، ')}؛ این ردیف ثبت نمی‌شود`);}
  }
  for(const p of plans){if(p.outcome!=='new')continue;const old=byKey.get(p.key);if(old){p.expectedVersion=old.version;p.outcome=changed(old.data as Record<string,string>,p.data)?'update':'unchanged';}}
  const id=newId();
  await this.db.transaction(async tx=>{
   await tx.insert(referenceImports).values({id,tenantId:actor.user.tenantId,kind:input.kind,fileName:input.fileName,fileSha256:hash(input.fileBase64),sheetName:sheet.name,headerRow:input.headerRow,mapping:input.mapping,rows:plans,createdBy:actor.user.id,isTest:actor.user.isTestTenant});
   await this.audit.record(tx,actor,{entityType:'reference',entityId:id,action:'reference.previewed',after:{kind:input.kind,counts:counts(plans)},snapshot:{version:1,row:{id,kind:input.kind,status:'preview'}}});
  });
  return this.get(actor,id);
 }
 async get(actor:Actor,id:string):Promise<ReferenceImport>{
  const [r]=await this.db.select().from(referenceImports).where(and(eq(referenceImports.id,id),eq(referenceImports.tenantId,actor.user.tenantId)));
  if(!r)throw notFound('ورود اطلاعات پایه');this.allow(actor,r.kind as ReferenceKind,true);
  const rows=r.rows as ReferencePlanRow[];
  return {id:r.id,kind:r.kind as ReferenceKind,fileName:r.fileName,sheetName:r.sheetName,headerRow:r.headerRow,status:r.status as ReferenceImport['status'],createdAt:r.createdAt.toISOString(),appliedAt:r.appliedAt?.toISOString()||null,counts:counts(rows),rows};
 }
 async apply(actor:Actor,id:string){
  await this.db.transaction(async tx=>{
   const [imp]=await tx.select().from(referenceImports).where(and(eq(referenceImports.id,id),eq(referenceImports.tenantId,actor.user.tenantId))).for('update');
   if(!imp)throw notFound('ورود اطلاعات پایه');const kind=imp.kind as ReferenceKind;this.allow(actor,kind,true);
   if(imp.status!=='preview')throw conflict('REFERENCE_ALREADY_APPLIED','این پیش‌نمایش قبلاً ثبت شده است');
   // Serialize imports of the same kind within this dealership; prevents concurrent duplicate keys.
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actor.user.tenantId+kind}))`);
   const plans=structuredClone(imp.rows) as ReferencePlanRow[];
   for(const p of plans){
    if(!['new','update'].includes(p.outcome))continue;
    const [old]=await tx.select().from(referenceEntries).where(and(eq(referenceEntries.tenantId,actor.user.tenantId),eq(referenceEntries.kind,kind),eq(referenceEntries.identityKey,p.key))).for('update');
    if(old&& !changed(old.data as Record<string,string>,p.data)){p.outcome='unchanged';continue;}
    if((old?.version??null)!==p.expectedVersion){p.outcome='conflict';p.messages.push('اطلاعات پس از پیش‌نمایش تغییر کرده؛ فایل را دوباره پیش‌نمایش کنید');continue;}
    const entryId=old?.id||newId(),version=(old?.version||0)+1;
    const data:Record<string,string>={...(old?.data as Record<string,string>||{}),...(p.data as Record<string,string>)};
    // Keep the provenance of a quantity separately when a later file omits quantity.
    if(p.data.quantity){data._quantityImportedAt=new Date().toISOString();data._quantityFileName=imp.fileName;}
    if(old)await tx.update(referenceEntries).set({data,version,sourceImportId:id,lookupKey:p.lookupKey,updatedAt:new Date()}).where(eq(referenceEntries.id,entryId));
    else await tx.insert(referenceEntries).values({id:entryId,tenantId:actor.user.tenantId,kind,identityKey:p.key,lookupKey:p.lookupKey,data,sourceImportId:id,isTest:actor.user.isTestTenant});
    await this.audit.record(tx,actor,{entityType:'reference',entityId:entryId,action:old?'reference.updated':'reference.created',after:{kind,importId:id,rowNo:p.rowNo},snapshot:{version,row:{id:entryId,kind,sourceImportId:id,version}}});
   }
   await tx.update(referenceImports).set({rows:plans,status:'applied',appliedAt:new Date()}).where(eq(referenceImports.id,id));
   await this.audit.record(tx,actor,{entityType:'reference',entityId:id,action:'reference.applied',after:{kind,counts:counts(plans)},snapshot:{version:2,row:{id,kind,status:'applied'}}});
  });return this.get(actor,id);
 }
 async list(actor:Actor,kind:ReferenceKind){
  this.allow(actor,kind,true);
  const imports=await this.db.select({id:referenceImports.id,fileName:referenceImports.fileName,status:referenceImports.status,createdAt:referenceImports.createdAt}).from(referenceImports).where(and(eq(referenceImports.tenantId,actor.user.tenantId),eq(referenceImports.kind,kind))).orderBy(desc(referenceImports.createdAt)).limit(20);
  const [n]=await this.db.select({n:sql<number>`count(*)::int`}).from(referenceEntries).where(and(eq(referenceEntries.tenantId,actor.user.tenantId),eq(referenceEntries.kind,kind)));
  return {count:n?.n||0,imports};
 }
 async search(actor:Actor,kind:ReferenceKind,query:string):Promise<{records:ReferenceRecord[];truncated:boolean}>{
  this.allow(actor,kind);const key=code(query);
  if(kind==='customers'&&key.length<6)throw badRequest('REFERENCE_QUERY','حداقل شش نویسه شماره شاسی لازم است؛ تطبیق دقیق انجام می‌شود');
  const condition=kind==='parts'?sql`(${referenceEntries.lookupKey} like ${key.replace(/[\\%_]/g,'\\$&')+'%'} or ${referenceEntries.data}->>'description' ilike ${'%'+normalizePersian(query).replace(/[\\%_]/g,'\\$&')+'%'})`:
   sql`(${referenceEntries.lookupKey}=${key} or ${referenceEntries.data}->>'chassis'=${key} or ${referenceEntries.data}->>'vin'=${key})`;
  const found=await this.db.select({e:referenceEntries,fileName:referenceImports.fileName}).from(referenceEntries).innerJoin(referenceImports,eq(referenceImports.id,referenceEntries.sourceImportId)).where(and(eq(referenceEntries.tenantId,actor.user.tenantId),eq(referenceEntries.kind,kind),condition)).orderBy(sql`case when ${referenceEntries.lookupKey}=${key} then 0 else 1 end`,desc(referenceEntries.updatedAt),referenceEntries.id).limit(21);
  return {truncated:found.length>20,records:found.slice(0,20).map(({e,fileName})=>this.record(e,fileName))};
 }
 private record(e:Entry,fileName:string):ReferenceRecord{return {id:e.id,kind:e.kind as ReferenceKind,data:e.data as ReferenceRecord['data'],fileName,importedAt:e.updatedAt.toISOString(),version:e.version};}
 async report(actor:Actor,id:string){const imp=await this.get(actor,id);return writeSheet('نتیجه اطلاعات پایه',[['ردیف','نتیجه','پیام',...Object.values(REFERENCE_FIELDS[imp.kind])],...imp.rows.map(r=>[r.rowNo,REFERENCE_OUTCOME_LABELS[r.outcome],r.messages.join('؛ '),...Object.keys(REFERENCE_FIELDS[imp.kind]).map(k=>r.data[k as ReferenceField]||'')])]);}
 sample(actor:Actor,kind:ReferenceKind){this.allow(actor,kind,true);return writeSheet('اطلاعات پایه',[Object.values(REFERENCE_FIELDS[kind])]);}
}
