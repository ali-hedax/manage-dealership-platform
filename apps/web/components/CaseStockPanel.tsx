'use client';
import {useState} from 'react';
import useSWR,{useSWRConfig} from 'swr';
import {EMDAD_MATCH_LABELS,parseBasePartNumber,parseStockCode,toLatinDigits,toPersianDigits,type CaseDetail,type EmdadRequest,type Paged,type Part,type StockOption,type StockReservation,type StockSnapshotInfo} from '@manage/shared';
import {api,errorMessage,fetcher,newKey} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {faNum,formatJalali} from '@/lib/format';
import {useToast} from '@/lib/toast';
import {isStockCacheKey} from '@/lib/stock-cache';
import {Dialog} from './Dialog';
import {EmdadDetail} from './EmdadDetail';
import {ReservationsTable} from './ReservationsTable';
import {StockOptionsTable,optionKey} from './StockOptions';

const baseOf=(n:string|null)=>n?parseStockCode(n)?.basePartNumber??parseBasePartNumber(n):null;

/** Options of a typed code while recording a need; read-only, reserving comes after the need exists. */
export function StockFamilyPreview({partNumber}:{partNumber:string}){
 const [expanded,setExpanded]=useState(false);
 const {can}=useAuth();const base=baseOf(toLatinDigits(partNumber.trim()));
 if(!base||!can('stock.read'))return null;
 return <details className="compact-disclosure" data-testid="family-preview" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>بررسی گزینه‌های موجودی این کد</summary>{expanded&&<StockFamilyOptions base={base}/>}</details>;
}

function StockFamilyOptions({base}:{base:string}) { return <div className="stack"><p className="small muted">کد پایه <bdi>{toPersianDigits(base)}</bdi>؛ گزینه‌ها پیشنهاد بررسی‌اند و جایگزینی فنی را تأیید نمی‌کنند.</p><StockOptionsTable query="" base={base} pageSize={10}/></div>; }

export function PartEmdadPreview({caseId,partId}:{caseId:string;partId:string}) {
 const {can}=useAuth();const [expanded,setExpanded]=useState(false),[detail,setDetail]=useState<string|null>(null);
 const {data,error,mutate}=useSWR<Paged<EmdadRequest>>(can('emdad.read')&&expanded?['/emdad/requests/search',caseId,partId]:null,
   ([path,id,need]:[string,string,string])=>api<Paged<EmdadRequest>>(path,{body:{caseId:id,partRequestId:need,relatedPartsOnly:true,pageSize:100}}));
 if(!can('emdad.read'))return null;
 return <details className="compact-disclosure" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>امداد مرتبط با این قطعه</summary><div className="stack">
  {error&&<p role="alert">دریافت امداد ناموفق بود؛ دوباره باز کنید.</p>}
  {!data&&!error&&expanded&&<p role="status">در حال بررسی…</p>}
  {data&&!data.total&&<p className="small muted">امداد منطبق با شماره فنی این نیاز در پرونده پیدا نشد.</p>}
  {data?.items.map(r=><div className="row" key={r.id}><span className="small">امداد <bdi>{toPersianDigits(r.emdadNo||'—')}</bdi> · {String(r.official.emdadStatus||'وضعیت ثبت نشده')}</span><button type="button" className="btn btn-sm" onClick={()=>setDetail(r.id)}>مشاهده پیگیری</button></div>)}
  {detail&&<EmdadDetail id={detail} onClose={()=>setDetail(null)} onChange={()=>void mutate()}/>}</div></details>;
}

/** Choosing the exact stock code and quantity for one need; no automatic choice or substitution. */
function ReserveDialog({part,reserved,onClose,onDone}:{part:Part;reserved:number;onClose:()=>void;onDone:()=>void}){
 const toast=useToast();const base=baseOf(part.partNumber);const {mutate:refresh}=useSWRConfig();
 const [term,setTerm]=useState(base??part.partNumber??part.description),[query,setQuery]=useState(base?'':term),[selected,setSelected]=useState<{o:StockOption;snapshot:StockSnapshotInfo}|null>(null);
 const [qty,setQty]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const [key]=useState(newKey);
 async function reserve(){if(!selected)return;setBusy(true);setError('');try{await api<StockReservation>('/stock/reservations',{body:{partRequestId:part.id,fullStockCode:selected.o.fullStockCode,locationAddress:selected.o.locationAddress,snapshotId:selected.snapshot.id,quantity:toLatinDigits(qty.trim()),confirm:true},idempotencyKey:key});toast('رزرو داخلی ثبت شد');onDone();await refresh(isStockCacheKey);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 const blocked=selected&&!selected.snapshot.reservable;
 return <Dialog open title={`انتخاب گزینه و رزرو: ${part.description}`} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>انصراف</button><button type="button" className="btn btn-primary" disabled={busy||!selected||!qty.trim()||!confirm||!!blocked} onClick={()=>void reserve()}>{busy?'در حال ثبت…':'ثبت رزرو داخلی'}</button></>}><div className="stack" data-testid="reserve-dialog">
  <p className="small">نیاز: {faNum(part.quantity)} {part.partNumber&&<>· کد درخواستی <bdi>{toPersianDigits(part.partNumber)}</bdi></>} · رزرو/خروج‌شده تا اکنون: {faNum(reserved)}</p>
  <p className="callout callout-blue small">این رزرو داخل منیج است و رزرو رسمی سامانه ایران‌خودرو نیست. گروه‌بندی با کد پایه به معنی تأیید جایگزینی فنی نیست؛ کد کامل را خودتان انتخاب کنید.</p>
  <form className="workspace-search" onSubmit={e=>{e.preventDefault();setSelected(null);setQuery(term.trim());}}><label className="field">کد پایه، کد کامل یا نام<input className="input" value={term} maxLength={80} onChange={e=>setTerm(e.target.value)}/></label><button type="submit" className="btn">جست‌وجو</button></form>
  <StockOptionsTable key={query} query={query||(base?'':term)} base={!query&&base?base:undefined} selected={selected?optionKey(selected.o):null} onSelect={(o,snapshot)=>setSelected({o,snapshot})}/>
  {blocked&&<p className="callout callout-amber small" role="alert">دامنه انبار، کامل‌بودن گزارش و معنای ستون موجودی هنوز توسط مالک تأیید نشده؛ رزرو فعال نیست، ولی می‌توانید گزینه‌ها را ببینید.</p>}
  {selected&&<div className="stack"><p className="small">انتخاب: <strong><bdi>{toPersianDigits(selected.o.fullStockCode)}</bdi></strong> در <bdi>{selected.o.locationAddress||'محل نامشخص'}</bdi> · قابل تخصیص {toPersianDigits(selected.o.available)} {selected.o.unit??''}</p>
   <label className="field"><span>مقدار رزرو (به واحد {selected.o.unit??'گزارش'}) *</span><input className="input ltr-input" inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)}/><span className="hint">تبدیل واحد خودکار انجام نمی‌شود.</span></label>
   <label className="check"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> همین کد کامل و مقدار را برای همین نیاز تأیید می‌کنم</label></div>}
  {error&&<p className="callout callout-red small" role="alert">{error}</p>}
 </div></Dialog>;
}

/** Daily stock choice, reservations and Emdad follow-up of one case, side by side with both identifiers. */
export function CaseStockPanel({kase}:{kase:CaseDetail}){
 const {can}=useAuth();const canStock=can('stock.read'),canEmdad=can('emdad.read'),reserve=can('stock.reserve');
 const {data:parts}=useSWR<Part[]>(canStock?`/cases/${kase.id}/parts`:null,fetcher);
 const {data:res,mutate}=useSWR<{items:StockReservation[]}>(canStock?`/stock/reservations?caseId=${kase.id}`:null,fetcher);
 const {data:emdad,mutate:mutateEmdad}=useSWR<Paged<EmdadRequest>>(canEmdad?['/emdad/requests/search',kase.id,'related']:null,([path,id]:[string,string,string])=>api<Paged<EmdadRequest>>(path,{body:{caseId:id,relatedPartsOnly:true,pageSize:100}}));
 const [picking,setPicking]=useState<Part|null>(null),[open,setOpen]=useState<string|null>(null);
 if(!canStock&&!canEmdad)return null;
 const editable=kase.status==='open'&&kase.stage!=='delivered';
 const active=(p:Part)=>(res?.items??[]).filter(r=>r.partRequestId===p.id&&(r.status==='reserved'||r.status==='issued'));
 const sum=(p:Part)=>active(p).reduce((n,r)=>n+Number(r.quantity),0);
 const open_parts=(parts??[]).filter(p=>!['cancelled','handed_over'].includes(p.status));
 return <section className="panel" data-testid="case-stock"><div className="panel-head"><div><h2>موجودی روزانه، رزرو و امداد ویژه</h2><p className="xs muted">پرونده منیج <bdi>{toPersianDigits(kase.caseNumber)}</bdi> · پذیرش ایران‌خودرو <bdi>{kase.admissionNo?toPersianDigits(kase.admissionNo):'ثبت نشده'}</bdi> · شاسی <bdi>{kase.vehicle.chassisRef?toPersianDigits(kase.vehicle.chassisRef):kase.vehicle.vin?toPersianDigits(kase.vehicle.vin):'ثبت نشده'}</bdi></p></div></div>
 <div className="panel-body stack">
  {canStock&&<>{parts&&!open_parts.length&&<p className="muted small">نیاز قطعه بازی برای انتخاب گزینه نیست.</p>}{open_parts.map(p=><div key={p.id} className="row" style={{justifyContent:'space-between'}} data-testid="case-need"><span className="small"><strong>{p.description}</strong>{p.partNumber&&<> · <bdi>{toPersianDigits(p.partNumber)}</bdi></>} · نیاز {faNum(p.quantity)} · رزرو/خروج {faNum(sum(p))}</span>{reserve&&editable&&sum(p)<p.quantity&&<button type="button" className="btn btn-sm" onClick={()=>setPicking(p)}>انتخاب گزینه و رزرو</button>}</div>)}
   {!!res?.items.length&&<details className="compact-disclosure"><summary>مشاهده رزروها و خروج قطعات ({faNum(res.items.length)})</summary><ReservationsTable items={res.items} caseColumn={false} onChange={()=>void mutate()}/></details>}</>}
  {canEmdad&&<details className="compact-disclosure"><summary>امداد مرتبط با قطعات کارشناسی / درخواست‌شده {emdad ? `(${faNum(emdad.total)})` : ''}</summary><div className="stack">{emdad&&!emdad.total&&<p className="muted small">امداد منطبق با شماره فنی اقلام این پرونده پیدا نشد. سایر سوابق در صفحه امداد قابل جست‌وجو هستند.</p>}{emdad?.items.map(r=><div key={r.id} className="row" style={{justifyContent:'space-between'}} data-testid="case-emdad"><span className="small">امداد <bdi>{toPersianDigits(r.emdadNo??'—')}</bdi> · کد اولیه <bdi>{toPersianDigits(r.initialCode??'—')}</bdi> · کد شرکت <bdi>{toPersianDigits(String(r.official.fullCode||'—'))}</bdi> — {String(r.official.emdadStatus||'وضعیت خالی')} <span className="xs muted">({EMDAD_MATCH_LABELS[r.matchStatus]}، گزارش {formatJalali(r.lastReportAt)}{r.assigneeName?`، مسئول: ${r.assigneeName}`:''})</span></span><button type="button" className="btn btn-sm" onClick={()=>setOpen(r.id)}>جزئیات و تاریخچه</button></div>)}</div></details>}
 </div>
 {picking&&<ReserveDialog part={picking} reserved={sum(picking)} onClose={()=>setPicking(null)} onDone={()=>{setPicking(null);void mutate();}}/>}
 {open&&<EmdadDetail id={open} onClose={()=>setOpen(null)} onChange={()=>void mutateEmdad()}/>}</section>;
}
