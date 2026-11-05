'use client';
import {useSearchParams} from 'next/navigation';
import {Suspense,useState,type FormEvent} from 'react';
import useSWR from 'swr';
import {RESERVATION_STATUS_LABELS,RESERVATION_STATUSES,type ReservationStatus,type StockReservation} from '@manage/shared';
import {fetcher} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {faNum} from '@/lib/format';
import {DailyStatusPanel} from '@/components/DailyStatusPanel';
import {ReservationsTable} from '@/components/ReservationsTable';
import {StockOptionsTable} from '@/components/StockOptions';

function Stock(){
 const {can}=useAuth();const params=useSearchParams();
 const [term,setTerm]=useState(''),[query,setQuery]=useState(''),[needsMapping,setNeedsMapping]=useState(false);
 const [status,setStatus]=useState<ReservationStatus|''>((params.get('status') as ReservationStatus)||''),[reconcile,setReconcile]=useState(params.get('reconcile')==='1'),[shortOnly,setShortOnly]=useState(false),[page,setPage]=useState(1);
 const q=new URLSearchParams({page:String(page)});if(status)q.set('status',status);if(reconcile)q.set('reconcile','true');
 const {data,error,mutate}=useSWR<{items:StockReservation[]}>(can('stock.read')?`/stock/reservations?${q}`:null,fetcher);
 if(!can('stock.read'))return <div className="callout"><h1>موجودی و رزرو</h1><p>برای این بخش مجوز ندارید.</p></div>;
 function search(e:FormEvent){e.preventDefault();setQuery(term.trim());}
 const items=(data?.items??[]).filter(r=>!shortOnly||r.shortfall);
 const exportQuery=new URLSearchParams(q);exportQuery.delete('page');
 return <div className="stack"><header className="unit-header"><div><h1>موجودی روزانه و رزرو</h1><p className="muted">گزینه‌های هر کد پایه با موجودی و قیمت مستقل. رزرو اینجا <strong>رزرو داخلی منیج</strong> است و رزرو رسمی سامانه ایران‌خودرو نیست.</p></div></header>
 <DailyStatusPanel/>
 <section className="panel"><div className="panel-head"><h2>جست‌وجوی گزینه‌ها</h2></div><div className="panel-body stack"><form className="workspace-search" onSubmit={search}><label className="field">کد پایه، کد کامل یا نام قطعه<input className="input" name="stock-query" value={term} maxLength={80} autoComplete="off" onChange={e=>setTerm(e.target.value)} placeholder="مثلاً ۱۲۳۴۵۶۷۸"/></label><button type="submit" className="btn btn-primary">جست‌وجو</button><label className="check"><input type="checkbox" checked={needsMapping} onChange={e=>setNeedsMapping(e.target.checked)}/> فقط کدهای نیازمند تطبیق</label></form>
  {query||needsMapping?<StockOptionsTable key={`${query}-${needsMapping}`} query={query} needsMapping={needsMapping}/>:<p className="muted small">برای دیدن همه گزینه‌های یک خانواده، کد پایه هشت‌رقمی را جست‌وجو کنید. رزرو از داخل پرونده و برای نیاز قطعه مشخص انجام می‌شود.</p>}</div></section>
 <section className="panel"><div className="panel-head"><h2>رزروها و خروج‌های داخلی</h2><a className="btn btn-sm no-print" href={`/api/v1/stock/reservations/export?${exportQuery}`}>خروجی Excel</a></div><div className="panel-body stack"><div className="workspace-search"><label className="field">وضعیت<select className="input" value={status} onChange={e=>{setStatus(e.target.value as ReservationStatus|'');setReconcile(false);setPage(1);}}><option value="">همه</option>{RESERVATION_STATUSES.map(s=><option key={s} value={s}>{RESERVATION_STATUS_LABELS[s]}</option>)}</select></label><label className="check"><input type="checkbox" checked={reconcile} onChange={e=>{setReconcile(e.target.checked);setPage(1);}}/> فقط خروج‌های منتظر انعکاس</label><label className="check"><input type="checkbox" checked={shortOnly} onChange={e=>setShortOnly(e.target.checked)}/> فقط دارای کسری</label></div>
  {error&&<p className="callout callout-red small" role="alert">دریافت رزروها ناموفق بود.</p>}{!data&&!error&&<p className="muted small" role="status">در حال دریافت رزروها…</p>}
  {data&&!items.length&&<p className="muted small">رزروی با این فیلتر نیست.</p>}{!!items.length&&<ReservationsTable items={items} onChange={()=>void mutate()}/>}
  <div className="row"><button type="button" className="btn btn-sm" disabled={page<=1} onClick={()=>setPage(page-1)}>صفحه قبل</button><span className="small">صفحه {faNum(page)}</span><button type="button" className="btn btn-sm" disabled={(data?.items.length??0)<200} onClick={()=>setPage(page+1)}>صفحه بعد</button></div></div></section></div>;
}
export default function Page(){return <Suspense><Stock/></Suspense>;}
