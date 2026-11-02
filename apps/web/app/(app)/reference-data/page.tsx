'use client';
import {useState} from 'react';
import useSWR from 'swr';
import {REFERENCE_FIELDS,REFERENCE_OUTCOME_LABELS,type ReferenceKind,type ReferenceField,type ReferenceFileInput,type ReferenceInspection,type ReferenceImport,type ReferenceOutcome} from '@manage/shared';
import {api,errorMessage,fetcher} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {faNum,formatJalali} from '@/lib/format';
import {ReferenceLookup} from '@/components/ReferenceLookup';

export default function ReferenceDataPage(){
 const {can}=useAuth();const [kind,setKind]=useState<ReferenceKind>(can('reference.parts.manage')?'parts':'customers');
 const [file,setFile]=useState<ReferenceFileInput|null>(null),[inspection,setInspection]=useState<ReferenceInspection|null>(null);
 const [sheetIndex,setSheetIndex]=useState(0),[headerRow,setHeaderRow]=useState(1),[mapping,setMapping]=useState<Partial<Record<ReferenceField,number>>>({});
 const [result,setResult]=useState<ReferenceImport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [page,setPage]=useState(0),[filter,setFilter]=useState<ReferenceOutcome|'all'>('all');
 const manage=can(`reference.${kind}.manage`),read=can(`reference.${kind}.read`);
 const {data:history,mutate}=useSWR<{count:number;imports:{id:string;fileName:string;status:string;createdAt:string}[]}>(manage?`/reference-data/${kind}`:null,fetcher);
 const sheet=inspection?.sheets[sheetIndex],headers=sheet?.rows.find(r=>r.rowNo===headerRow)?.cells||[];
 const ready=result?result.counts.new+result.counts.update:0;
 const allRows=result?.rows.filter(r=>filter==='all'||r.outcome===filter)||[];
 function reset(){setFile(null);setInspection(null);setMapping({});setResult(null);setError('');setSheetIndex(0);setHeaderRow(1);setPage(0);}
 async function choose(f:File|undefined){
  reset();if(!f)return;if(f.size>1_000_000){setError('فایل کمتر از یک مگابایت باشد؛ فایل بزرگ را به چند بخش تقسیم کنید');return;}
  setBusy(true);try{const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));const input={kind,fileName:f.name,fileBase64:btoa(binary)};const meta=await api<ReferenceInspection>('/reference-imports/inspect',{body:input});setFile(input);setInspection(meta);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 }
 async function preview(){if(!file)return;setError('');setBusy(true);try{setResult(await api<ReferenceImport>('/reference-imports',{body:{...file,kind,sheetIndex,headerRow,mapping}}));setPage(0);setFilter('all');await mutate();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 async function apply(){if(!result||!window.confirm(`${faNum(ready)} ردیف جدید و به‌روزرسانی در اطلاعات پایه ثبت شود؟ پرونده یا رزرو انبار ایجاد نمی‌شود.`))return;setBusy(true);setError('');try{setResult(await api<ReferenceImport>(`/reference-imports/${result.id}/apply`,{body:{}}));await mutate();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 async function loadResult(id:string){setBusy(true);setError('');try{setResult(await api<ReferenceImport>(`/reference-imports/${id}`));setFilter('all');setPage(0);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 if(!can('reference.parts.read')&&!can('reference.customers.read'))return <p>دسترسی به اطلاعات پایه ندارید.</p>;
 return <div className="stack"><div className="page-head"><div><h1>اطلاعات پایه</h1><p className="muted">فهرست قطعات و سوابق مشتریان، برای کاهش ورود تکراری اطلاعات.</p></div></div>
  <nav className="row" aria-label="نوع اطلاعات پایه">{(['parts','customers'] as const).filter(k=>can(`reference.${k}.read`)).map(k=><button key={k} className="btn" disabled={busy} aria-pressed={kind===k} onClick={()=>{reset();setKind(k);}}>{k==='parts'?'کاتالوگ قطعات':'سوابق مشتری و خودرو'}</button>)}</nav>
  {read&&<section className="panel"><div className="panel-body"><ReferenceLookup key={kind} kind={kind}/></div></section>}
  {manage&&<><section className="panel"><div className="panel-head"><h2>۱. ورود فایل اکسل</h2><a className="btn btn-sm" href={`/api/v1/reference-data/${kind}/sample`} download>دریافت قالب خالی</a></div><div className="panel-body stack">
   <p className="small">فقط فایل xlsx؛ حداکثر یک مگابایت و ده هزار ردیف در هر فایل. می‌توانید چند فایل وارد کنید. کد فنی، شاسی و تلفن را در اکسل به‌صورت متن نگه دارید تا صفرهای ابتدا از بین نروند.</p>
   <p className="callout callout-amber small">{kind==='parts'?'موجودی اکسل یک تصویر از فایل است؛ ورود فایل رزرو یا گردش انبار ایجاد نمی‌کند.':'این فایل سابقه مشتری است؛ ورود آن پرونده تعمیر یا مالکیت فعلی خودرو را ایجاد و تغییر نمی‌دهد.'}</p>
   <label className="field"><span>فایل اکسل اطلاعات پایه</span><input key={kind} className="input" name="reference-file" type="file" accept=".xlsx" disabled={busy} onChange={e=>void choose(e.target.files?.[0])}/></label>
   {inspection&&<><div className="grid-2"><label className="field"><span>برگه فایل</span><select className="input" name="reference-sheet" disabled={busy} value={sheetIndex} onChange={e=>{setSheetIndex(Number(e.target.value));setMapping({});setHeaderRow(1);setResult(null);}}>{inspection.sheets.map(s=><option value={s.index} key={s.index}>{s.name||`برگه ${s.index+1}`}</option>)}</select></label><label className="field"><span>ردیف عنوان ستون‌ها</span><select className="input" name="reference-header" disabled={busy} value={headerRow} onChange={e=>{setHeaderRow(Number(e.target.value));setMapping({});setResult(null);}}>{sheet?.rows.filter(r=>r.cells.some(Boolean)).map(r=><option key={r.rowNo} value={r.rowNo}>{faNum(r.rowNo)} — {r.cells.join(' | ').slice(0,100)}</option>)}</select></label></div>
    <fieldset className="stack"><legend>۲. انتخاب ستون‌ها</legend><div className="grid-2">{Object.entries(REFERENCE_FIELDS[kind]).map(([key,label])=><label className="field" key={key}><span>{label}</span><select className="input" name={`mapping-${key}`} disabled={busy} value={mapping[key as ReferenceField]??''} onChange={e=>{setMapping(m=>{const n={...m};if(e.target.value==='')delete n[key as ReferenceField];else n[key as ReferenceField]=Number(e.target.value);return n;});setResult(null);}}><option value="">انتخاب نشده</option>{headers.map((h,i)=><option key={i} value={i}>{faNum(i+1)} — {h||'بدون عنوان'}</option>)}</select></label>)}</div></fieldset>
    <div><button className="btn btn-primary" disabled={busy} onClick={()=>void preview()}>{busy?'در حال بررسی…':'پیش‌نمایش اطلاعات پایه'}</button></div>
   </>}
   {error&&<p role="alert" className="callout callout-red">{error}</p>}
  </div></section>
  {result&&<section className="panel" data-testid="reference-preview"><div className="panel-head"><h2>{result.status==='preview'?'۳. پیش‌نمایش':'نتیجه ورود'}</h2><div className="row"><a className="btn btn-sm" href={`/api/v1/reference-imports/${result.id}/report`} download>گزارش ردیف‌ها (Excel)</a>{result.status==='preview'&&<button className="btn btn-primary" disabled={busy||!ready} onClick={()=>void apply()}>ثبت {faNum(ready)} ردیف اطلاعات پایه</button>}</div></div><div className="panel-body stack"><p>{result.fileName} · {result.sheetName} · {faNum(result.rows.length)} ردیف</p><div className="row" role="group" aria-label="فیلتر ردیف‌های اطلاعات پایه"><button className="btn btn-sm" aria-pressed={filter==='all'} onClick={()=>{setFilter('all');setPage(0);}}>همه</button>{Object.entries(result.counts).filter(([,n])=>n>0).map(([o,n])=><button key={o} className="btn btn-sm" aria-pressed={filter===o} onClick={()=>{setFilter(o as ReferenceOutcome);setPage(0);}}>{REFERENCE_OUTCOME_LABELS[o as ReferenceOutcome]}: {faNum(n)}</button>)}</div><p className="small">ردیف‌های تکراری، نامعتبر یا دارای مغایرت ثبت نمی‌شوند. تمام ردیف‌ها در گزارش نتیجه باقی می‌مانند.</p><div className="table-scroll"><table className="table static"><thead><tr><th>ردیف</th><th>نتیجه</th><th>اطلاعات</th><th>پیام</th></tr></thead><tbody>{allRows.slice(page*50,(page+1)*50).map(r=><tr key={r.rowNo}><td>{faNum(r.rowNo)}</td><td>{REFERENCE_OUTCOME_LABELS[r.outcome]}</td><td>{Object.entries(r.data).map(([k,v])=><div key={k}>{(REFERENCE_FIELDS[kind] as Record<string,string>)[k]}: <bdi>{v}</bdi></div>)}</td><td>{r.messages.join('؛ ')||'—'}</td></tr>)}</tbody></table></div><div className="row"><button className="btn" disabled={page===0} onClick={()=>setPage(p=>p-1)}>قبلی</button><span>صفحه {faNum(page+1)} از {faNum(Math.max(1,Math.ceil(allRows.length/50)))}</span><button className="btn" disabled={(page+1)*50>=allRows.length} onClick={()=>setPage(p=>p+1)}>بعدی</button></div></div></section>}
  <section className="panel"><div className="panel-head"><h2>سابقه ورود فایل‌ها</h2><span>{faNum(history?.count||0)} رکورد مرجع</span></div><div className="panel-body stack">{history?.imports.map(i=><div className="row" key={i.id}><span>{i.fileName} · {formatJalali(i.createdAt,{time:true})} · {i.status==='applied'?'ثبت‌شده':'پیش‌نمایش'}</span><button className="btn btn-sm" disabled={busy} onClick={()=>void loadResult(i.id)}>نمایش نتیجه</button></div>)}</div></section></>}
 </div>;
}
