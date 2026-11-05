'use client';
import {useEffect,useState} from 'react';
import useSWR from 'swr';
import {EMDAD_MATCH_LABELS,EMDAD_STATUS_CATEGORY_LABELS,toPersianDigits,type CaseListItem,type EmdadRequest,type Paged,type Part,type UserRef} from '@manage/shared';
import {api,errorMessage,fetcher} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {formatJalali} from '@/lib/format';
import {useToast} from '@/lib/toast';
import {Dialog} from './Dialog';
import {JalaliInput} from './JalaliInput';

type Detail={request:EmdadRequest;events:{id:string;reportAt:string;changes:Record<string,unknown>;fileName:string}[]};
const OFFICIAL:[string,string][]=[['sendStatus','وضعیت ارسال درخواست به امداد ویژه'],['emdadStatus','وضعیت امداد ویژه'],['cardStatus','وضعیت کارت'],['sendMethod','نحوه ارسال قطعه'],['emdadRegisteredAt','تاریخ ثبت امداد'],['exitedAt','خروج قطعه از شرکت'],['receivedInWarehouseAt','رسید در انبار'],['cancelledAt','زمان ابطال'],['cancelReason','دلیل ابطال'],['stopReason','علت توقف'],['invoiceNo','شماره فاکتور'],['specialDescription','شرح اختصاصی'],['specialQuantity','تعداد اختصاصی'],['supplyDescription','شرح تدارکاتی'],['supplyQuantity','تعداد تدارکاتی'],['releasedAt','تاریخ ترخیص'],['hall','سالن تعمیرات'],['goldenCardStatus','وضعیت کارت طلایی'],['warrantyStatus','وضعیت گارانتی']];
const LABELS=Object.fromEntries(OFFICIAL);
const value=(v:unknown)=>v==null||v===''?'خالی':toPersianDigits(String(v));

/** Official text stays apart from Manage's own follow-up; nothing here changes stock or the repair. */
export function EmdadDetail({id,onClose,onChange}:{id:string;onClose:()=>void;onChange:()=>void}){
 const {can}=useAuth();const toast=useToast();const manage=can('emdad.manage');
 const {data,mutate}=useSWR<Detail>(`/emdad/requests/${id}`,fetcher);
 const {data:staff}=useSWR<UserRef[]>(manage?'/users/assignable':null,fetcher);
 const [assignee,setAssignee]=useState(''),[due,setDue]=useState<string|null>(null),[note,setNote]=useState(''),[next,setNext]=useState('');
 const [term,setTerm]=useState(''),[search,setSearch]=useState(''),[caseId,setCaseId]=useState(''),[partId,setPartId]=useState(''),[matchNote,setMatchNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const {data:found}=useSWR<Paged<CaseListItem>>(manage&&search?`/cases?q=${encodeURIComponent(search)}&pageSize=10`:null,fetcher);
 const {data:needs}=useSWR<Part[]>(manage&&caseId?`/cases/${caseId}/parts`:null,fetcher);
 const r=data?.request;
 useEffect(()=>{if(!r)return;setAssignee(r.assigneeUserId??'');setDue(r.dueAt);setNote(r.note??'');setNext(r.nextAction??'');setCaseId(r.caseId??'');setPartId(r.partRequestId??'');},[r]);
 async function run(fn:()=>Promise<Detail>,done:string){setBusy(true);setError('');try{await mutate(await fn(),{revalidate:false});toast(done);onChange();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 const follow=()=>run(()=>api<Detail>(`/emdad/requests/${id}/follow-up`,{method:'PATCH',body:{expectedVersion:r!.version,assigneeUserId:assignee||null,dueAt:due,note:note.trim()||null,nextAction:next.trim()||null}}),'پیگیری ذخیره شد');
 const link=()=>run(()=>api<Detail>(`/emdad/requests/${id}/match`,{body:{expectedVersion:r!.version,caseId:caseId||null,partRequestId:caseId&&partId?partId:null,note:matchNote.trim()}}),'تصمیم اتصال ثبت شد');
 const official=r?.official??{};const notes=(official.codeNotes as string[]|undefined)??[];
 return <Dialog open title="جزئیات پیگیری امداد ویژه" onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>بستن</button>}>{!r?<p role="status" className="muted small">در حال دریافت…</p>:<div className="stack" data-testid="emdad-detail">
  <div className="grid-2 small"><div>پرونده منیج: {r.caseId?<a href={`/cases/${r.caseId}#case-parts`}><bdi>{toPersianDigits(r.caseNumber??'')}</bdi></a>:'متصل نیست'}{r.caseClosed&&' (بسته؛ باز نمی‌شود)'}</div><div>پذیرش ایران‌خودرو: <bdi>{value(r.admissionNo)}</bdi></div><div>شاسی: <bdi>{value(r.chassis)}</bdi></div><div>شماره امداد / درخواست: <bdi>{value(r.emdadNo)}</bdi> / <bdi>{value(r.requestNo)}</bdi></div></div>
  <div className="grid-2 small"><div>کد اختصاصی اولیه: <bdi>{value(r.initialCode)}</bdi></div><div>کد قطعه: <bdi>{value(official.partCode)}</bdi></div><div>کد کامل تدارکاتی: <bdi>{value(official.fullCode)}</bdi></div><div>آخرین گزارش: {formatJalali(r.lastReportAt)}</div></div>
  {notes.map(n=><p key={n} className="callout callout-amber small">{n}</p>)}
  <p className="small"><span className="chip">{EMDAD_STATUS_CATEGORY_LABELS[r.statusCategory]}</span> <span className="chip">{EMDAD_MATCH_LABELS[r.matchStatus]}</span>{r.matchNote&&<span className="xs muted"> {r.matchNote}</span>}</p>
  {r.suggestion&&<p className="callout callout-blue small">پیشنهاد (تصمیم با شماست): {r.suggestion}</p>}
  <details><summary className="small">متن رسمی گزارش</summary><dl className="small emdad-official">{OFFICIAL.map(([k,l])=><div key={k}><dt>{l}</dt><dd><bdi>{value(official[k])}</bdi></dd></div>)}</dl><p className="xs muted">«ارسال شده»، «فاکتور صادر شده»، «وارد موجودی شده» و «خروج قطعه» به‌تنهایی اثبات دریافت نمایندگی یا تحویل به تعمیر نیستند.</p></details>
  {manage&&<fieldset className="stack"><legend>پیگیری داخلی منیج (با فایل بعدی پاک نمی‌شود)</legend><div className="grid-2"><label className="field"><span>مسئول پیگیری</span><select className="input" value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">بدون مسئول</option>{staff?.map(u=><option key={u.id} value={u.id}>{u.displayName}</option>)}</select></label><JalaliInput label="موعد اقدام" value={due} onChange={setDue} withTime/></div><label className="field"><span>اقدام بعدی</span><input className="input" maxLength={500} value={next} onChange={e=>setNext(e.target.value)}/></label><label className="field"><span>یادداشت</span><textarea className="input" rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label><div><button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void follow()}>ذخیره پیگیری</button></div></fieldset>}
  {manage&&<fieldset className="stack"><legend>بررسی اتصال به پرونده (تصمیم انسانی)</legend><p className="xs muted">سامانه فقط وقتی خودکار وصل می‌کند که پذیرش، شاسی و کد یکی باشند؛ نام مشتری یا شباهت متن کافی نیست.</p><div className="workspace-search"><label className="field">جست‌وجوی پرونده (شماره منیج، پذیرش یا شاسی)<input className="input" value={term} maxLength={80} onChange={e=>setTerm(e.target.value)}/></label><button type="button" className="btn" onClick={()=>setSearch(term.trim())}>جست‌وجو</button></div><label className="field"><span>پرونده</span><select className="input" value={caseId} onChange={e=>{setCaseId(e.target.value);setPartId('');}}><option value="">بدون اتصال (جداسازی)</option>{r.caseId&&r.caseNumber&&!found?.items.some(c=>c.id===r.caseId)&&<option value={r.caseId}>{toPersianDigits(r.caseNumber)} (فعلی)</option>}{found?.items.map(c=><option key={c.id} value={c.id}>{toPersianDigits(c.caseNumber)} · پذیرش {c.admissionNo?toPersianDigits(c.admissionNo):'ندارد'} · {c.vehicleLabel}</option>)}</select></label>{caseId&&<label className="field"><span>نیاز قطعه (اختیاری)</span><select className="input" value={partId} onChange={e=>setPartId(e.target.value)}><option value="">بدون اتصال به نیاز مشخص</option>{needs?.filter(p=>p.status!=='cancelled').map(p=><option key={p.id} value={p.id}>{p.description}{p.partNumber?` · ${toPersianDigits(p.partNumber)}`:''}</option>)}</select></label>}<label className="field"><span>دلیل *</span><input className="input" maxLength={500} value={matchNote} onChange={e=>setMatchNote(e.target.value)}/></label><div><button type="button" className="btn" disabled={busy||matchNote.trim().length<3} onClick={()=>void link()}>ثبت تصمیم اتصال</button></div></fieldset>}
  {error&&<p className="callout callout-red small" role="alert">{error}</p>}
  <section><h3>تاریخچه تغییرات روزانه</h3>{!data!.events.length&&<p className="muted small">تغییری ثبت نشده است.</p>}<ul className="plain small" data-testid="emdad-history">{data!.events.map(e=><li key={e.id}><strong>{formatJalali(e.reportAt)}</strong>{e.changes.created?' — اولین ورود':Object.entries(e.changes).filter(([k])=>k!=='codeNotes').map(([k,c])=>{const v=c as {from:unknown;to:unknown};return <div key={k} className="xs">{LABELS[k]??k}: <bdi>{value(v.from)}</bdi> ← <bdi>{value(v.to)}</bdi></div>;})}</li>)}</ul></section>
 </div>}</Dialog>;
}
