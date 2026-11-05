'use client';
import Link from 'next/link';
import {useEffect,useState,type FormEvent} from 'react';
import {api,errorMessage} from '@/lib/api';
type Enrollment={challengeId:string;proof:string;secret:string;qrDataUrl:string};
export function AuthenticatorSetup() {
  const [token,setToken]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
  const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
  const [error,setError]=useState(''),[done,setDone]=useState(false),[busy,setBusy]=useState(false),[recovery,setRecovery]=useState(false);
  useEffect(()=>{const params=new URLSearchParams(window.location.hash.slice(1)),value=params.get('token');if(value){setToken(value);setRecovery(params.get('mode')==='recovery');history.replaceState(null,'',window.location.pathname);}},[]);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      if(enrollment){await api('/auth/invitations/confirm',{body:{challengeId:enrollment.challengeId,proof:enrollment.proof,code}});setEnrollment(null);setDone(true);}
      else {setEnrollment(await api<Enrollment>('/auth/invitations/accept',{body:{token,password}}));setPassword('');setToken('');}
    }catch(err){setError(errorMessage(err));}finally{setBusy(false);}
  }
  return <div className="login"><div className="side"><img src="/brand/manage-logo-dark.svg" alt="Manage by HEDAX" width={190} height={48}/><div className="claim">حساب شخصی شما در Manage</div></div><form className="form" onSubmit={submit}>
    <h1>{enrollment?'اتصال Google Authenticator':recovery?'بازیابی دسترسی':'فعال‌سازی حساب'}</h1>
    {done?<><p role="status">{recovery?'دسترسی بازیابی شد و نشست‌های قبلی شما بسته شدند. ':'حساب فعال شد. '}پس از نمایش کد تازه در Authenticator، با ایمیل، رمز شخصی و آن کد وارد شوید.</p><Link className="btn btn-primary" href="/login">رفتن به ورود</Link></>:
      enrollment?<><p className="muted small">در Google Authenticator روی + و سپس «اسکن QR» بزنید. این صفحه را تا پایان فعال‌سازی نبندید.{recovery&&' پس از پایان، ورودی قدیمی Manage را از Authenticator پاک کنید؛ دیگر کار نمی‌کند.'}</p><img src={enrollment.qrDataUrl} alt="QR اتصال حساب به Authenticator؛ محرمانه نگه دارید" width={260} height={260} style={{maxInlineSize:'100%',blockSize:'auto',alignSelf:'center'}}/>
        <details><summary>ورود دستی به‌جای اسکن</summary><p className="small">در برنامه، «ورود کلید راه‌اندازی» و نوع «مبتنی بر زمان» را انتخاب کنید. این کلید را محرمانه نگه دارید.</p><code dir="ltr" style={{overflowWrap:'anywhere'}}>{enrollment.secret}</code></details>
        <label className="field"><span>کد شش‌رقمی Authenticator</span><input className="input ltr-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/\D/g,''))}/></label><button className="btn btn-primary" disabled={busy||code.length!==6}>{busy?'در حال تأیید…':recovery?'تأیید و بازیابی دسترسی':'تأیید و فعال‌سازی حساب'}</button></>:
      token?<><p className="muted small">یک رمز مخصوص Manage تعیین کنید؛ رمز Gmail خود را وارد نکنید.</p><label className="field"><span>رمز شخصی جدید</span><input className="input ltr-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} aria-describedby="password-help"/></label><p id="password-help" className="small muted">حداقل ۱۲ نویسه</p><button className="btn btn-primary" disabled={busy}>{busy?'در حال آماده‌سازی…':'ادامه و اتصال Authenticator'}</button></>:
      <p role="alert">برای فعال‌سازی، لینک دعوتی را که مدیر سامانه داده است باز کنید.</p>}
    {error&&<div className="callout callout-red" role="alert">{error}</div>}
    <Link className="small" href="/login">بازگشت به ورود</Link>
  </form></div>;
}
