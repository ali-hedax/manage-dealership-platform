'use client';
import {useRef,useState} from 'react';
import type {ReferenceKind,ReferenceRecord} from '@manage/shared';
import {api,errorMessage} from '@/lib/api';
import {formatJalali} from '@/lib/format';

/** Explicit searches and selection: no implicit ownership, no stock reservation. */
export function ReferenceLookup({kind,onSelect}:{kind:ReferenceKind;onSelect?:(record:ReferenceRecord)=>void}){
 const [query,setQuery]=useState(''),[records,setRecords]=useState<ReferenceRecord[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false),[truncated,setTruncated]=useState(false);
 const request=useRef(0);const parts=kind==='parts';
 async function search(){
  if(query.trim().length<(parts?2:6)){setError(parts?'حداقل دو نویسه وارد کنید':'شماره شاسی یا VIN کامل را وارد کنید (حداقل شش نویسه)');return;}
  const id=++request.current;setBusy(true);setError('');setRecords([]);setSearched(false);
  try{const result=await api<{records:ReferenceRecord[];truncated:boolean}>(`/reference-data/${kind}/search`,{body:{query}});if(id===request.current){setRecords(result.records);setTruncated(result.truncated);setSearched(true);}}
  catch(e){if(id===request.current)setError(errorMessage(e));}finally{if(id===request.current)setBusy(false);}
 }
 return <fieldset className="stack" style={{minInlineSize:0}}>
  <legend>{parts?'جست‌وجوی کد فنی یا نام قطعه':'جست‌وجوی سابقه مشتری با شماره شاسی'}</legend>
  <label className="field"><span>{parts?'کد فنی یا نام قطعه':'VIN کامل یا شماره شاسی عین سابقه'}</span><input className="input" name={`reference-${kind}-query`} value={query} autoComplete="off" spellCheck={false} maxLength={100} onChange={e=>{++request.current;setQuery(e.target.value);setRecords([]);setSearched(false);setBusy(false);setError('');}} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();void search();}}}/></label>
  <div><button type="button" className="btn" disabled={busy} onClick={()=>void search()}>{busy?'در حال جست‌وجو…':'جست‌وجو در اطلاعات پایه'}</button></div>
  <div role="status" aria-live="polite">{error&&<p className="callout callout-red">{error}</p>}{searched&&!records.length&&<p>سابقه‌ای پیدا نشد؛ می‌توانید اطلاعات را دستی وارد کنید.</p>}{truncated&&<p>بیش از ۲۰ نتیجه وجود دارد؛ جست‌وجو را دقیق‌تر کنید.</p>}</div>
  {!parts&&records.length>0&&<p className="callout callout-amber small">این‌ها سوابق گذشته‌اند. مشتری و مالک فعلی را تأیید کنید؛ انتخاب سابقه فقط خانه‌های خالی فرم را تکمیل می‌کند.</p>}
  {records.map(r=><article className="panel" key={r.id}><div className="panel-body stack">
   {parts?<><strong><bdi>{r.data.partNumber}</bdi> — {r.data.description}</strong><p className="small">واحد: {r.data.unit||'نامعلوم'} · محل: {r.data.location||'نامعلوم'}</p>{r.data.quantity&&<p className="small">موجودی درج‌شده در فایل: {r.data.quantity}؛ {String((r.data as Record<string,string>)._quantityFileName||r.fileName)} · زمان ورود: {formatJalali((r.data as Record<string,string>)._quantityImportedAt||r.importedAt,{time:true})}</p>}<p className="xs muted">این عدد تأیید موجودی لحظه‌ای یا رزرو قطعه نیست.</p></>:
    <><strong>{r.data.fullName||'نام ثبت نشده'} — {r.data.model||'مدل ثبت نشده'}</strong><p><bdi>{r.data.vin||r.data.chassis}</bdi> · {r.data.plate||'پلاک نامعلوم'}</p><p>تلفن: <bdi>{r.data.phone||'ثبت نشده'}</bdi></p><p className="small">تاریخ سابقه عین فایل: {r.data.visitedOn||'نامعلوم'} · منبع: {r.fileName}</p></>}
   {onSelect&&<div><button type="button" className="btn btn-primary" onClick={()=>onSelect(r)}>{parts?'انتخاب این قطعه':'استفاده از اطلاعات این سابقه'}</button></div>}
  </div></article>)}
 </fieldset>;
}
