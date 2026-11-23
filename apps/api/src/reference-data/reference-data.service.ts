import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { assessmentReference, catalogFamilies, COMPATIBILITY_NOTES, fitmentCatalog, isCommonFitment, partCompatibility, partFitment, resolveVehicleFamily, scoreAssessmentCandidates, ASSESSMENT_SEARCH_PAGE, type AssessmentSearchScope, type PartCompatibility, REFERENCE_FIELDS, REFERENCE_OUTCOME_LABELS, normalizeAssessmentSearch, normalizePersian, normalizeVin, toLatinDigits, appointmentInstant, headerSignature, type SavedReferenceMapping, type ReferenceFileInput, type ReferencePreviewInput, type ReferenceKind, type ReferencePlanRow, type ReferenceImport, type ReferenceRecord, type ReferenceOutcome, type ReferenceField } from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { referenceEntries, referenceImports, cases, tenants, vehicles } from '../db/schema';
import { detectFormat, readHtmlTable, readSpreadsheetML } from '../daily-reports/spreadsheet-formats';
import { SpecialAidRecordsService } from '../special-aid/special-aid-records.service';
import { isAidVehicleKey } from '../vehicle-import/vehicle-sheet';
import { readWorkbook, writeSheet } from '../parts/xlsx';

type Entry = typeof referenceEntries.$inferSelect;
/** Catalog rows read per assessment search; when a query matches more, the response says so (`limited`). */
const SEARCH_READ_LIMIT=2000;
const COMPAT_ORDER:Record<PartCompatibility,number>={verified:0,'trim-review':1,'other-family':2,unknown:3};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const code=(value:string)=>toLatinDigits(value).replace(/\s+/g,'').toUpperCase();
const counts=(rows:ReferencePlanRow[])=>Object.fromEntries((['new','update','unchanged','duplicate','error','conflict'] as ReferenceOutcome[]).map(o=>[o,rows.filter(r=>r.outcome===o).length])) as ReferenceImport['counts'];
const changed=(a:Record<string,string>,b:Record<string,string>)=>Object.entries(b).some(([k,v])=>v!==a[k]);

/** Reads the workbook by its content: XLSX, XML Spreadsheet 2003 or an HTML table (ISACO «xls» exports). */
export function readSheets(bytes:Uint8Array):{name:string;rows:string[][]}[]{
 const format=detectFormat(bytes);
 if(format==='xlsx')return readWorkbook(bytes);
 if(format==='spreadsheetml'){const s=readSpreadsheetML(bytes,{limits:{maxRows:200_000}});return [{name:s.sheetName,rows:[...s.rows()]}];}
 if(format==='html_table'){const s=readHtmlTable(bytes);return [{name:s.sheetName,rows:s.rows}];}
 throw Error(format==='xls_binary'?'فایل xls قدیمی (باینری) خوانده نمی‌شود؛ آن را در Excel با قالب xlsx ذخیره کنید':'قالب فایل شناخته نشد؛ خروجی Excel ایساکو یا فایل xlsx را انتخاب کنید');
}

@Injectable()
export class ReferenceDataService {
 constructor(@Inject(DATABASE)private readonly handle:DatabaseHandle,private readonly audit:AuditService,private readonly aidRecords:SpecialAidRecordsService){}
 private get db(){return this.handle.db;}
 private allow(actor:Actor,kind:ReferenceKind,manage=false){
  const permission=`reference.${kind}.${manage?'manage':'read'}` as const;
  if(!actor.user.permissions.has(permission)||(kind!=='parts'&&!actor.user.permissions.has('customer.pii.read')))throw forbidden();
 }
 private workbook(input:ReferenceFileInput){
  const bytes=Buffer.from(input.fileBase64,'base64');if(bytes.length>5_000_000)throw badRequest('REFERENCE_FILE_LARGE','فایل باید کمتر از پنج مگابایت باشد');
  try{const sheets=readSheets(bytes);if(sheets.some(s=>s.rows.some(r=>r.length>128)))throw Error('حداکثر ۱۲۸ ستون پذیرفته می‌شود؛ فقط ستون‌های موردنیاز را نگه دارید');return sheets;}catch(e){throw badRequest('REFERENCE_FILE_INVALID',e instanceof Error?e.message:'فایل خوانده نشد');}
 }
 inspect(actor:Actor,input:ReferenceFileInput){
  this.allow(actor,input.kind,true);
  return {sheets:this.workbook(input).map((s,index)=>({index,name:s.name,rowCount:s.rows.length,rows:s.rows.slice(0,100).map((cells,i)=>({rowNo:i+1,cells:cells.map(v=>v.slice(0,80))}))}))};
 }
 private parseRow(kind:ReferenceKind,source:string[],rowNo:number,mapping:ReferencePreviewInput['mapping']):ReferencePlanRow{
  const data:ReferencePlanRow['data']={};const messages:string[]=[],errors:string[]=[];const fail=(message:string)=>{errors.push(message);messages.push(message);};
  for(const [field,col] of Object.entries(mapping)){
   if(col===undefined)continue;
   const value=source[col]?.trim()||'';if(value.length>1000)fail(`مقدار ستون ${col+1} بیش از ۱۰۰۰ نویسه است`);
   if(value)data[field as ReferenceField]=normalizePersian(value);
  }
  let key='',lookupKey='';
  if(kind==='parts'){
   if(!data.partNumber||!data.description)fail('کد فنی و نام قطعه الزامی‌اند');
   data.partNumber=code(data.partNumber||'');key=data.partNumber;lookupKey=key;
   if(data.partNumber.length>80)fail('کد فنی بیش از ۸۰ نویسه است');
   if(data.quantity&&!/^\d+(?:\.\d+)?$/.test(toLatinDigits(data.quantity).replace(/,/g,'')))fail('موجودی باید عدد نامنفی باشد؛ مقدار نامعلوم را خالی بگذارید');
  }else if(kind==='appointments'){
   // Same vehicle-identity rule as the special-aid dossiers (full VIN or ISACO 8-character chassis), so an appointment always finds its dossier.
   if(data.vin){data.vin=normalizeVin(data.vin);if(!isAidVehicleKey(data.vin))fail('VIN کامل ۱۷ نویسه یا شمارهٔ شاسی ۸ نویسه‌ای ایساکو لازم است');}
   if(data.chassis)data.chassis=code(data.chassis);
   lookupKey=data.vin||data.chassis||'';
   if(!lookupKey||lookupKey.length<6)fail('VIN کامل یا شماره شاسی حداقل شش نویسه لازم است');
   if(!data.appointmentDate)fail('تاریخ نوبت الزامی است');
   else if(!appointmentInstant(data.appointmentDate,data.appointmentTime))fail('تاریخ یا ساعت نوبت خوانده نشد (نمونه: ۱۴۰۵/۰۹/۰۳ و ۱۰:۳۰)');
   if(data.phone){const p=toLatinDigits(data.phone).replace(/[\s()-]/g,'');data.phone=p.startsWith('+98')?'0'+p.slice(3):p.startsWith('0098')?'0'+p.slice(4):p;if(!/^09\d{9}$/.test(data.phone))delete data.phone;}
   // The ISACO appointment number is the identity; otherwise vehicle + date + time (a re-import updates the status).
   key=data.appointmentNo?'no:'+code(data.appointmentNo):'at:'+hash([lookupKey,data.appointmentDate||'',data.appointmentTime||''].join('|'));
  }else{
   if(data.vin){data.vin=normalizeVin(data.vin);if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(data.vin))fail('VIN کامل باید ۱۷ نویسه معتبر داشته باشد');}
   if(data.chassis)data.chassis=code(data.chassis);
   // «کد محصول ایساکو» is an identifier: digits Latin, spaces removed, leading zeros kept.
   if(data.isacoCode){data.isacoCode=code(data.isacoCode);if(data.isacoCode.length>40)fail('کد محصول ایساکو بیش از ۴۰ نویسه است');}
   lookupKey=data.vin||data.chassis||'';
   if(!lookupKey||lookupKey.length<6)fail('VIN کامل یا شماره شاسی حداقل شش نویسه لازم است');
   if(data.phone){const p=toLatinDigits(data.phone).replace(/[\s()-]/g,'');data.phone=p.startsWith('+98')?'0'+p.slice(3):p.startsWith('0098')?'0'+p.slice(4):p;if(!/^09\d{9}$/.test(data.phone)){delete data.phone;messages.push('تلفن نامعتبر در منبع حفظ شد؛ در پیشنهاد خالی می‌ماند و کاربر می‌تواند اصلاح کند');}}
   if(!data.fullName&&!data.phone)fail('نام مشتری یا تلفن لازم است');
   // A vehicle may have several historical owners/visits. Never merge by VIN alone.
   key=hash(JSON.stringify(Object.keys(data).sort().map(k=>[k,data[k as ReferenceField]])));
  }
  const selected=new Set(Object.values(mapping));
  return {rowNo,data,source:source.map((v,i)=>selected.has(i)?v:''),key,lookupKey,outcome:errors.length?'error':'new',messages,expectedVersion:null};
 }
 async preview(actor:Actor,input:ReferencePreviewInput){
  this.allow(actor,input.kind,true);
  const allowed=Object.keys(REFERENCE_FIELDS[input.kind]);const mapped=Object.keys(input.mapping);
  if(mapped.some(k=>!allowed.includes(k))||new Set(Object.values(input.mapping)).size!==mapped.length)throw badRequest('REFERENCE_MAPPING','هر ستون فقط به یک فیلد مرتبط وصل شود');
  if(input.kind==='parts'&&(!mapped.includes('partNumber')||!mapped.includes('description')))throw badRequest('REFERENCE_MAPPING','ستون کد فنی و نام قطعه را انتخاب کنید');
  if(input.kind!=='parts'&&!mapped.includes('vin')&&!mapped.includes('chassis'))throw badRequest('REFERENCE_MAPPING','ستون شماره شاسی یا VIN را انتخاب کنید');
  if(input.kind==='appointments'&&!mapped.includes('appointmentDate'))throw badRequest('REFERENCE_MAPPING','ستون تاریخ نوبت را انتخاب کنید');
  const sheet=this.workbook(input)[input.sheetIndex];if(!sheet||!sheet.rows[input.headerRow-1]?.some(Boolean))throw badRequest('REFERENCE_SHEET','برگه یا ردیف سربرگ معتبر نیست');
  const maxCol=sheet.rows[input.headerRow-1]!.length;if(Object.values(input.mapping).some(c=>c!==undefined&&c>=maxCol))throw badRequest('REFERENCE_MAPPING','ستون انتخاب‌شده خارج از سربرگ است');
  const totalRows=sheet.rows.length-input.headerRow;
  const content=sheet.rows.slice(input.headerRow+input.offset,input.headerRow+input.offset+5000).map((r,i)=>({source:r,rowNo:input.headerRow+input.offset+i+1})).filter(r=>r.source.some(Boolean));
  if(!content.length)throw badRequest('REFERENCE_ROWS','در این بخش داده‌ای وجود ندارد');
  const plans=content.map(r=>this.parseRow(input.kind,r.source,r.rowNo,input.mapping));
  if(input.kind==='parts'){
   const column=input.mapping.partNumber!;const duplicates=new Map<string,number[]>();
   for(let i=input.headerRow;i<sheet.rows.length;i++){const k=code(sheet.rows[i]?.[column]||'');if(k)duplicates.set(k,[...(duplicates.get(k)||[]),i+1]);}
   for(const p of plans){const group=duplicates.get(p.key);if(p.outcome==='new'&&group&&group.length>1){p.outcome='duplicate';p.messages.push(`کد فنی در کل فایل تکراری است؛ ردیف‌های ${group.slice(0,20).join('، ')}`);}}
  }
  const keys=plans.filter(p=>p.outcome!=='error').map(p=>p.key);
  const existing=keys.length?await this.db.select().from(referenceEntries).where(and(eq(referenceEntries.tenantId,actor.user.tenantId),eq(referenceEntries.kind,input.kind),inArray(referenceEntries.identityKey,keys))):[];
  const byKey=new Map(existing.map(e=>[e.identityKey,e]));
  const groups=new Map<string,ReferencePlanRow[]>();for(const p of plans)if(p.outcome!=='error')groups.set(p.key,[...(groups.get(p.key)||[]),p]);
  for(const group of groups.values())if(group.length>1){
   const duplicates=input.kind==='parts'?group:group.slice(1);
   for(const p of duplicates){p.outcome='duplicate';p.messages.push(`شناسه تکراری در ردیف‌های ${group.map(r=>r.rowNo).join('، ')}؛ این ردیف ثبت نمی‌شود`);}
  }
  for(const p of plans){if(p.outcome!=='new')continue;const old=byKey.get(p.key);if(old){p.expectedVersion=old.version;p.outcome=changed(old.data as Record<string,string>,p.data)?'update':'unchanged';}}
  const id=newId();
  await this.db.transaction(async tx=>{
   await tx.insert(referenceImports).values({id,tenantId:actor.user.tenantId,kind:input.kind,fileName:input.fileName,fileSha256:hash(input.fileBase64),sheetName:sheet.name,headerRow:input.headerRow,mapping:{columns:input.mapping,offset:input.offset,totalRows,batchSize:5000,signature:headerSignature(sheet.rows[input.headerRow-1]??[]),sheetIndex:input.sheetIndex},rows:plans,createdBy:actor.user.id,isTest:actor.user.isTestTenant});
   await this.audit.record(tx,actor,{entityType:'reference',entityId:id,action:'reference.previewed',after:{kind:input.kind,counts:counts(plans)},snapshot:{version:1,row:{id,kind:input.kind,status:'preview'}}});
  });
  return this.get(actor,id);
 }
 async get(actor:Actor,id:string):Promise<ReferenceImport>{
  const [r]=await this.db.select().from(referenceImports).where(and(eq(referenceImports.id,id),eq(referenceImports.tenantId,actor.user.tenantId)));
  if(!r)throw notFound('ورود اطلاعات پایه');this.allow(actor,r.kind as ReferenceKind,true);
  const rows=r.rows as ReferencePlanRow[];
  const meta=r.mapping as {offset?:number;totalRows?:number;batchSize?:number};
  return {id:r.id,kind:r.kind as ReferenceKind,fileName:r.fileName,sheetName:r.sheetName,headerRow:r.headerRow,status:r.status as ReferenceImport['status'],createdAt:r.createdAt.toISOString(),appliedAt:r.appliedAt?.toISOString()||null,counts:counts(rows),rows,offset:meta.offset||0,totalRows:meta.totalRows||rows.length,batchSize:meta.batchSize||5000};
 }
 async apply(actor:Actor,id:string){
  try{return await this.applyImport(actor,id);}
  // A new catalog may add «مصرف خودرو» labels: the next assessment search reads them fresh.
  finally{this.labelCache.delete(actor.user.tenantId);}
 }
 private async applyImport(actor:Actor,id:string){
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
   // The confirmed column layout is remembered by its header signature: the next file of this report is recognized.
   const m=imp.mapping as {columns:SavedReferenceMapping['mapping'];signature?:string;sheetIndex?:number};
   if(m.signature){
    const [t]=await tx.select({settings:tenants.settings}).from(tenants).where(eq(tenants.id,actor.user.tenantId)).for('update');
    const saved=(t?.settings.referenceMappings??{}) as Record<string,SavedReferenceMapping>;
    const next:SavedReferenceMapping={signature:m.signature,headerRow:imp.headerRow,sheetIndex:m.sheetIndex??0,mapping:m.columns,savedAt:new Date().toISOString()};
    await tx.update(tenants).set({settings:{...t!.settings,referenceMappings:{...saved,[kind]:next}}}).where(eq(tenants.id,actor.user.tenantId));
   }
   await this.audit.record(tx,actor,{entityType:'reference',entityId:id,action:'reference.applied',after:{kind,counts:counts(plans)},snapshot:{version:2,row:{id,kind,status:'applied'}}});
  });
  // A reception record may name the admission of an archived card (exact match only; never fatal).
  try{await this.aidRecords.retryCards(this.db,actor.user.tenantId);}catch{/* the import itself is complete */}
  return this.get(actor,id);
 }
 /** Saved column layouts (by header signature) of the reports already confirmed once. */
 async savedMappings(tenantId:string):Promise<Record<string,SavedReferenceMapping>>{
  const [t]=await this.db.select({settings:tenants.settings}).from(tenants).where(eq(tenants.id,tenantId));
  return (t?.settings.referenceMappings??{}) as Record<string,SavedReferenceMapping>;
 }
 /** Header signature of a sheet row, for recognizing a report by its structure. */
 signatureOf(input:ReferenceFileInput,sheetIndex:number,headerRow:number){const sheet=this.workbook(input)[sheetIndex];return sheet?headerSignature(sheet.rows[headerRow-1]??[]):'';}
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
  const records=found.slice(0,20).map(({e,fileName})=>this.record(e,fileName));
  if(kind==='customers'&&records.length){
   const keys=[...new Set(records.flatMap(r=>[r.data.vin,r.data.chassis]).filter((v):v is string=>!!v))];
   const matches=keys.length?await this.db.select({id:cases.id,caseNumber:cases.caseNumber,admissionNo:cases.admissionNo,vin:vehicles.vin,chassis:vehicles.chassisRef}).from(cases).innerJoin(vehicles,eq(vehicles.id,cases.vehicleId)).where(and(eq(cases.tenantId,actor.user.tenantId),sql`(${inArray(vehicles.vin,keys)} or ${inArray(vehicles.chassisRef,keys)})`)).limit(20):[];
   for(const r of records)r.caseMatches=matches.filter(c=>[r.data.vin,r.data.chassis].some(k=>k&&(k===c.vin||k===c.chassis))).map(({id,caseNumber,admissionNo})=>({id,caseNumber,admissionNo}));
  }
  return {truncated:found.length>20,records};
 }

 /** «مصرف خودرو» labels of the tenant's catalog with their part counts, cached briefly (one small grouped read). */
 private labelCache=new Map<string,{at:number;labels:string[];counts:Map<string,number>}>();
 private async fitmentLabelCounts(tenantId:string){
  const hit=this.labelCache.get(tenantId);
  if(hit&&Date.now()-hit.at<60_000)return hit;
  const rows=await this.db.select({label:sql<string>`coalesce(${referenceEntries.data}->>'vehicleUse','')`,n:sql<number>`count(*)::int`})
   .from(referenceEntries).where(and(eq(referenceEntries.tenantId,tenantId),eq(referenceEntries.kind,'parts')))
   .groupBy(sql`1`);
  const entry={at:Date.now(),labels:rows.map(r=>r.label),counts:new Map(rows.map(r=>[r.label,Number(r.n)]))};
  this.labelCache.set(tenantId,entry);
  return entry;
 }

 /** The case vehicle and its resolved catalog family (shared by the search and the vehicle picker). */
 private async caseFitment(actor:Actor,caseId:string){
  if(!actor.user.permissions.has('assessment.manage')||!actor.user.permissions.has('case.read'))throw forbidden();
  const tenantId=actor.user.tenantId;
  const [context]=await this.db.select({model:vehicles.model,trim:vehicles.trim,brand:vehicles.brand,vin:vehicles.vin,chassis:vehicles.chassisRef})
   .from(cases).innerJoin(vehicles,and(eq(vehicles.id,cases.vehicleId),eq(vehicles.tenantId,tenantId)))
   .where(and(eq(cases.id,caseId),eq(cases.tenantId,tenantId))).limit(1);
  if(!context)throw notFound('پرونده خودرو');
  const vehicle={brand:context.brand,model:context.model,trim:context.trim,vin:context.vin};
  // Admission records of the same VIN / chassis (dealership data) as a second, independent source.
  const ids=[context.vin?normalizeVin(context.vin):'',context.chassis?toLatinDigits(context.chassis).replace(/\s+/g,'').toUpperCase():''].filter(x=>x.length>=6);
  const admissions=ids.length?await this.db.select({data:referenceEntries.data}).from(referenceEntries)
   .where(and(eq(referenceEntries.tenantId,tenantId),eq(referenceEntries.kind,'customers'),
    sql`(upper(coalesce(${referenceEntries.data}->>'vin','')) in (${sql.join(ids.map(x=>sql`${x}`),sql`, `)}) or upper(coalesce(${referenceEntries.data}->>'chassis','')) in (${sql.join(ids.map(x=>sql`${x}`),sql`, `)}))`)).limit(20):[];
  const vinTexts=admissions.flatMap(r=>{const d=r.data as Record<string,unknown>;return [String(d.model??''),String(d.trim??'')];});
  const {labels,counts:labelCounts}=await this.fitmentLabelCounts(tenantId);
  const catalog=fitmentCatalog(labels);
  const fit=resolveVehicleFamily([context.model,context.trim],vinTexts,labels,catalog);
  const caseVehicle=[context.model,context.brand].find(x=>x&&x.trim())?.trim()??null;
  return {tenantId,vehicle,caseVehicle,labels,labelCounts,catalog,fit};
 }

 /**
  * Vehicle families of the tenant's catalog for the «انتخاب خودرو» picker (owner, 2026-11-22):
  * the case's own family first, then every other family by name. No shared-platform list
  * is assumed, so no other family is promoted as «related».
  */
 async assessmentVehicles(actor:Actor,caseId:string){
  const {caseVehicle,labels,labelCounts,catalog,fit}=await this.caseFitment(actor,caseId);
  const caseKey=fit.status==='verified'?fit.family:null;
  const families=catalogFamilies(labels,catalog)
   .map(f=>({key:f.key,name:f.name,labels:f.labels.map(l=>l.trim()),parts:f.labels.reduce((n,l)=>n+(labelCounts.get(l)??0),0),caseFamily:f.key===caseKey}))
   .sort((a,b)=>Number(b.caseFamily)-Number(a.caseFamily));
  return {caseId,caseVehicle,caseFamily:fit.status==='verified'?{key:fit.family,name:fit.familyName}:null,families};
 }

 /**
  * Read-only suggestions for the accident expert (owner, 2026-11-19; families 2026-11-21;
  * scopes 2026-11-22). Scope `case` (default) returns only parts whose catalog «مصرف خودرو»
  * belongs to the case's vehicle family (or is explicitly common to every platform); a label
  * of another trim of the family carries «نیازمند بررسی تطابق با تیپ خودرو». The family comes
  * from the case's model/trim and, when the VIN or chassis is in the admission records, from
  * that record; if it cannot be verified or the two name different families, scope `case`
  * suggests nothing (vehicle-fitment.ts). Scope `vehicle` searches one chosen catalog family
  * and `all` the whole catalog; both judge every part against the CASE vehicle and never
  * certify another family. Results come 100 per page. Never creates parts or changes the case.
  */
 async suggestAssessmentParts(actor:Actor,caseId:string,input:string|{query:string;scope?:AssessmentSearchScope;family?:string;offset?:number}){
  const {query,scope='case',family,offset=0}=typeof input==='string'?{query:input}:input;
  const {tenantId,vehicle,caseVehicle,labels,catalog,fit}=await this.caseFitment(actor,caseId);
  const normalized=normalizeAssessmentSearch(query);
  if(normalized.length<2)throw badRequest('ASSESSMENT_SEARCH_SHORT','حداقل دو نویسه از نام یا شماره فنی وارد کنید');
  const verified=fit.status==='verified';
  const base={caseId,vehicle,caseVehicle,fitment:fit,family:verified?fit.familyName:undefined,scope,
   // No catalog label names this exact trim: every family part is shown with the trim-check note.
   trimReview:verified?fit.label===null:false,fitmentVerified:verified};
  let allowed:string[]|null=null;
  let scopeFamily:{key:string;name:string}|null=null;
  if(scope==='case'){
   if(!verified){
    return {...base,scopeFamily,results:[],offset,total:0,hasMore:false,limited:false,
     message:fit.status==='conflict'?'مدل ثبت‌شده در پرونده با سابقهٔ پذیرش همین VIN یکی نیست؛ سازگاری قطعات قابل تأیید نیست. مدل خودرو را در پرونده اصلاح کنید.':'خانوادهٔ این خودرو در کاتالوگ قطعات قابل تشخیص نیست؛ برای جلوگیری از قطعهٔ نامرتبط، پیشنهادی نمایش داده نمی‌شود. مدل خودرو را در پرونده کامل کنید یا قلم را دستی ثبت کنید.'};
   }
   // Every catalog label of the vehicle family (trim variants included) plus explicitly common parts.
   allowed=labels.filter(l=>partFitment(l,fit,catalog)!==null);
   scopeFamily={key:fit.family,name:fit.familyName};
  }else if(scope==='vehicle'){
   // Only a family of this tenant's own catalog; the key is checked here, never trusted from the browser.
   const chosen=catalogFamilies(labels,catalog).find(f=>f.key===family);
   if(!chosen)throw badRequest('ASSESSMENT_VEHICLE_UNKNOWN','این خودرو در کاتالوگ قطعات نیست؛ خودرو را از فهرست انتخاب کنید');
   allowed=[...chosen.labels,...labels.filter(l=>isCommonFitment(l))];
   scopeFamily={key:chosen.key,name:chosen.name};
  }
  const exact=verified?labels.filter(l=>{const f=partFitment(l,fit,catalog);return f==='exact'||f==='common';}):[];
  // Bounded SQL prefilter avoids reading the entire catalog per keystroke.
  const vehicleUse=sql<string>`coalesce(${referenceEntries.data}->>'vehicleUse','')`;
  // Same letter folding as normalizeAssessmentSearch («آینه» is found by «اینه» and «آینه»).
  const folded=sql`replace(replace(replace(translate(lower(coalesce(${referenceEntries.data}->>'description','')),'يىكأإٱآۀة','ییکااااهه'),' ',''),chr(8204),''),'-','')`;
  const fragment=normalized.slice(0,Math.min(3,normalized.length));
  const codeQuery=toLatinDigits(query).replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
  const prefilter=codeQuery
   ? sql`(${folded} like ${'%'+fragment+'%'} or ${referenceEntries.lookupKey} like ${codeQuery+'%'})`
   : sql`${folded} like ${'%'+fragment+'%'}`;
  const direct=codeQuery
   ? sql`(${folded} like ${'%'+normalized+'%'} or ${referenceEntries.lookupKey} like ${codeQuery+'%'})`
   : sql`${folded} like ${'%'+normalized+'%'}`;
  if(allowed&&!allowed.length)return {...base,scopeFamily,results:[],offset,total:0,hasMore:false,limited:false};
  const rows=await this.db.select({id:referenceEntries.id,data:referenceEntries.data})
   .from(referenceEntries).where(and(eq(referenceEntries.tenantId,tenantId),eq(referenceEntries.kind,'parts'),
    ...(allowed?[inArray(vehicleUse,allowed)]:[]),prefilter))
   // Full-text and code matches first, then the vehicle's own catalog label, so a large catalog never
   // crowds the real matches out of the bounded read.
   .orderBy(sql`case when ${direct} then 0 else 1 end`,
    ...(exact.length?[sql`case when ${vehicleUse} in (${sql.join(exact.map(x=>sql`${x}`),sql`, `)}) then 0 else 1 end`]:[]),
    referenceEntries.lookupKey).limit(SEARCH_READ_LIMIT+1);
  const limited=rows.length>SEARCH_READ_LIMIT;
  const candidates=rows.slice(0,SEARCH_READ_LIMIT).map(row=>{
   const data=row.data as Record<string,unknown>;
   const use=typeof data.vehicleUse==='string'?data.vehicleUse:'';
   const fitment=partFitment(use,fit,catalog);
   const compatibility=partCompatibility(use,fit,catalog);
   return {id:row.id,name:String(data.description??''),partNumber:String(data.partNumber??''),vehicleUse:use,fitment,compatibility,
    // Only the case family's own label (and common parts) is verified; everything else ranks after it.
    vehicleMatch:(compatibility==='verified'?'verified':'unknown') as 'verified'|'unknown'};
   // Defence in depth: scope `case` never offers another vehicle.
  }).filter(row=>row.name&&row.partNumber&&(scope!=='case'||row.fitment!==null));
  const byId=new Map(candidates.map(row=>[row.id,row]));
  // Equal matches: the case family's other trims before other vehicles, and those before unlabelled parts.
  const ranked=scoreAssessmentCandidates(query,candidates)
   .sort((a,b)=>b.score-a.score||COMPAT_ORDER[byId.get(a.id)!.compatibility]-COMPAT_ORDER[byId.get(b.id)!.compatibility]);
  const results=ranked.slice(offset,offset+ASSESSMENT_SEARCH_PAGE).map(item=>{
   const row=byId.get(item.id)!;
   return {...item,vehicleUse:row.vehicleUse,
    // The catalog family of the part itself (its source vehicle), shown beside every result.
    vehicleFamily:isCommonFitment(row.vehicleUse)?null:catalog.familyOf(row.vehicleUse)?.name??null,
    fitment:row.fitment,compatibility:row.compatibility,common:row.fitment==='common',
    fitmentNote:COMPATIBILITY_NOTES[row.compatibility],reference:assessmentReference(item.partNumber)};
  });
  return {...base,scopeFamily,results,offset,total:ranked.length,hasMore:offset+ASSESSMENT_SEARCH_PAGE<ranked.length,limited};
 }

 private record(e:Entry,fileName:string):ReferenceRecord{return {id:e.id,kind:e.kind as ReferenceKind,data:e.data as ReferenceRecord['data'],fileName,importedAt:e.updatedAt.toISOString(),version:e.version};}
 async report(actor:Actor,id:string){const imp=await this.get(actor,id);return writeSheet('نتیجه اطلاعات پایه',[['ردیف','نتیجه','پیام',...Object.values(REFERENCE_FIELDS[imp.kind])],...imp.rows.map(r=>[r.rowNo,REFERENCE_OUTCOME_LABELS[r.outcome],r.messages.join('؛ '),...Object.keys(REFERENCE_FIELDS[imp.kind]).map(k=>r.data[k as ReferenceField]||'')])]);}
 sample(actor:Actor,kind:ReferenceKind){this.allow(actor,kind,true);return writeSheet('اطلاعات پایه',[Object.values(REFERENCE_FIELDS[kind])]);}
}
