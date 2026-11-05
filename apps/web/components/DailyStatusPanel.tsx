'use client';
import Link from 'next/link';
import useSWR from 'swr';
import {DAILY_REPORT_KIND_LABELS,type DailyReportKind,type DailyReportsStatus} from '@manage/shared';
import {fetcher} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {faNum,formatJalali} from '@/lib/format';
import {AppIcon} from './AppIcon';

/** Freshness of the two daily reports and today's work; a warning only, it never blocks anything. */
export function DailyStatusPanel(){
 const {can}=useAuth();const visible=can('daily_reports.upload')||can('stock.read')||can('emdad.read');
 const {data,error}=useSWR<DailyReportsStatus>(visible?'/daily-reports/status':null,fetcher,{refreshInterval:60_000});
 if(!visible)return null;
 if(error)return <p className="callout callout-amber small" role="alert">وضعیت گزارش‌های روزانه دریافت نشد؛ صفحه را تازه کنید.</p>;
 if(!data)return <p className="muted small" role="status">در حال دریافت وضعیت گزارش‌های روزانه…</p>;
 const kinds:DailyReportKind[]=['stock','emdad'];
 const items=[
  {show:can('emdad.read'),label:'پیگیری شرکت (باز)',value:data.counts.emdadOpen,href:'/emdad?openOnly=1',icon:'clock' as const},
  {show:can('emdad.read'),label:'پیگیری‌های من',value:data.counts.emdadMine,href:'/emdad?openOnly=1&assignee=me',icon:'user' as const},
  {show:can('emdad.read'),label:'موعد تا امروز',value:data.counts.emdadDueToday,href:'/emdad?openOnly=1&dueToday=1',icon:'clock' as const},
  {show:can('emdad.read'),label:'مغایرت و نیازمند بررسی',value:data.counts.emdadReview,href:'/emdad?review=1',icon:'alert' as const},
  {show:can('stock.read'),label:'رزروهای فعال',value:data.counts.reservationsActive,href:'/stock?status=reserved',icon:'box' as const},
  {show:can('stock.read'),label:'خروج‌های منتظر انعکاس',value:data.counts.reconciliation,href:'/stock?reconcile=1',icon:'file' as const},
 ].filter(x=>x.show);
 return <section className="panel" aria-label="وضعیت گزارش‌های روزانه" data-testid="daily-status"><div className="panel-head"><h2>گزارش‌های روزانه قطعات</h2>{(can('daily_reports.upload')||can('daily_reports.apply'))&&<Link className="btn btn-sm btn-primary" href="/daily-reports">به‌روزرسانی گزارش‌های روزانه</Link>}</div>
 <div className="panel-body stack"><div className="daily-kinds">{kinds.map(k=>{const last=data[k],task=data.tasks.find(t=>t.kind===k);const done=task?.status==='done';
  return <article key={k} className={`daily-kind${done?' is-done':task?.late?' is-late':''}`} data-testid={`daily-kind-${k}`}><strong><AppIcon name={k==='stock'?'box':'clock'}/> {DAILY_REPORT_KIND_LABELS[k]}</strong>
  <span className={`chip ${done?'chip-green':task?.late?'chip-red':'chip-amber'}`}>{done?(task?.unchangedDeclared?'امروز ثبت شد (بدون تغییر، با تأیید)':'امروز ثبت شد'):task?.late?'برای امروز به‌روزرسانی نشده؛ با تأخیر':'برای امروز به‌روزرسانی نشده'}</span>
  <span className="small">آخرین گزارش: {last?.lastReportAt?formatJalali(last.lastReportAt,{time:last.precision!=='day'}):'هنوز ثبت نشده'}{last?.precision==='day'&&' (بدون ساعت)'}</span>
  {task&&<span className="xs muted">موعد امروز: {formatJalali(task.dueAt,{time:true})}</span>}</article>;})}</div>
 {items.length>0&&<nav className="kpis" aria-label="کارهای امروز قطعات">{items.map(i=><Link key={i.label} href={i.href} className="kpi"><span className="kpi-value">{faNum(i.value)}</span><span className="kpi-label small"><AppIcon name={i.icon}/> {i.label}</span></Link>)}</nav>}
 <p className="xs muted">انجام‌نشدن به‌روزرسانی فقط هشدار است و کاری را متوقف نمی‌کند؛ آخرین داده با زمان خودش قابل استفاده می‌ماند.</p></div></section>;
}
