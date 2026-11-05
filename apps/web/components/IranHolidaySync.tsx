'use client';
import {useState} from 'react';
import useSWR from 'swr';
import {parseIranHolidays,type WorkCalendar} from '@manage/shared';
import {fetcher,errorMessage} from '@/lib/api';
import {faNum,formatJalali} from '@/lib/format';

type Holiday={date:string;title:string;tentative:boolean};
type Feed={fetchedAt:string;from:string;to:string;items:Holiday[]};
/** Public holiday suggestions only; the existing audited calendar save activates the revision. */
export function IranHolidaySync({calendar,onChange}:{calendar:WorkCalendar;onChange:(value:WorkCalendar)=>void}){
 const {data:online,error,isValidating,mutate}=useSWR<Feed>('/workshop/calendar/iran-holidays',fetcher,{refreshInterval:60*60_000,revalidateOnFocus:true,shouldRetryOnError:false});
 const [fileFeed,setFileFeed]=useState<Feed|null>(null),[fileError,setFileError]=useState('');const data=fileFeed??online;
 const [selected,setSelected]=useState<string[]>([]),[message,setMessage]=useState('');
 const today=new Date(Date.now()+210*60_000).toISOString().slice(0,10);
 const items=data?.items.filter(h=>h.date>=today)??[];
 async function readFile(file:File|undefined){if(!file)return;setFileError('');try{if(file.size>2_000_000)throw new Error('HOLIDAY_FILE_TOO_LARGE');const text=await file.text();if(!/X-WR-CALNAME:.*(?:ایران|Iran)/i.test(text))throw new Error('NOT_IRAN_CALENDAR');const year=Number(today.slice(0,4)),from=`${year}-01-01`,to=`${year+1}-12-31`;const items=parseIranHolidays(text,from,to);if(!items.length)throw new Error('EMPTY_HOLIDAY_RANGE');setFileFeed({fetchedAt:new Date().toISOString(),from,to,items});setSelected([]);setMessage('فایل تقویم خوانده شد؛ تاریخ‌ها را پیش از اعمال بررسی کنید.');}catch{setFileError('فایل تقویم قابل استفاده نیست. فایل اصلی .ics تعطیلات ایران را دریافت و دوباره انتخاب کنید.');}}
 function apply(){
  const accepted=items.filter(h=>!h.tentative||selected.includes(h.date));
  const merged=new Map(calendar.holidays.filter(h=>h.source!=='google_iran'||h.date<today).map(h=>[h.date,h]));
  for(const h of accepted){if(!merged.has(h.date))merged.set(h.date,{date:h.date,title:h.title,official:true,source:'google_iran'});}
  onChange({...calendar,holidays:[...merged.values()].sort((a,b)=>a.date.localeCompare(b.date))});
  setMessage('تعطیلات به پیش‌نویس اضافه شد. بازه بررسی‌شده و دلیل تغییر را تکمیل کنید و «ثبت نسخه تازه تقویم» را بزنید.');
 }
 return <div className="holiday-sync stack"><div className="row"><strong>تعطیلات ایران از گوگل</strong><button type="button" className="btn btn-sm" disabled={isValidating} onClick={()=>void mutate()}>{isValidating?'در حال دریافت…':'دریافت تازه'}</button></div>
  <p className="small muted">فهرست هنگام بازکردن این صفحه و هر ساعت به‌روز می‌شود. مناسبت‌های غیرتعطیل حذف می‌شوند؛ ساعت کار و تعطیلی اختصاصی نمایندگی حفظ می‌شود. برنامه‌های ثبت‌شدهٔ قبلی تغییر نمی‌کنند.</p>
  {error&&!fileFeed&&<p role="alert">{errorMessage(error)}</p>}
  <details className="compact-disclosure"><summary>دریافت از فایل؛ اگر اتصال مستقیم برقرار نیست</summary><div className="stack"><p className="small">فایل تقویم ایران را از گوگل دریافت کنید و همین‌جا باز کنید. فایل روی دستگاه خوانده می‌شود؛ فقط تاریخ‌های بررسی‌شده هنگام ثبت نسخه تقویم ذخیره می‌شوند.</p><a className="btn" href="https://calendar.google.com/calendar/ical/fa.ir%23holiday%40group.v.calendar.google.com/public/basic.ics" target="_blank" rel="noreferrer">دریافت فایل تعطیلات ایران از گوگل</a><label className="field">فایل تقویم گوگل (.ics)<input className="input" type="file" accept=".ics,text/calendar" onChange={e=>{void readFile(e.target.files?.[0]);e.currentTarget.value='';}}/></label>{fileError&&<p role="alert">{fileError}</p>}{fileFeed&&<button type="button" className="btn" onClick={()=>{setFileFeed(null);setSelected([]);void mutate();}}>بازگشت به دریافت مستقیم</button>}</div></details>
  {data&&<><p className="small">آخرین دریافت: {formatJalali(data.fetchedAt)} · {faNum(items.length)} تعطیلی پیش رو</p><details className="compact-disclosure"><summary>بررسی تعطیلات دریافتی</summary><div className="stack">{items.map(h=><div className="row" key={h.date}><span>{formatJalali(h.date+'T08:00:00+03:30')} · {h.title}</span>{h.tentative?<label><input type="checkbox" checked={selected.includes(h.date)} onChange={e=>setSelected(s=>e.target.checked?[...s,h.date]:s.filter(d=>d!==h.date))}/> تاریخ احتمالی؛ پس از بررسی انتخاب کنید</label>:<span className="chip">تعطیلی عمومی</span>}</div>)}</div></details><p className="small">تاریخ‌های احتمالی فقط با انتخاب شما وارد می‌شوند. تغییر رسمی یا تعطیلی اضطراری را با ابلاغ معتبر تطبیق دهید.</p><button type="button" className="btn" onClick={apply}>اعمال فهرست در پیش‌نویس تقویم</button></>}
  {message&&<p role="status">{message}</p>}
 </div>;
}
