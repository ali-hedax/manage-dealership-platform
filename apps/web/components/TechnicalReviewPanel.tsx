'use client';

import { useState } from 'react';
import useSWR from 'swr';
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
  const [reason,setReason]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const rows=(data??[]).filter(r=>r.assessmentId===assessment.id);
  if(assessment.status!=='draft'||!rows.length) return null;
  async function decide(r:Review,action:'accept'|'return'|'reset') {
    if(busy) return;
    const explanation=(reason[r.itemId]??'').trim();
    if(action==='return'&&!explanation){toast('برای برگشت قطعه، دلیل اصلاح را وارد کنید','error');return;}
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
    }finally{setBusy(null);}
  }
  const accepted=rows.filter(r=>r.status==='accepted').length;
  const returned=rows.filter(r=>r.status==='returned').length;
  return <div className="panel-body stack" data-testid="technical-review-panel" dir="rtl">
    <div className="row" style={{justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
      <div><strong>بررسی شماره فنی توسط مسئول قطعات</strong>
        <p className="small muted">از {rows.length} قلم: {accepted} تأیید، {returned} نیازمند اصلاح. هر قلم مستقل بررسی می‌شود.</p>
      </div>
    </div>
    {rows.map(r=><div key={r.itemId} className="panel" style={{padding:12}}>
      <div className="row" style={{justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        <div><strong>{r.description}</strong><div className="small muted"><bdi>{r.partNumber??'شماره فنی ثبت نشده'}</bdi></div></div>
        <span className={`chip ${badge[r.status]}`}>{label[r.status]}</span>
      </div>
      {r.status==='returned'&&r.reason&&<p className="callout callout-amber small">دلیل برگشت: {r.reason}</p>}
      {r.stale&&<p className="callout callout-amber small">اطلاعات قطعه تغییر کرده است؛ برای بررسی دوباره ابتدا «بازنشانی بررسی» را بزنید.</p>}
      {can('part.manage')&&<div className="stack">
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
