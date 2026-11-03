'use client';
import {useState} from 'react';
import useSWR,{useSWRConfig} from 'swr';
import {STOCK_CURRENCY_LABELS,toLatinDigits,toPersianDigits,type StockOption,type StockSnapshotInfo} from '@manage/shared';
import {api,errorMessage,fetcher} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {isStockCacheKey} from '@/lib/stock-cache';
import {Dialog} from './Dialog';
import {faNum,formatJalali} from '@/lib/format';

export type OptionsPage={snapshot:StockSnapshotInfo|null;items:StockOption[];total:number;page:number;pageSize:number};
export const optionKey=(o:Pick<StockOption,'fullStockCode'|'locationAddress'>)=>`${o.fullStockCode}@${o.locationAddress}`;
const num=(v:string|null)=>v===null?'—':toPersianDigits(v);

/** Which report the numbers come from; an old report is labelled, never blocked. */
export function SnapshotNote({snapshot}:{snapshot:StockSnapshotInfo}){
 const currency=snapshot.currency?STOCK_CURRENCY_LABELS[snapshot.currency as keyof typeof STOCK_CURRENCY_LABELS]:null;
 return <p className={`callout small ${snapshot.fresh?'callout-blue':'callout-amber'}`} data-testid="snapshot-note">منبع: گزارش موجودی {formatJalali(snapshot.reportedAt,{time:snapshot.reportedAtPrecision!=='day'})}{snapshot.fresh?'':' — برای امروز به‌روزرسانی نشده'}{snapshot.scope?<> · دامنه: {snapshot.scope}</>:' · دامنه انبار تأیید نشده'} · قیمت‌ها: {currency??'واحد پول تأییدنشده'} · مالیات: {snapshot.taxIncluded===null?'تأیید نشده':snapshot.taxIncluded?'داخل قیمت':'خارج از قیمت'}؛ قیمت گزارش‌شده مبنای مالی یا مجوز خرید نیست.</p>;
}

/** Every option of the active report with paging and the total count; independent prices and quantities per exact code and location. */
export function StockOptionsTable({query,base,needsMapping,selected,onSelect,pageSize=30}:{query:string;base?:string;needsMapping?:boolean;selected?:string|null;onSelect?:(o:StockOption,snapshot:StockSnapshotInfo)=>void;pageSize?:number}){
 const {can}=useAuth();const {mutate}=useSWRConfig();
 const [mapping,setMapping]=useState<StockOption|null>(null),[aliasBase,setAliasBase]=useState(''),[aliasReason,setAliasReason]=useState(''),[aliasError,setAliasError]=useState(''),[saving,setSaving]=useState(false);
 async function saveAlias(){if(!mapping)return;setSaving(true);setAliasError('');try{await api('/stock/aliases',{body:{fullStockCode:mapping.fullStockCode,basePartNumber:aliasBase.trim()||null,reason:aliasReason.trim(),expectedVersion:mapping.alias?.version??0}});setMapping(null);await mutate(isStockCacheKey);}catch(e){setAliasError(errorMessage(e));}finally{setSaving(false);}}
 const [page,setPage]=useState(1);
 const q=new URLSearchParams({page:String(page),pageSize:String(pageSize)});if(query)q.set('q',query);if(base)q.set('base',base);if(needsMapping)q.set('needsMapping','true');
 const {data,error,isLoading}=useSWR<OptionsPage>(query||base||needsMapping?`/stock/options?${q}`:null,fetcher,{keepPreviousData:true});
 if(error)return <p className="callout callout-red small" role="alert">دریافت موجودی ناموفق بود؛ دوباره تلاش کنید.</p>;
 if(isLoading&&!data)return <p className="muted small" role="status">در حال دریافت گزینه‌ها…</p>;
 if(!data)return null;
 if(!data.snapshot)return <p className="callout callout-amber small">هنوز گزارش موجودی ثبت نشده است.</p>;
 const pages=Math.max(1,Math.ceil(data.total/data.pageSize));const snapshot=data.snapshot;
 return <div className="stack"><SnapshotNote snapshot={snapshot}/><p className="small" role="status">{faNum(data.total)} گزینه پیدا شد.</p>
  {!!data.total&&<div className="table-scroll"><table className="table static" data-testid="stock-options"><thead><tr>{onSelect&&<th>انتخاب</th>}<th>کد پایه</th><th>پسوند</th><th>کد کامل</th><th>شرح و مصرف</th><th>واحد</th><th>انبار / محل</th><th>گزارش‌شده</th><th>رزرو فعال</th><th>خروج منعکس‌نشده</th><th>قابل تخصیص</th><th>قیمت فروش</th><th>قیمت میانگین</th></tr></thead>
  <tbody>{data.items.map(o=>{const key=optionKey(o);return <tr key={key} data-testid="stock-option" className={Number(o.available)<0?'is-late':undefined}>
   {onSelect&&<td><input type="radio" name="stock-option" aria-label={`انتخاب کد ${o.fullStockCode} در ${o.locationAddress||'محل نامشخص'}`} checked={selected===key} onChange={()=>onSelect(o,snapshot)}/></td>}
   <td><bdi>{o.basePartNumber?toPersianDigits(o.basePartNumber):'—'}</bdi></td><td><bdi>{o.supplySuffix?toPersianDigits(o.supplySuffix):'—'}</bdi></td>
   <td><bdi>{toPersianDigits(o.fullStockCode)}</bdi>{o.codeKind==='needs_mapping'&&<div><span className={`chip ${o.alias?.basePartNumber?'chip-blue':'chip-amber'}`}>{o.alias?.basePartNumber?'اتصال خانواده با تأیید انسانی':'نیازمند تطبیق کد'}</span>{can('daily_reports.settings')&&<button type="button" className="btn btn-sm" onClick={()=>{setMapping(o);setAliasBase(o.alias?.basePartNumber??'');setAliasReason('');setAliasError('');}}>تنظیم اتصال خانواده</button>}</div>}</td>
   <td className="small">{o.description||'—'}{o.vehicleModel&&<div className="xs muted">{o.vehicleModel}</div>}{o.carriedReportedAt&&<div className="xs muted">در آخرین گزارش نبود؛ مقدار از گزارش {formatJalali(o.carriedReportedAt)}</div>}</td>
   <td className="small">{o.unit||'—'}</td><td className="small"><bdi>{o.locationAddress||'—'}</bdi>{o.locationText&&<div className="xs muted">{o.locationText}</div>}</td>
   <td>{num(o.reported)}</td><td>{num(o.reserved)}</td><td>{num(o.issuedUnreflected)}</td><td><strong>{num(o.available)}</strong>{Number(o.available)<0&&<div><span className="chip chip-red">کسری</span></div>}</td><td>{num(o.salePrice)}</td><td>{num(o.avgPrice)}</td></tr>;})}</tbody></table></div>}
  {pages>1&&<div className="row"><button type="button" className="btn btn-sm" disabled={page<=1} onClick={()=>setPage(page-1)}>صفحه قبل</button><span className="small">صفحه {faNum(page)} از {faNum(pages)}</span><button type="button" className="btn btn-sm" disabled={page>=pages} onClick={()=>setPage(page+1)}>صفحه بعد</button></div>}
 <Dialog open={!!mapping} title="اتصال تأییدشده کد به خانواده" onClose={()=>setMapping(null)} footer={<><button type="button" className="btn" onClick={()=>setMapping(null)}>انصراف</button><button type="button" className="btn btn-primary" disabled={saving||aliasReason.trim().length<3} onClick={()=>void saveAlias()}>ثبت اتصال خانواده</button></>}><div className="stack"><p>کد کامل: <bdi>{mapping?.fullStockCode}</bdi></p><p className="small muted">این اتصال فقط برای جست‌وجو و گروه‌بندی است؛ تأیید جایگزینی فنی نیست. کد کامل و موجودی هر گزینه جدا می‌ماند. برای قطع اتصال، کد پایه را خالی بگذارید.</p><label className="field">کد پایه تأییدشده (هشت رقم)<input className="input ltr-input" inputMode="numeric" maxLength={8} value={aliasBase} onChange={e=>setAliasBase(toLatinDigits(e.target.value))}/></label><label className="field">دلیل تأیید یا قطع اتصال<textarea className="input" maxLength={500} value={aliasReason} onChange={e=>setAliasReason(e.target.value)}/></label>{aliasError&&<p role="alert">{aliasError}</p>}</div></Dialog>
 </div>;
}
