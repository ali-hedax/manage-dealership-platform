'use client';
import {useEffect,useState,type FormEvent} from 'react';
import useSWR from 'swr';
import {ROLES,ROLE_LABELS,type Role} from '@manage/shared';
import {api,fetcher,errorMessage} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {AccessPanel} from '@/components/AccessPanel';
import {Dialog} from '@/components/Dialog';
import {permissionsFor,PERMISSION_LABELS,type PermissionTemplates} from '@manage/shared';
import { TechniciansPanel } from '@/components/TechniciansPanel';
import { OwnerAdminControls } from '@/components/OwnerAdminControls';

type UserRow={id:string;email:string;displayName:string;roles:Role[];isActive:boolean;invitationDelivery:string;invitationFailure:string|null;invitationExpiresAt:string|null};
type MailCheck={status:'ready'|'not_configured'|'failed';failure?:string};
type InvitationInput={email:string;displayName:string;roles:Role[]};
type Tab='staff'|'technicians'|'access';
// Old deep links (#access-control, #owner-admin, #invite-staff) still land on the right tab.
const TAB_FROM_HASH:Record<string,Tab>={staff:'staff','invite-staff':'staff',technicians:'technicians',access:'access','access-control':'access','owner-admin':'access'};
// Technicians get their own tab (username + 4-digit PIN); legacy roles are not offered for new staff.
const INVITE_ROLES=ROLES.filter(r=>!['accident_expert','accident_supervisor','technician'].includes(r));
const deliveryLabels:Record<string,string>={manual:'در انتظار فعال‌سازی با لینک دعوت',sending:'نتیجه ارسال مشخص نیست؛ در صورت نیاز دوباره بفرستید',sent:'دعوت ایمیل شد؛ در انتظار فعال‌سازی',failed:'ارسال ایمیل ناموفق بود'};
// Why a send or check failed; categories come from the API (never the raw SMTP error).
const failureLabels:Record<string,string>={
  connection_blocked:'سرور Manage به سرور ایمیل وصل نشد (مسدود یا بدون پاسخ). این مشکل شبکه سرور است، نه رمز یا نشانی همکار.',
  dns_failed:'نام سرور ایمیل پیدا نشد؛ تنظیمات SMTP را بررسی کنید.',
  tls_failed:'اتصال امن (TLS) با سرور ایمیل برقرار نشد؛ پورت و نوع اتصال را بررسی کنید.',
  auth_failed:'سرور ایمیل نام کاربری یا App Password فرستنده را نپذیرفت.',
  recipient_rejected:'سرور ایمیل نشانی گیرنده را نپذیرفت؛ نشانی ایمیل همکار را بررسی کنید.',
  unknown:'علت خطا مشخص نیست؛ اتصال ایمیل را بررسی کنید.',
};
const checkLabel=(c:MailCheck)=>c.status==='ready'?'اتصال، رمزنگاری و احراز هویت فرستنده موفق بود (پیامی ارسال نشد).':c.status==='not_configured'?'ارسال ایمیل هنوز روی سرور تنظیم نشده است.':failureLabels[c.failure??'unknown']??failureLabels.unknown;
const expired=(u:UserRow)=>!!u.invitationExpiresAt&&new Date(u.invitationExpiresAt).getTime()<Date.now();

export default function UsersPage(){
  const {can,me}=useAuth();const allowed=can('user.manage');
  const [tab,setTab]=useState<Tab>('technicians');
  const {data,error:listError,mutate,isLoading}=useSWR<UserRow[]>(allowed?'/auth/invitations':null,fetcher);
  const {data:technicians}=useSWR<unknown[]>(allowed?'/staff/technicians':null,fetcher);
  const {data:presets}=useSWR<{templates:PermissionTemplates;assignableRoles?:Role[]}>(allowed?'/access/presets':null,fetcher);
  const {data:mail,error:mailError}=useSWR<{configured:boolean}>(allowed?'/auth/invitations/email/status':null,fetcher);
  const [formOpen,setFormOpen]=useState(false);
  const [email,setEmail]=useState(''),[displayName,setName]=useState(''),[roles,setRoles]=useState<Role[]>(['accident_coordinator']);
  const [busyEmail,setBusyEmail]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [privateLink,setPrivateLink]=useState('');
  const [check,setCheck]=useState<MailCheck|null>(null),[checking,setChecking]=useState(false);
  const [recoveryFor,setRecoveryFor]=useState<UserRow|null>(null),[recoveryLink,setRecoveryLink]=useState(''),[recoveryBusy,setRecoveryBusy]=useState(false),[recoveryError,setRecoveryError]=useState(''),[recoveryCopied,setRecoveryCopied]=useState(false);
  function closeRecovery(){if(recoveryBusy)return;setRecoveryFor(null);setRecoveryLink('');setRecoveryError('');setRecoveryCopied(false);}
  async function issueRecovery(){if(!recoveryFor||recoveryBusy)return;setRecoveryBusy(true);setRecoveryError('');try{setRecoveryLink((await api<{recoveryUrl:string}>(`/auth/users/${recoveryFor.id}/recovery`,{body:{}})).recoveryUrl);}catch(err){setRecoveryError(errorMessage(err));}finally{setRecoveryBusy(false);}}
  useEffect(()=>{if(presets?.assignableRoles)setRoles(current=>{const next=current.filter(r=>presets.assignableRoles!.includes(r));return next.length?next:presets.assignableRoles!.filter(r=>INVITE_ROLES.includes(r)).slice(0,1);});},[presets]);
  // Tabs follow the address hash, also when the header shortcuts change it on this page.
  useEffect(()=>{
    function follow(){
      const hash=window.location.hash.slice(1),next=TAB_FROM_HASH[hash];
      if(!next)return;
      setTab(next==='access'&&!me.isOwner?'technicians':next);
      if(hash==='invite-staff')setFormOpen(true);
      if(['access-control','owner-admin'].includes(hash))requestAnimationFrame(()=>document.getElementById(hash)?.scrollIntoView({block:'start'}));
    }
    follow();
    window.addEventListener('hashchange',follow);
    return()=>window.removeEventListener('hashchange',follow);
  },[me.isOwner]);
  function choose(next:Tab){setTab(next);history.replaceState(null,'',next==='staff'?window.location.pathname:`#${next}`);}
  async function checkMail(){setChecking(true);setCheck(null);try{setCheck(await api<MailCheck>('/auth/invitations/email/check',{body:{}}));}catch(err){setError(errorMessage(err));}finally{setChecking(false);}}
  const busy=!!busyEmail;
  async function invite(input:InvitationInput,delivery:'email'|'manual'='email'){
    if(busy)return;
    setBusyEmail(input.email);setError('');setMessage('');setPrivateLink('');
    try{
      const result=await api<{emailDelivery?:'sent'|'failed';failure?:string;invitationUrl?:string}>(delivery==='email'?'/auth/invitations/email':'/auth/invitations',{body:{email:input.email,displayName:input.displayName,roles:input.roles}});
      if(delivery==='manual'&&result.invitationUrl){setPrivateLink(result.invitationUrl);setMessage(`لینک خصوصی برای ${input.email} ساخته شد و ۲۴ ساعت اعتبار دارد. فقط برای همین همکار بفرستید؛ ایمیلی ارسال نشده است.`);}
      else if(result.emailDelivery==='sent')setMessage(`سرور ایمیل دعوت‌نامه ${input.email} را پذیرفت؛ دعوت ۲۴ ساعت اعتبار دارد. رسیدن به صندوق را از همکار بپرسید؛ او رمز شخصی و Google Authenticator خودش را تنظیم می‌کند.`);
      else setError(`کارمند ثبت شد اما ارسال ایمیل موفق نبود: ${failureLabels[result.failure??'unknown']??failureLabels.unknown} لینک خصوصی بسازید و برایش بفرستید.`);
      if(formOpen&&input.email===email.trim().toLowerCase()){setName('');setEmail('');}
      await mutate();
    }catch(err){setError(errorMessage(err));}finally{setBusyEmail('');}
  }
  function submit(e:FormEvent){e.preventDefault();if(!roles.length){setError('حداقل یک نقش برای کارمند انتخاب کنید.');return;}const delivery=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-delivery')==='manual'?'manual':'email';void invite({email:email.trim().toLowerCase(),displayName:displayName.trim(),roles},delivery);}
  if(!allowed)return <p>به بخش کارکنان دسترسی ندارید.</p>;
  const ready=mail?.configured===true;
  const staff=data??[];
  const tabs:{id:Tab;label:string;count?:number}[]=[{id:'technicians',label:'کارکنان (رمز ۴ رقمی)',count:technicians?.length},{id:'staff',label:'حساب‌های قدیمی و دعوت‌ها',count:data?.length},...(me.isOwner?[{id:'access' as Tab,label:'دسترسی‌ها'}]:[])];

  return <><div className="page-head"><h1>کارکنان</h1></div>
    <div className="staff-tabs" role="tablist" aria-label="بخش‌های کارکنان">
      {tabs.map(t=><button key={t.id} type="button" role="tab" id={`staff-tab-${t.id}`} aria-selected={tab===t.id} aria-controls={`staff-panel-${t.id}`} onClick={()=>choose(t.id)}>{t.label}{t.count!==undefined&&<span className="staff-tab-count">{t.count.toLocaleString('fa-IR')}</span>}</button>)}
    </div>

    {tab==='staff'&&<div role="tabpanel" id="staff-panel-staff" aria-labelledby="staff-tab-staff" className="staff-panel">
      <div className="staff-panel-head">
        <p className="muted">این بخش فقط برای بررسی و انتقال ایمن حساب‌های قدیمی است. کارکنان جدید را از زبانه «کارکنان (رمز ۴ رقمی)» بسازید. مالک و مدیر سیستم همچنان با احراز هویت دومرحله‌ای وارد می‌شوند.</p>
        {!formOpen&&<button type="button" className="btn btn-primary" onClick={()=>{setFormOpen(true);setError('');setMessage('');setPrivateLink('');}}>افزودن کارمند</button>}
      </div>
      {mail?.configured===false&&<p className="callout callout-amber" role="status">ارسال خودکار ایمیل فعلاً ممکن نیست؛ سرور منیج به سرویس‌های ایمیل خارجی مثل Gmail دسترسی ندارد. لینک دعوت بسازید و در پیام‌رسان برای همکار بفرستید.</p>}
      {mailError&&<p role="alert" className="callout callout-red">وضعیت ارسال ایمیل دریافت نشد. صفحه را تازه کنید.</p>}

      {formOpen&&<section id="invite-staff" className="card" aria-labelledby="invite-title"><h2 id="invite-title">افزودن کارمند</h2>
        <form className="form" onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy} className="staff-form">
            <legend className="sr-only">مشخصات کارمند</legend>
            <div className="staff-form-row">
              <label className="field"><span>نام و نام خانوادگی</span><input name="displayName" className="input" autoComplete="name" required maxLength={120} value={displayName} onChange={e=>setName(e.target.value)}/></label>
              <label className="field"><span>ایمیل</span><input name="email" className="input ltr-input" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
            </div>
            <fieldset className="staff-roles"><legend>سمت</legend>
              {INVITE_ROLES.map(role=><label key={role}><input name="roles" value={role} type="checkbox" disabled={presets?.assignableRoles&&!presets.assignableRoles.includes(role)} checked={roles.includes(role)} onChange={e=>setRoles(e.target.checked?[...roles,role]:roles.filter(r=>r!==role))}/> {ROLE_LABELS[role]}</label>)}
            </fieldset>
            {!roles.length&&<p role="status" className="small">حداقل یک سمت انتخاب کنید.</p>}
            <details className="small"><summary>دسترسی‌های این سمت</summary><p>{presets?[...permissionsFor(roles,presets.templates)].map(p=>PERMISSION_LABELS[p]).join('، '):'در حال دریافت…'}</p></details>
            <div className="staff-form-actions">
              {ready&&<button type="submit" className="btn btn-primary">{busy?'در حال ارسال دعوت…':'افزودن و ارسال دعوت'}</button>}
              <button type="submit" data-delivery="manual" className={ready?'btn':'btn btn-primary'}>ساخت لینک دعوت خصوصی</button>
              <button type="button" className="btn btn-ghost" onClick={()=>{setFormOpen(false);setError('');}}>بستن</button>
              {ready&&<button type="button" className="btn btn-ghost" disabled={checking} onClick={()=>void checkMail()}>{checking?'در حال بررسی اتصال ایمیل…':'بررسی اتصال ایمیل'}</button>}
            </div>
            <span aria-live="polite" className="small" data-testid="mail-check">{check&&checkLabel(check)}</span>
          </fieldset>
        </form>
        <p className="small muted">همکار با لینک دعوت، رمز شخصی خودش را انتخاب می‌کند و Google Authenticator را وصل می‌کند. لینک ۲۴ ساعت اعتبار دارد و ساختن لینک تازه، لینک قبلی را باطل می‌کند.</p>
      </section>}

      {error&&<div role="alert" className="callout callout-red">{error}</div>}
      <div role="status" aria-live="polite" aria-atomic="true">{message&&<p className="callout">{message}</p>}</div>
      {privateLink&&<div className="callout"><label className="field" htmlFor="private-invitation"><span>لینک دعوت محرمانه</span></label><input id="private-invitation" className="input ltr-input" readOnly value={privateLink} onFocus={e=>e.target.select()}/><button type="button" className="btn" style={{marginBlockStart:12}} onClick={()=>void navigator.clipboard.writeText(privateLink).then(()=>setMessage('لینک دعوت کپی شد؛ فقط برای همان همکار بفرستید.')).catch(()=>setError('کپی خودکار انجام نشد؛ لینک را انتخاب و کپی کنید.'))}>کپی لینک دعوت</button></div>}

      <section className="card staff-list" aria-label="فهرست کارکنان">
        {isLoading&&<p role="status">در حال دریافت کارکنان…</p>}
        {listError&&<p role="alert">دریافت فهرست کارکنان ناموفق بود. <button type="button" className="btn" onClick={()=>void mutate()}>تلاش دوباره</button></p>}
        {data?.length===0&&<p className="muted">هنوز کارمندی اضافه نشده است.</p>}
        {staff.map(u=><article key={u.id} className="staff-person">
          <div className="staff-person-main">
            <h3>{u.displayName}</h3>
            <p className="small muted"><bdi>{u.email}</bdi></p>
            <p className="staff-person-tags">{u.roles.map(r=><span key={r} className="chip">{ROLE_LABELS[r]}</span>)}<span className={`chip ${u.isActive?'chip-green':expired(u)||u.invitationDelivery==='failed'?'chip-red':'chip-amber'}`}>{u.isActive?'فعال':expired(u)?'دعوت منقضی شده':deliveryLabels[u.invitationDelivery]??'در انتظار فعال‌سازی'}</span></p>
            {!u.isActive&&u.invitationDelivery==='failed'&&<p className="small">علت: {failureLabels[u.invitationFailure??'unknown']??failureLabels.unknown}</p>}
          </div>
          <div className="staff-person-actions">
            {!u.isActive&&ready&&<button type="button" className="btn btn-sm" disabled={busy} aria-label={`ارسال دوباره دعوت برای ${u.displayName}`} onClick={()=>void invite(u)}>{busyEmail===u.email?'در حال ارسال…':'ارسال دوباره دعوت'}</button>}
            {!u.isActive&&<button type="button" className="btn btn-sm" disabled={busy} aria-label={`ساخت لینک خصوصی برای ${u.displayName}`} onClick={()=>void invite(u,'manual')}>لینک دعوت تازه</button>}
            {me.isOwner&&u.isActive&&u.id!==me.id&&<button type="button" className="btn btn-sm" aria-label={`بازیابی دسترسی ${u.displayName}`} onClick={()=>setRecoveryFor(u)}>بازیابی دسترسی</button>}
          </div>
        </article>)}
      </section>
    </div>}

    {tab==='technicians'&&<div role="tabpanel" id="staff-panel-technicians" aria-labelledby="staff-tab-technicians" className="staff-panel"><TechniciansPanel/></div>}

    {tab==='access'&&me.isOwner&&<div role="tabpanel" id="staff-panel-access" aria-labelledby="staff-tab-access" className="staff-panel">
      <AccessPanel/>
      <OwnerAdminControls/>
    </div>}

    <Dialog open={!!recoveryFor} title={`بازیابی دسترسی ${recoveryFor?.displayName??''}`} onClose={closeRecovery} footer={recoveryLink?<button type="button" className="btn" onClick={closeRecovery}>بستن</button>:<><button type="button" className="btn" disabled={recoveryBusy} onClick={closeRecovery}>انصراف</button><button type="button" className="btn btn-primary" disabled={recoveryBusy} onClick={()=>void issueRecovery()}>{recoveryBusy?'در حال ساخت…':'ساخت لینک بازیابی'}</button></>}>
      {recoveryLink?<>
        <label className="field" htmlFor="private-recovery"><span>لینک بازیابی محرمانه</span></label>
        <input id="private-recovery" className="input ltr-input" readOnly value={recoveryLink} onFocus={e=>e.target.select()}/>
        <button type="button" className="btn" style={{marginBlockStart:12}} onClick={()=>void navigator.clipboard.writeText(recoveryLink).then(()=>setRecoveryCopied(true))}>کپی لینک</button>
        <p role="status" className="small">{recoveryCopied?'لینک کپی شد؛ فقط برای همین همکار بفرستید.':'این لینک یک‌بارمصرف است، یک ساعت اعتبار دارد و دوباره نمایش داده نمی‌شود.'}</p>
      </>:<>
        <p>پیش از ساخت لینک، هویت این همکار را حضوری یا تلفنی تأیید کنید؛ هر کس لینک را داشته باشد می‌تواند رمز و Authenticator این حساب را عوض کند.</p>
        <p className="small">تا وقتی همکار بازیابی را تمام نکند، رمز و Authenticator فعلی او کار می‌کنند. پس از پایان، همه نشست‌های قبلی او بسته می‌شوند. لینک تازه، لینک قبلی را باطل می‌کند.</p>
      </>}
      {recoveryError&&<div role="alert" className="callout callout-red">{recoveryError}</div>}
    </Dialog>
  </>;
}
