'use client';

import { useRef, useState } from 'react';
import useSWR, {useSWRConfig} from 'swr';
import type { Assessment } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

type Review = {
  itemId: string; assessmentId: string; description: string; partNumber: string | null;
  status: 'pending' | 'accepted' | 'returned'; reason: string | null; version: number;
  reviewedAt: string | null; stale: boolean;
};

const badge: Record<Review['status'], string> = {
  pending: 'chip-amber', accepted: 'chip-green', returned: 'chip-red',
};
const label: Record<Review['status'], string> = {
  pending: 'در انتظار بررسی', accepted: 'تأیید فنی قطعه', returned: 'نیازمند اصلاح',
};

/** Internal technical-code review — NOT insurance authorization or a purchasing permit. */
export function TechnicalReviewPanel({caseId, assessment}:{caseId:string;assessment:Assessment}) {
  const {can} = useAuth();
  const toast=useToast();
  const {data,mutate}=useSWR<Review[]>(`/cases/${caseId}/technical-reviews`,fetcher);
  const {data:handoff,mutate:refreshHandoff}=useSWR<{submitted:boolean}>(`/assessments/${assessment.id}/package`,fetcher);
  const {mutate:refreshCache}=useSWRConfig();
  const [codes,setCodes]=useState<Record<string,string>>({});
  const pending = useRef(false);
  async function packageAction(path:string, method:'POST'|'PATCH'='POST', extra:Record<string,string>={}) {
    if (pending.current) return;
    pending.current = true;
    setBusy(path);
    try {
      await api(path,{method,body:{expectedVersion:assessment.version,...extra}});
      await Promise.all([mutate(),refreshHandoff(),refreshCache(`/cases/${caseId}/assessments`),refreshCache(`/cases/${caseId}`)]);
      toast('عملیات کارشناسی ثبت شد');
    } catch (err) {
      toast(errorMessage(err),'error');
      await Promise.all([mutate(),refreshHandoff(),refreshCache(`/cases/${caseId}/assessments`)]);
    } finally { pending.current = false; setBusy(null); }
  }
  const [reason,setReason]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const rows=(data??[]).filter(r=>r.assessmentId===assessment.id);
  if(!rows.length) return null;
  async function decide(r:Review,action:'accept'|'return'|'reset') {
    if(pending.current) return;
    const explanation=(reason[r.itemId]??'').trim();
    if(action==='return'&&!explanation){toast('برای برگشت قطعه، دلیل اصلاح را وارد کنید','error');return;}
    pending.current = true;
    setBusy(r.itemId);
    try{
      await api(`/assessment-items/${r.itemId}/technical-review`,{
        body:{action,expectedVersion:r.version,reason:action==='return'?explanation:null},
      });
      await mutate();
      setReason(v=>({...v,[r.itemId]:''}));
      toast(action==='return'?'قطعه برای اصلاح علامت‌گذاری شد':action==='accept'?'شماره فنی قطعه تأیید شد':'بررسی به حالت اولیه برگشت');
    }catch(e){
      toast(errorMessage(e),'error');
      await mutate();
    }finally{pending.current=false;setBusy(null);}
  }
  const accepted=rows.filter(r=>r.status==='accepted').length;
  const returned=rows.filter(r=>r.status==='returned').length;
  return <div className="panel-body stack" data-testid="technical-review-panel" dir="rtl">
    <div className="row" style={{justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
      <div><strong>بررسی شماره فنی توسط مسئول قطعات</strong>
        <p className="small muted">از {rows.length} قلم: {accepted} تأیید، {returned} نیازمند اصلاح. هر قلم مستقل بررسی می‌شود.</p>
      </div>
    </div>
    {assessment.status==='draft' && handoff && <div className="row no-print">
      {handoff.submitted ? <strong>تحویل مسئول قطعات شد</strong> : can('assessment.manage') &&
        <button type="button" className="btn" disabled={!!busy} onClick={()=>void packageAction(`/assessments/${assessment.id}/package`)}>ارسال کل کارشناسی به مسئول قطعات</button>}
      {handoff.submitted && can('part.manage') && <button className="btn btn-primary" type="button"
        disabled={!!busy || rows.some(r=>r.status!=='accepted'||r.stale)}
        onClick={()=>void packageAction(`/assessments/${assessment.id}/package/finalize`)}>نهایی کردن کل کارشناسی</button>}
    </div>}
    {rows.map(r=><div key={r.itemId} className="panel" style={{padding:12}}>
      <div className="row" style={{justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        <div><strong>{r.description}</strong><div className="small muted"><bdi>{r.partNumber??'شماره فنی ثبت نشده'}</bdi></div></div>
        <span className={`chip ${badge[r.status]}`}>{label[r.status]}</span>
      </div>
      {r.status==='returned'&&r.reason&&<p className="callout callout-amber small">دلیل برگشت: {r.reason}</p>}
      {r.stale&&<p className="callout callout-amber small">اطلاعات قطعه تغییر کرده است؛ برای بررسی دوباره ابتدا «بازنشانی بررسی» را بزنید.</p>}
      {can('part.manage')&&assessment.status==='draft'&&<div className="stack">
        {handoff?.submitted && <details className="no-print">
          <summary>اصلاح شماره فنی یا حذف قلم</summary>
          <label className="field">شماره فنی اصلاح‌شده<input className="input" value={codes[r.itemId]??r.partNumber??''}
            maxLength={64} onChange={e=>setCodes(v=>({...v,[r.itemId]:e.target.value}))}/></label>
          <button type="button" className="btn btn-sm" disabled={!!busy||!codes[r.itemId]?.trim()||codes[r.itemId]?.trim()===r.partNumber}
            onClick={()=>void packageAction(`/assessment-items/${r.itemId}/technical-code`,'PATCH',{partNumber:codes[r.itemId]!.trim()})}>ثبت اصلاح شماره فنی</button>
          <button type="button" className="btn btn-sm" disabled={!!busy}
            onClick={()=>{if(window.confirm('این قلم از کارشناسی حذف شود؟')) void packageAction(`/assessment-items/${r.itemId}/technical-remove`);}}>حذف قلم</button>
        </details>}
        <label className="field"><span>دلیل اصلاح (هنگام برگشت الزامی)</span>
          <input className="input" value={reason[r.itemId]??''} maxLength={500}
            placeholder="مثلاً شماره فنی مناسب این تیپ نیست"
            onChange={e=>setReason(v=>({...v,[r.itemId]:e.target.value}))}
            disabled={busy!==null} />
        </label>
        <div className="row" style={{gap:8,flexWrap:'wrap'}}>
          <button type="button" className="btn btn-sm" disabled={busy!==null||r.stale} onClick={()=>void decide(r,'accept')}>تأیید فنی</button>
          <button type="button" className="btn btn-sm" disabled={busy!==null||r.stale} onClick={()=>void decide(r,'return')}>برگشت برای اصلاح</button>
          {(r.status!=='pending'||r.stale)&&<button type="button" className="btn btn-sm" disabled={busy!==null} onClick={()=>void decide(r,'reset')}>{r.stale?'بازنشانی بررسی':'لغو تصمیم'}</button>}
        </div>
      </div>}
    </div>)}
    <p className="xs muted">این تأیید داخلی صرفاً برای بررسی شماره فنی است و مجوز بیمه، کارت طلایی یا خرید محسوب نمی‌شود. اتصال وضعیت تأیید به اجازه ارسال برای تأمین در مرحله جداگانه بررسی خواهد شد.</p>
  </div>;
}
