'use client';
import {useSearchParams} from 'next/navigation';
import {Suspense,useEffect,useRef,useState} from 'react';
import useSWR,{mutate as refreshCache} from 'swr';
import {
 DAILY_IMPORT_STATUS_LABELS,DAILY_REPORT_KIND_LABELS,DAILY_ROW_OUTCOME_LABELS,DAILY_ROW_OUTCOMES,STOCK_COMPLETENESS_LABELS,STOCK_CURRENCY_LABELS,STOCK_QUANTITY_MEANING_LABELS,
 formatJalaliDateInput,formatTimeInput,toLatinDigits,toPersianDigits,type DailyImport,type DailyReportKind,type DailyRowOutcome,type UserRef,
} from '@manage/shared';
import {ApiError,api,errorMessage,fetcher} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {faNum,formatJalali} from '@/lib/format';
import {useToast} from '@/lib/toast';
import {DailyStatusPanel} from '@/components/DailyStatusPanel';

const MAX_BYTES=32*1024*1024;
const WORKING:DailyImport['status'][]=['uploaded','parsing','applying'];
type Rows={items:{rowNo:number;outcome:DailyRowOutcome;rowKey:string|null;data:Record<string,unknown>;messages:string[]}[];total:number;page:number;pageSize:number};
type Profile={kind:DailyReportKind;settings:{currency?:string|null;taxIncluded?:boolean|null;completeness?:string|null;scope?:string|null;quantityMeaning?:string|null;confirmedAt?:string};reminderTime:string;reminderUserId:string|null;headerConfirmed:boolean;version:number};

/** Raw bytes through XHR for a real progress bar; never base64 in JSON. */
function sendFile(kind:DailyReportKind,file:File,onProgress:(percent:number)=>void){
 return new Promise<DailyImport&{resumed:boolean}>((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST',`/api/v1/daily-reports/uploads?kind=${kind}&fileName=${encodeURIComponent(file.name)}`);
  xhr.setRequestHeader('x-manage-client','web');xhr.setRequestHeader('content-type','application/octet-stream');
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded*100/e.total));};
  xhr.onerror=()=>reject(new ApiError(0,'NETWORK','ارتباط قطع شد؛ همان فایل را دوباره انتخاب کنید. اگر پردازش آغاز شده باشد از همان‌جا ادامه می‌یابد.'));
  xhr.onload=()=>{let body:unknown=null;try{body=JSON.parse(xhr.responseText);}catch{}
   if(xhr.status>=200&&xhr.status<300)resolve(body as DailyImport&{resumed:boolean});
   else if(xhr.status===413)reject(new ApiError(413,'TOO_LARGE','حجم فایل بیش از سقف مجاز (۳۲ مگابایت) است'));
   else{const b=body as {code?:string;message?:string}|null;reject(new ApiError(xhr.status,b?.code??'HTTP_ERROR',b?.message??'بارگذاری فایل ناموفق بود'));}};
  xhr.send(file);
 });
}

function Report({kind,canUpload,canApply}:{kind:DailyReportKind;canUpload:boolean;canApply:boolean}){
 const toast=useToast();const input=useRef<HTMLInputElement>(null);
 const [activeId,setActiveId]=useState<string|null>(null),[upload,setUpload]=useState<number|null>(null),[error,setError]=useState('');
 const {data:history,mutate:refreshHistory}=useSWR<DailyImport[]>(`/daily-reports/imports?kind=${kind}`,fetcher);
 // A file waiting for confirmation is found again after a refresh or a lost connection.
 useEffect(()=>{if(activeId||!history)return;const open=history.find(i=>['uploaded','parsing','preview','failed'].includes(i.status));if(open)setActiveId(open.id);},[history,activeId]);
 const {data:job,mutate:refreshJob}=useSWR<DailyImport>(activeId?`/daily-reports/imports/${activeId}`:null,fetcher,{refreshInterval:i=>i&&WORKING.includes(i.status)?1500:0});
 async function choose(file:File|undefined){
  setError('');if(!file)return;
  const selectedKind=new URL(window.location.href).searchParams.get('kind')==='emdad'?'emdad':'stock';
  if(selectedKind!==kind){setError('نوع گزارش تغییر کرده است؛ فایل را دوباره انتخاب کنید');return;}
  if(file.size>MAX_BYTES){setError('حجم فایل بیش از سقف مجاز (۳۲ مگابایت) است');return;}
  setUpload(0);setActiveId(null);
  try{const r=await sendFile(kind,file,setUpload);setActiveId(r.id);if(r.resumed)toast('این فایل قبلاً بارگذاری شده بود؛ از همان‌جا ادامه می‌دهیم');await refreshHistory();}
  catch(e){setError(errorMessage(e));}finally{setUpload(null);if(input.current)input.current.value='';}
 }
 // History first: the "file waiting for confirmation" lookup must not find the closed job again.
 // Applying completes today's task and moves the profile version; a stale form would hit a version conflict.
 const closed=async()=>{await Promise.all([refreshHistory(),refreshCache('/daily-reports/status'),refreshCache(`/daily-reports/profiles/${kind}`)]);setActiveId(null);};
 return <div className="stack">
  {canUpload&&<section className="panel"><div className="panel-head"><h2>بارگذاری فایل {DAILY_REPORT_KIND_LABELS[kind]}</h2></div><div className="panel-body stack">
   <p className="small muted">{kind==='emdad'?'خروجی «گزارش امداد ویژه» را همان‌طور که از سامانه گرفته‌اید انتخاب کنید (پسوند xls). تغییر فونت یا ویرایش دستی لازم نیست. این گزارش معمولاً از ساعت ۱۰ آماده است.':'خروجی XLSX گزارش موجودی انبار را همان‌طور که از سامانه گرفته‌اید انتخاب کنید.'} حداکثر حجم ۳۲ مگابایت.</p>
   <label className="field"><span>انتخاب فایل</span><input ref={input} className="input" type="file" accept=".xls,.xlsx,.xml" disabled={upload!==null} onChange={e=>void choose(e.target.files?.[0])}/></label>
   {upload!==null&&<div role="status"><progress max={100} value={upload} aria-label="پیشرفت بارگذاری"/> <span className="small">در حال بارگذاری: {faNum(upload)}٪</span></div>}
   {error&&<p className="callout callout-red small" role="alert">{error}</p>}
  </div></section>}
  {job&&<Job job={job} canApply={canApply} canUpload={canUpload} refresh={()=>void refreshJob()} closed={closed}/>}
  <section className="panel"><div className="panel-head"><h2>سابقه ورود</h2></div><div className="panel-body">{!history&&<p role="status" className="muted small">در حال دریافت سابقه…</p>}{history&&!history.length&&<p className="muted small">هنوز فایلی ثبت نشده است.</p>}{!!history?.length&&<div className="table-scroll"><table className="table static"><thead><tr><th>زمان بارگذاری</th><th>فایل</th><th>زمان خود گزارش</th><th>وضعیت</th><th>نتیجه</th><th>بارگذار</th></tr></thead><tbody>{history.map(i=><tr key={i.id}><td>{formatJalali(i.createdAt,{time:true})}</td><td><button type="button" className="btn btn-sm btn-ghost" onClick={()=>setActiveId(i.id)}><bdi>{i.fileName}</bdi></button></td><td>{i.reportAt?formatJalali(i.reportAt,{time:i.reportAtPrecision!=='day'}):'—'}</td><td>{DAILY_IMPORT_STATUS_LABELS[i.status]}</td><td className="small">{faNum(i.counts.total??0)} ردیف</td><td className="small">{i.uploadedByName??'—'}</td></tr>)}</tbody></table></div>}</div></section>
 </div>;
}

function Job({job,canApply,canUpload,refresh,closed}:{job:DailyImport;canApply:boolean;canUpload:boolean;refresh:()=>void;closed:()=>Promise<void>}){
 const toast=useToast();
 const now=new Date();
 const [date,setDate]=useState(toPersianDigits(formatJalaliDateInput(now))),[time,setTime]=useState(''),[declared,setDeclared]=useState(false),[accept,setAccept]=useState(false),[today,setToday]=useState(false);
 const [outcome,setOutcome]=useState<DailyRowOutcome|''>(''),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const q=new URLSearchParams({page:String(page),pageSize:'25'});if(outcome)q.set('outcome',outcome);
 const showRows=['preview','applied'].includes(job.status);
 const {data:rows}=useSWR<Rows>(showRows?`/daily-reports/imports/${job.id}/rows?${q}`:null,fetcher);
 useEffect(()=>{setPage(1);},[outcome]);
 const counts=job.counts as Record<string,number|undefined>;
 const missing=(job.diagnostics.missingColumns as string[]|undefined)??[];
 async function act(path:string,body:object|undefined,done:string,after?:()=>Promise<void>){setBusy(true);setError('');try{await api(`/daily-reports/imports/${job.id}/${path}`,{method:'POST',body:body??{}});toast(done);if(after)await after();else refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 const body={reportDate:toLatinDigits(date.trim()),reportTime:time.trim()?toLatinDigits(time.trim()):null,declaration:declared,...(job.templateChanged?{acceptTemplate:accept}:{}),...(job.sameContent?{declaredToday:today}:{})};
 const ready=declared&&!!date.trim()&&(!job.templateChanged||accept);
 return <section className="panel" data-testid="daily-job"><div className="panel-head"><div><h2><bdi>{job.fileName}</bdi></h2><p className="xs muted">{faNum(Math.round(job.fileSize/1024))} کیلوبایت · {job.sheetName?<>برگه <bdi>{job.sheetName}</bdi> · </>:''}نسخه خواننده <bdi>{job.parserVersion}</bdi></p></div><span className={`chip ${job.status==='failed'?'chip-red':job.status==='applied'?'chip-green':'chip-blue'}`} role="status">{DAILY_IMPORT_STATUS_LABELS[job.status]}</span></div>
 <div className="panel-body stack">
  {WORKING.includes(job.status)&&<div role="status"><progress max={100} value={job.progress} aria-label="پیشرفت پردازش"/> <span className="small">در حال پردازش: {faNum(job.progress)}٪ — می‌توانید این صفحه را ببندید و بعد برگردید.</span></div>}
  {job.status==='failed'&&<div className="callout callout-red small" role="alert">{job.error??'پردازش ناموفق بود'}{canUpload&&<div className="row"><button className="btn btn-sm" disabled={busy} onClick={()=>void act('retry',undefined,'پردازش دوباره آغاز شد')}>تلاش دوباره</button></div>}</div>}
  {showRows&&<><div className="chips-row" data-testid="daily-counts"><span className="chip">کل ردیف: {faNum(counts.total??0)}</span>{DAILY_ROW_OUTCOMES.filter(o=>counts[o]).map(o=><span key={o} className={`chip${['invalid','duplicate','ambiguous','needs_mapping'].includes(o)?' chip-amber':''}`}>{DAILY_ROW_OUTCOME_LABELS[o]}: {faNum(counts[o]!)}</span>)}{counts.missing?<span className="chip chip-amber">در فایل نیست: {faNum(counts.missing)}</span>:null}{counts.matched!==undefined&&<span className="chip chip-green">متصل به پرونده: {faNum(counts.matched)}</span>}{counts.unmatched!==undefined&&<span className="chip">بدون اتصال قطعی: {faNum(counts.unmatched)}</span>}</div>
   {!!job.diagnostics.unescapedAmpersands&&<p className="xs muted">اصلاح محدود خروجی سامانه: {faNum(job.diagnostics.unescapedAmpersands as number)} نویسه «&» و {faNum((job.diagnostics.leadingWhitespace as number)??0)} نویسه فاصله ابتدای فایل. اصل فایل تغییر نکرد.</p>}
   {counts.missing?<p className="callout callout-blue small">{faNum(counts.missing)} ردیف فعال در این فایل نیست. تا مالک گزارش را «کامل» تأیید نکرده باشد، این یعنی صفرشدن موجودی نیست و آخرین مقدار با زمان خودش می‌ماند.</p>:null}
   <div className="workspace-search"><label className="field">نمایش ردیف‌ها<select className="input" value={outcome} onChange={e=>setOutcome(e.target.value as DailyRowOutcome|'')}><option value="">همه</option>{DAILY_ROW_OUTCOMES.map(o=><option key={o} value={o}>{DAILY_ROW_OUTCOME_LABELS[o]}</option>)}</select></label><a className="btn" href={`/api/v1/daily-reports/imports/${job.id}/report`}>دانلود نتیجه همه ردیف‌ها</a></div>
   {rows&&<RowsTable kind={job.kind} rows={rows} setPage={setPage}/>}</>}
  {job.status==='preview'&&canApply&&<form className="stack" onSubmit={e=>{e.preventDefault();void act('apply',body,'گزارش ثبت شد',closed);}}>
   <h3>تأیید و ثبت</h3><p className="small muted">فایل تاریخ تهیه ندارد؛ زمانی که این خروجی واقعاً مربوط به آن است را خودتان اعلام می‌کنید و همین اظهار ثبت می‌شود. اگر ساعت را نمی‌دانید خالی بگذارید؛ فقط تاریخ ثبت می‌شود.</p>
   <div className="grid-2"><label className="field"><span>تاریخ خود گزارش *</span><input className="input ltr-input" value={date} onChange={e=>setDate(e.target.value)} placeholder="۱۴۰۵/۰۸/۱۲" required/></label><label className="field"><span>ساعت گزارش (اختیاری)</span><input className="input ltr-input" value={time} onChange={e=>setTime(e.target.value)} placeholder={toPersianDigits(formatTimeInput(now))}/></label></div>
   {job.templateChanged&&<div className="callout callout-amber small"><p>ستون‌های این فایل با قالب تأییدشده فرق دارد{missing.length?` و ${faNum(missing.length)} ستون مورد انتظار پیدا نشد`:''}. پیش‌نمایش را با دقت ببینید.</p><label className="check"><input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)}/> نگاشت ستون‌ها را در پیش‌نمایش بررسی کردم و این قالب را می‌پذیرم</label></div>}
   {job.sameContent&&<div className="callout callout-amber small"><p>محتوای این فایل با گزارش ثبت‌شده یکسان است. فقط اگر واقعاً خروجی امروز است و تغییری نکرده، کار امروز با این فایل کامل می‌شود.</p><label className="check"><input type="checkbox" checked={today} onChange={e=>setToday(e.target.checked)}/> این خروجی امروز است و نسبت به قبل تغییری نکرده است</label></div>}
   <label className="check"><input type="checkbox" checked={declared} onChange={e=>setDeclared(e.target.checked)}/> تاریخ گزارش را خودم بررسی کردم و این خروجی مربوط به همین زمان است</label>
   {error&&<p className="callout callout-red small" role="alert">{error}</p>}
   <div className="row"><button type="submit" className="btn btn-primary" disabled={busy||!ready}>{busy?'در حال ثبت…':'ثبت گزارش'}</button>{canUpload&&<button type="button" className="btn" disabled={busy} onClick={()=>void act('discard',undefined,'فایل کنار گذاشته شد',closed)}>کنار گذاشتن</button>}</div>
  </form>}
  {job.status==='preview'&&!canApply&&<p className="callout callout-blue small">پیش‌نمایش آماده است؛ ثبت نهایی با همکار دارای مجوز ثبت گزارش انجام می‌شود.</p>}
  {job.status==='applied'&&<p className="callout callout-blue small">ثبت شد: {formatJalali(job.appliedAt,{time:true})}. زمان خود گزارش: {formatJalali(job.reportAt,{time:job.reportAtPrecision!=='day'})}{job.reportAtPrecision==='day'?' (بدون ساعت)':''}. فایل اصلی پاک شد و فقط اثر انگشت آن نگه داشته شده است.</p>}
 </div></section>;
}

function RowsTable({kind,rows,setPage}:{kind:DailyReportKind;rows:Rows;setPage:(p:number)=>void}){
 const pages=Math.max(1,Math.ceil(rows.total/rows.pageSize));
 const text=(v:unknown)=>v==null||v===''?'—':<bdi>{toPersianDigits(String(v))}</bdi>;
 return <><div className="table-scroll"><table className="table static" data-testid="daily-rows"><thead><tr><th>ردیف</th><th>نتیجه</th>{kind==='stock'?<><th>کد کامل</th><th>پایه / پسوند</th><th>شرح</th><th>موجودی</th><th>واحد</th></>:<><th>پذیرش / شاسی</th><th>امداد / درخواست</th><th>کد اولیه / قطعه / کامل</th><th>وضعیت امداد (متن رسمی)</th></>}<th>توضیح</th></tr></thead>
 <tbody>{rows.items.map(r=><tr key={r.rowNo}><td>{faNum(r.rowNo)}</td><td className="small">{DAILY_ROW_OUTCOME_LABELS[r.outcome]??r.outcome}</td>{kind==='stock'?<><td>{text(r.data.fullStockCode)}</td><td className="small">{text(r.data.basePartNumber)} / {text(r.data.supplySuffix)}</td><td className="small">{text(r.data.description)}</td><td>{text(r.data.quantity)}</td><td className="small">{text(r.data.unit)}</td></>:<><td className="small">{text(r.data.admissionNo)}<br/>{text(r.data.chassis)}</td><td className="small">{text(r.data.emdadNo)}<br/>{text(r.data.requestNo)}</td><td className="small">{text(r.data.initialCode)}<br/>{text(r.data.partCode)}<br/>{text(r.data.fullCode)}</td><td className="small">{text(r.data.emdadStatus)}</td></>}<td className="xs">{r.messages.join('؛ ')||'—'}</td></tr>)}</tbody></table></div>
 {!rows.items.length&&<p className="muted small">ردیفی با این فیلتر نیست.</p>}
 <div className="row"><button type="button" className="btn btn-sm" disabled={rows.page<=1} onClick={()=>setPage(rows.page-1)}>صفحه قبل</button><span className="small">صفحه {faNum(rows.page)} از {faNum(pages)} ({faNum(rows.total)} ردیف)</span><button type="button" className="btn btn-sm" disabled={rows.page>=pages} onClick={()=>setPage(rows.page+1)}>صفحه بعد</button></div></>;
}

function Settings({kind}:{kind:DailyReportKind}){
 const {me,can}=useAuth();const toast=useToast();
 const {data,mutate}=useSWR<Profile>(`/daily-reports/profiles/${kind}`,fetcher);
 const {data:staff}=useSWR<UserRef[]>(can('daily_reports.settings')?'/users/assignable':null,fetcher);
 const [form,setForm]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{if(!data)return;const s=data.settings;setForm({reminderTime:data.reminderTime,reminderUserId:data.reminderUserId??'',currency:s.currency??'',taxIncluded:s.taxIncluded==null?'':String(s.taxIncluded),completeness:s.completeness??'',scope:s.scope??'',quantityMeaning:s.quantityMeaning??''});},[data]);
 if(!data)return null;
 const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}));const owner=!!me.isOwner&&kind==='stock';const edit=can('daily_reports.settings');
 const confirmed=!!(data.settings.scope&&data.settings.completeness&&data.settings.quantityMeaning);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const body:Record<string,unknown>={expectedVersion:data!.version,reminderTime:toLatinDigits(form.reminderTime??''),reminderUserId:form.reminderUserId||null};
  if(owner)Object.assign(body,{currency:form.currency||null,taxIncluded:form.taxIncluded===''?null:form.taxIncluded==='true',completeness:form.completeness||null,scope:form.scope?.trim()||null,quantityMeaning:form.quantityMeaning||null});
  await mutate(await api<Profile>(`/daily-reports/profiles/${kind}`,{method:'PATCH',body}),{revalidate:false});toast('تنظیمات ذخیره شد');}catch(err){setError(errorMessage(err));}finally{setBusy(false);}}
 return <section className="panel"><div className="panel-head"><h2>تنظیمات این گزارش</h2></div><form className="panel-body stack" onSubmit={e=>void save(e)}>
  {kind==='stock'&&<>{!confirmed&&<p className="callout callout-amber small">دامنه انبار، کامل‌بودن و معنای ستون موجودی هنوز تأیید نشده؛ تا آن زمان موجودی فقط قابل مشاهده است و رزرو فعال نمی‌شود.</p>}{!data.settings.currency&&<p className="callout callout-amber small">واحد پول قیمت‌ها تأیید نشده است؛ قیمت‌ها با برچسب «واحد پول تأییدنشده» نمایش داده می‌شوند و مبنای مالی نیستند.</p>}
  <fieldset className="stack" disabled={!owner}><legend>تأیید مالک {owner?'':'(فقط مالک سامانه می‌تواند تغییر دهد)'}</legend><div className="grid-2">
   <label className="field"><span>دامنه انبار</span><input className="input" value={form.scope??''} maxLength={120} onChange={e=>set('scope',e.target.value)} placeholder="نام انبار یا فیلتر خروجی"/></label>
   <label className="field"><span>کامل‌بودن گزارش</span><select className="input" value={form.completeness??''} onChange={e=>set('completeness',e.target.value)}><option value="">تأیید نشده</option>{Object.entries(STOCK_COMPLETENESS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label className="field"><span>معنای ستون موجودی</span><select className="input" value={form.quantityMeaning??''} onChange={e=>set('quantityMeaning',e.target.value)}><option value="">تأیید نشده</option>{Object.entries(STOCK_QUANTITY_MEANING_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label className="field"><span>واحد پول قیمت‌ها</span><select className="input" value={form.currency??''} onChange={e=>set('currency',e.target.value)}><option value="">تأیید نشده</option>{Object.entries(STOCK_CURRENCY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label className="field"><span>شمول مالیات در قیمت</span><select className="input" value={form.taxIncluded??''} onChange={e=>set('taxIncluded',e.target.value)}><option value="">تأیید نشده</option><option value="true">با مالیات</option><option value="false">بدون مالیات</option></select></label>
  </div></fieldset></>}
  <fieldset className="stack" disabled={!edit}><legend>یادآوری روزانه داخل منیج</legend><div className="grid-2">
   <label className="field"><span>ساعت یادآوری (تهران)</span><input className="input ltr-input" value={form.reminderTime??''} onChange={e=>set('reminderTime',e.target.value)} placeholder="11:00"/></label>
   <label className="field"><span>مسئول یادآوری</span><select className="input" value={form.reminderUserId??''} onChange={e=>set('reminderUserId',e.target.value)}><option value="">همه دارندگان مجوز بارگذاری</option>{staff?.map(u=><option key={u.id} value={u.id}>{u.displayName}</option>)}</select></label>
  </div></fieldset>
  {error&&<p className="callout callout-red small" role="alert">{error}</p>}
  {(edit||owner)&&<div><button type="submit" className="btn btn-primary" disabled={busy}>{busy?'در حال ذخیره…':'ذخیره تنظیمات'}</button></div>}
 </form></section>;
}

function DailyReports(){
 const {can}=useAuth();const params=useSearchParams();
 const canUpload=can('daily_reports.upload'),canApply=can('daily_reports.apply');
 const kind:DailyReportKind=params.get('kind')==='emdad'?'emdad':'stock';
 if(!canUpload&&!canApply&&!can('daily_reports.settings'))return <div className="callout"><h1>به‌روزرسانی گزارش‌های روزانه</h1><p>برای این بخش مجوز ندارید. مالک می‌تواند از بخش کارکنان دسترسی بدهد.</p></div>;
 return <div className="stack"><header className="unit-header"><div><h1>به‌روزرسانی گزارش‌های روزانه</h1><p className="muted">هر روز دو فایل مستقل: انتخاب نوع، فایل، پیش‌نمایش، تأیید تاریخ و ثبت. هیچ داده‌ای پیش از تأیید شما تغییر نمی‌کند.</p></div></header>
 <DailyStatusPanel/>
 <div className="segmented" role="group" aria-label="نوع گزارش">{(['stock','emdad'] as const).map(k=><button key={k} type="button" aria-pressed={kind===k} onClick={()=>window.history.replaceState(null,'',`/daily-reports?kind=${k}`)}>{DAILY_REPORT_KIND_LABELS[k]}</button>)}</div>
 {(canUpload||canApply)&&<Report key={kind} kind={kind} canUpload={canUpload} canApply={canApply}/>}
 <Settings key={`s-${kind}`} kind={kind}/></div>;
}
export default function Page(){return <Suspense><DailyReports/></Suspense>;}
