'use client';
import {useSearchParams} from 'next/navigation';
import {Suspense,useState,type FormEvent} from 'react';
import useSWR from 'swr';
import {EMDAD_MATCH_LABELS,EMDAD_MATCH_STATUSES,EMDAD_STATUS_CATEGORIES,EMDAD_STATUS_CATEGORY_LABELS,toPersianDigits,type EmdadMatchStatus,type EmdadRequest,type EmdadStatusCategory,type Paged} from '@manage/shared';
import {api,errorMessage} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {faNum,formatJalali} from '@/lib/format';
import {useToast} from '@/lib/toast';
import {DailyStatusPanel} from '@/components/DailyStatusPanel';
import {EmdadDetail} from '@/components/EmdadDetail';

function Emdad(){
 const {can}=useAuth();const toast=useToast();const params=useSearchParams();
 const [term,setTerm]=useState(''),[q,setQ]=useState(''),[status,setStatus]=useState<EmdadStatusCategory|''>(''),[match,setMatch]=useState<EmdadMatchStatus|''>((params.get('match') as EmdadMatchStatus)||'');
 const [assignee,setAssignee]=useState<''|'me'|'none'>(params.get('assignee')==='me'?'me':''),[openOnly,setOpenOnly]=useState(params.get('openOnly')==='1'),[codeIssue,setCodeIssue]=useState(false),[stale,setStale]=useState(false),[page,setPage]=useState(1),[open,setOpen]=useState<string|null>(null);
 const [dueToday,setDueToday]=useState(params.get('dueToday')==='1'),[review,setReview]=useState(params.get('review')==='1');
 const filter={...(q?{q}:{}),...(status?{status}:{}),...(match?{match}:{}),...(assignee?{assignee}:{}),...(openOnly?{openOnly}:{}),...(dueToday?{dueToday}:{}),...(review?{review}:{}),...(codeIssue?{codeIssue}:{}),...(stale?{stale}:{})};
 const body={...filter,page,pageSize:25};
 // POST keeps chassis and admission numbers out of URLs and access logs.
 const {data,error,mutate,isLoading}=useSWR<Paged<EmdadRequest>>(can('emdad.read')?['/emdad/requests/search',JSON.stringify(body)]:null,([path,b]:[string,string])=>api<Paged<EmdadRequest>>(path,{body:JSON.parse(b)}));
 if(!can('emdad.read'))return <div className="callout"><h1>پیگیری امداد ویژه</h1><p>برای این بخش مجوز ندارید.</p></div>;
 function search(e:FormEvent){e.preventDefault();setQ(term.trim());setPage(1);}
 const change=<T,>(set:(v:T)=>void)=>(v:T)=>{set(v);setPage(1);};
 async function exportFile(){try{const res=await fetch('/api/v1/emdad/requests/export',{method:'POST',headers:{'content-type':'application/json','x-manage-client':'web'},body:JSON.stringify(filter)});if(!res.ok)throw new Error();const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download='emdad-follow-up.xlsx';a.click();URL.revokeObjectURL(url);}catch(e){toast(errorMessage(e),'error');}}
 const pages=Math.max(1,Math.ceil((data?.total??0)/25));
 return <div className="stack"><header className="unit-header"><div><h1>پیگیری امداد ویژه</h1><p className="muted">متن رسمی گزارش شرکت جدا از پیگیری داخلی منیج. وضعیت رسمی هیچ کاری را خودکار انجام نمی‌دهد و پرونده تازه نمی‌سازد.</p></div></header>
 <DailyStatusPanel/>
 <section className="panel"><div className="panel-head"><div><h2>درخواست‌ها</h2><p className="muted small" role="status">{data?`${faNum(data.total)} درخواست`:' '}</p></div><div className="row no-print"><button type="button" className="btn btn-sm" onClick={()=>void exportFile()}>خروجی Excel</button><button type="button" className="btn btn-sm" onClick={()=>window.print()}>چاپ</button></div></div><div className="panel-body stack">
  <form className="workspace-search no-print" onSubmit={search}><label className="field">پذیرش، شاسی، پرونده، شماره امداد یا کد<input className="input" name="emdad-query" value={term} maxLength={80} autoComplete="off" onChange={e=>setTerm(e.target.value)}/></label><button type="submit" className="btn btn-primary">جست‌وجو</button>
   <label className="field">وضعیت شرکت<select className="input" value={status} onChange={e=>change(setStatus)(e.target.value as EmdadStatusCategory|'')}><option value="">همه</option>{EMDAD_STATUS_CATEGORIES.map(s=><option key={s} value={s}>{EMDAD_STATUS_CATEGORY_LABELS[s]}</option>)}</select></label>
   <label className="field">اتصال<select className="input" value={match} onChange={e=>change(setMatch)(e.target.value as EmdadMatchStatus|'')}><option value="">همه</option>{EMDAD_MATCH_STATUSES.map(s=><option key={s} value={s}>{EMDAD_MATCH_LABELS[s]}</option>)}</select></label>
   <label className="field">مسئول<select className="input" value={assignee} onChange={e=>change(setAssignee)(e.target.value as ''|'me'|'none')}><option value="">همه</option><option value="me">من</option><option value="none">بدون مسئول</option></select></label>
   <label className="check"><input type="checkbox" checked={openOnly} onChange={e=>change(setOpenOnly)(e.target.checked)}/> فقط باز</label><label className="check"><input type="checkbox" checked={dueToday} onChange={e=>change(setDueToday)(e.target.checked)}/> موعد تا امروز</label><label className="check"><input type="checkbox" checked={review} onChange={e=>change(setReview)(e.target.checked)}/> نیازمند بررسی اتصال یا وضعیت</label><label className="check"><input type="checkbox" checked={codeIssue} onChange={e=>change(setCodeIssue)(e.target.checked)}/> مغایرت کد</label><label className="check"><input type="checkbox" checked={stale} onChange={e=>change(setStale)(e.target.checked)}/> در آخرین گزارش نبود</label></form>
  {error&&<p className="callout callout-red small" role="alert">{errorMessage(error)}</p>}{isLoading&&!data&&<p className="muted small" role="status">در حال دریافت…</p>}
  {data&&!data.total&&<p className="muted small">درخواستی با این فیلتر نیست.</p>}
  {!!data?.total&&<div className="table-scroll"><table className="table static" data-testid="emdad-list"><thead><tr><th>پرونده منیج / پذیرش</th><th>شاسی</th><th>امداد / درخواست</th><th>کد اولیه / قطعه / کامل</th><th>وضعیت ارسال (متن رسمی)</th><th>وضعیت امداد (متن رسمی)</th><th>اتصال</th><th>مسئول / اقدام بعدی</th></tr></thead>
  <tbody>{data.items.map(r=>{const o=r.official;const notes=(o.codeNotes as string[]|undefined)??[];return <tr key={r.id} data-testid="emdad-row"><td><button type="button" className="btn btn-sm btn-ghost" onClick={()=>setOpen(r.id)}>{r.caseNumber?<bdi>{toPersianDigits(r.caseNumber)}</bdi>:'جزئیات'}</button><div className="xs">پذیرش: <bdi>{toPersianDigits(r.admissionNo??'—')}</bdi></div></td><td><bdi>{toPersianDigits(r.chassis??'—')}</bdi></td><td className="small"><bdi>{toPersianDigits(r.emdadNo??'—')}</bdi><br/><bdi>{toPersianDigits(r.requestNo??'—')}</bdi></td><td className="small"><bdi>{toPersianDigits(r.initialCode??'—')}</bdi><br/><bdi>{toPersianDigits(String(o.partCode||'—'))}</bdi><br/><bdi>{toPersianDigits(String(o.fullCode||'—'))}</bdi>{notes.length>0&&<div><span className="chip chip-amber">مغایرت کد</span></div>}</td><td className="small">{String(o.sendStatus||'—')}</td><td className="small">{String(o.emdadStatus||'—')}{r.statusCategory==='needs_interpretation'&&<div><span className="chip chip-amber">نیازمند تفسیر وضعیت</span></div>}<div className="xs muted">گزارش {formatJalali(r.lastReportAt)}</div></td><td className="small">{EMDAD_MATCH_LABELS[r.matchStatus]}</td><td className="small">{r.assigneeName??'—'}{r.nextAction&&<div className="xs">{r.nextAction}</div>}{r.dueAt&&<div className="xs muted">موعد {formatJalali(r.dueAt)}</div>}</td></tr>;})}</tbody></table></div>}
  <div className="row no-print"><button type="button" className="btn btn-sm" disabled={page<=1} onClick={()=>setPage(page-1)}>صفحه قبل</button><span className="small">صفحه {faNum(page)} از {faNum(pages)}</span><button type="button" className="btn btn-sm" disabled={page>=pages} onClick={()=>setPage(page+1)}>صفحه بعد</button></div></div></section>
 {open&&<EmdadDetail id={open} onClose={()=>setOpen(null)} onChange={()=>void mutate()}/>}</div>;
}
export default function Page(){return <Suspense><Emdad/></Suspense>;}
