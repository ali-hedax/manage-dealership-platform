'use client';
import {useState,type FormEvent} from 'react';
import useSWR from 'swr';
import {ROLES,ROLE_LABELS,type Role} from '@manage/shared';
import {api,fetcher,errorMessage} from '@/lib/api';
import {useAuth} from '@/lib/auth';
type UserRow={id:string;email:string;displayName:string;roles:Role[];isActive:boolean};
export default function UsersPage(){
  const {can}=useAuth();const allowed=can('user.manage');
  const {data,mutate}=useSWR<UserRow[]>(allowed?'/auth/invitations':null,fetcher);
  const [email,setEmail]=useState(''),[displayName,setName]=useState(''),[roles,setRoles]=useState<Role[]>(['accident_expert']);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false);
  const [invitationUrl,setInvitationUrl]=useState('');
  async function invite(input:{email:string;displayName:string;roles:Role[]}){
    setBusy(true);setError('');setSent(false);
    try{const result=await api<{invitationUrl:string}>('/auth/invitations',{body:input});setInvitationUrl(result.invitationUrl);setSent(true);await mutate();}catch(err){setError(errorMessage(err));}finally{setBusy(false);}
  }
  function submit(e:FormEvent){e.preventDefault();void invite({email:email.trim().toLowerCase(),displayName,roles});}
  if(!allowed)return <p>به مدیریت کاربران دسترسی ندارید.</p>;
  return <><div className="page-head"><h1>کاربران و دعوت‌نامه‌ها</h1></div>
    <section className="card"><h2>دعوت کاربر</h2><form className="form" onSubmit={submit}>
      <label className="field"><span>نام و نام خانوادگی</span><input className="input" required value={displayName} onChange={e=>setName(e.target.value)}/></label>
      <label className="field"><span>ایمیل</span><input className="input ltr-input" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <fieldset><legend>نقش‌ها</legend>{ROLES.map(role=><label key={role} style={{display:'block',marginBlock:10}}><input type="checkbox" checked={roles.includes(role)} onChange={e=>setRoles(e.target.checked?[...roles,role]:roles.filter(r=>r!==role))}/> {ROLE_LABELS[role]}</label>)}</fieldset>
      {error&&<div role="alert" className="callout callout-red">{error}</div>}{sent&&<><p role="status">لینک دعوت ساخته شد و ۲۴ ساعت اعتبار دارد. آن را فقط برای همان کاربر بفرستید؛ ایمیلی خودکار ارسال نمی‌شود.</p><label className="field"><span>لینک دعوت محرمانه</span><input className="input ltr-input" readOnly value={invitationUrl}/></label><button type="button" className="btn" onClick={()=>navigator.clipboard.writeText(invitationUrl).catch(()=>setError('کپی خودکار انجام نشد؛ لینک را انتخاب و کپی کنید.'))}>کپی لینک دعوت</button></>}
      <button className="btn btn-primary" disabled={busy||!roles.length}>{busy?'در حال ساخت…':'ساخت لینک دعوت'}</button>
    </form></section>
    <section className="card" style={{marginBlockStart:24}}><h2>حساب‌های ایمیلی</h2>{data?.map(u=><div key={u.id} style={{paddingBlock:16,borderBlockEnd:'1px solid var(--silver)'}}><strong>{u.displayName}</strong><p><bdi>{u.email}</bdi> — {u.isActive?'فعال':'در انتظار فعال‌سازی'}</p><p>{u.roles.map(r=>ROLE_LABELS[r]).join('، ')}</p>{!u.isActive&&<button className="btn" disabled={busy} onClick={()=>void invite(u)}>ساخت لینک تازه</button>}</div>)}</section>
  </>;
}
