'use client';
import {useEffect,useState,type FormEvent} from 'react';
import useSWR from 'swr';
import {ROLES,ROLE_LABELS,type Role} from '@manage/shared';
import {api,fetcher,errorMessage} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {AccessPanel} from '@/components/AccessPanel';
import {permissionsFor,PERMISSION_LABELS,type PermissionTemplates} from '@manage/shared';

type UserRow={id:string;email:string;displayName:string;roles:Role[];isActive:boolean;invitationDelivery:string;invitationFailure:string|null;invitationExpiresAt:string|null};
type MailCheck={status:'ready'|'not_configured'|'failed';failure?:string};
type InvitationInput={email:string;displayName:string;roles:Role[]};
const deliveryLabels:Record<string,string>={manual:'دعوت ایمیلی ارسال نشده',sending:'نتیجه ارسال مشخص نیست؛ در صورت نیاز دوباره بفرستید',sent:'سرور ایمیل دعوت را پذیرفت؛ در انتظار فعال‌سازی (رسیدن به صندوق را فقط خود همکار تأیید می‌کند)',failed:'ارسال ایمیل ناموفق؛ دوباره بفرستید'};
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

export default function UsersPage(){
  const {can,me}=useAuth();const allowed=can('user.manage');
  const {data,error:listError,mutate,isLoading}=useSWR<UserRow[]>(allowed?'/auth/invitations':null,fetcher);
  const {data:presets}=useSWR<{templates:PermissionTemplates;assignableRoles?:Role[]}>(allowed?'/access/presets':null,fetcher);
  const {data:mail,error:mailError}=useSWR<{configured:boolean}>(allowed?'/auth/invitations/email/status':null,fetcher);
  const [email,setEmail]=useState(''),[displayName,setName]=useState(''),[roles,setRoles]=useState<Role[]>(['accident_expert']);
  const [busyEmail,setBusyEmail]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [privateLink,setPrivateLink]=useState('');
  const [check,setCheck]=useState<MailCheck|null>(null),[checking,setChecking]=useState(false);
  useEffect(()=>{if(presets?.assignableRoles)setRoles(current=>{const next=current.filter(r=>presets.assignableRoles!.includes(r));return next.length?next:presets.assignableRoles!.slice(0,1);});},[presets]);
  async function checkMail(){setChecking(true);setCheck(null);try{setCheck(await api<MailCheck>('/auth/invitations/email/check',{body:{}}));}catch(err){setError(errorMessage(err));}finally{setChecking(false);}}
  const busy=!!busyEmail;
  async function invite(input:InvitationInput,delivery:'email'|'manual'='email'){
    if(busy)return;
    setBusyEmail(input.email);setError('');setMessage('');setPrivateLink('');
    try{
      const result=await api<{emailDelivery?:'sent'|'failed';failure?:string;invitationUrl?:string}>(delivery==='email'?'/auth/invitations/email':'/auth/invitations',{body:{email:input.email,displayName:input.displayName,roles:input.roles}});
      if(delivery==='manual'&&result.invitationUrl){setPrivateLink(result.invitationUrl);setMessage(`لینک خصوصی برای ${input.email} ساخته شد و ۲۴ ساعت اعتبار دارد. فقط برای همین همکار بفرستید؛ ایمیلی ارسال نشده است.`);}
      else if(result.emailDelivery==='sent')setMessage(`سرور ایمیل دعوت‌نامه ${input.email} را پذیرفت؛ دعوت ۲۴ ساعت اعتبار دارد. رسیدن به صندوق را از همکار بپرسید؛ او رمز شخصی و Google Authenticator خودش را تنظیم می‌کند.`);
      else setError(`کارمند ثبت شد اما ارسال ایمیل موفق نبود: ${failureLabels[result.failure??'unknown']??failureLabels.unknown} پس از رفع مشکل «ارسال دوباره دعوت» را بزنید یا لینک خصوصی بسازید.`);
      await mutate();
    }catch(err){setError(errorMessage(err));}finally{setBusyEmail('');}
  }
  function submit(e:FormEvent){e.preventDefault();if(!roles.length){setError('حداقل یک نقش برای کارمند انتخاب کنید.');return;}const delivery=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-delivery')==='manual'?'manual':'email';void invite({email:email.trim().toLowerCase(),displayName:displayName.trim(),roles},delivery);}
  if(!allowed)return <p>به بخش کارکنان دسترسی ندارید.</p>;
  const ready=mail?.configured===true;
  return <><div className="page-head"><h1>کارکنان</h1></div>
    <p>نام، ایمیل و دسترسی همکار را مشخص کنید. دعوت‌نامه به ایمیل او می‌رود؛ خودش رمز شخصی انتخاب می‌کند و Google Authenticator را متصل می‌کند.</p>
    {mail?.configured===false&&<p className="callout callout-red" role="status">ارسال ایمیل دعوت هنوز تنظیم نشده است. فعلاً می‌توانید لینک دعوت خصوصی بسازید و برای همکارتان بفرستید.</p>}
    {mailError&&<p role="alert" className="callout callout-red">وضعیت ارسال ایمیل دریافت نشد. صفحه را تازه کنید.</p>}
    <div className="row" style={{gap:8,alignItems:'center',marginBlockEnd:12}}>
      <button type="button" className="btn" disabled={checking} onClick={()=>void checkMail()}>{checking?'در حال بررسی اتصال ایمیل…':'بررسی اتصال ایمیل'}</button>
      <span aria-live="polite" className="small" data-testid="mail-check">{check&&checkLabel(check)}</span>
    </div>
    <AccessPanel/>
    <section id="invite-staff" className="card"><h2>افزودن کارمند و ارسال دعوت</h2>
      <form className="form" onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minInlineSize:0,display:'grid',gap:12}}>
          <legend>مشخصات کارمند</legend>
          <label className="field" htmlFor="staff-name"><span>نام و نام خانوادگی</span></label>
          <input id="staff-name" name="displayName" className="input" autoComplete="name" required maxLength={120} value={displayName} onChange={e=>setName(e.target.value)}/>
          <label className="field" htmlFor="staff-email"><span>ایمیل</span></label>
          <input id="staff-email" name="email" className="input ltr-input" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/>
          <fieldset aria-describedby="staff-role-help" style={{minInlineSize:0}}><legend>دسترسی کارمند</legend>
            <p id="staff-role-help">فقط سمت‌های موردنیاز را انتخاب کنید. مدیر سیستم می‌تواند دعوت بسازد؛ پس از تعیین مالک، دعوت او نمی‌تواند دسترسی بیشتری از مجوزهای خودش بدهد.</p>
            {ROLES.map(role=><label key={role} style={{display:'flex',alignItems:'center',gap:8,minHeight:44}}><input name="roles" value={role} type="checkbox" disabled={presets?.assignableRoles&&!presets.assignableRoles.includes(role)} checked={roles.includes(role)} onChange={e=>setRoles(e.target.checked?[...roles,role]:roles.filter(r=>r!==role))}/> {ROLE_LABELS[role]}</label>)}
            {!roles.length&&<p role="status">حداقل یک نقش انتخاب کنید.</p>}
            <details><summary>مشاهده مجوزهای پیشنهادی سمت انتخاب‌شده</summary><p>{presets?[...permissionsFor(roles,presets.templates)].map(p=>PERMISSION_LABELS[p]).join('، '):'در حال دریافت الگوی جاری…'}</p><p>{me.isOwner?'پس از ایجاد حساب، از بخش دسترسی کارکنان مجوزهای همین فرد را تغییر دهید.':'الگوهای جاری سمت توسط مالک تعیین می‌شود.'}</p></details>
          </fieldset>
          <button type="submit" className="btn btn-primary" disabled={busy||!ready}>{busy?'در حال ارسال دعوت…':'افزودن و ارسال دعوت'}</button>
          <button type="submit" data-delivery="manual" className="btn" disabled={busy}>ساخت لینک دعوت خصوصی</button>
        </fieldset>
      </form>
      {error&&<div role="alert" className="callout callout-red" style={{marginBlockStart:16}}>{error}</div>}
      <div role="status" aria-live="polite" aria-atomic="true">{message&&<p className="callout" style={{marginBlockStart:16}}>{message}</p>}</div>
      {privateLink&&<div className="callout"><label className="field" htmlFor="private-invitation"><span>لینک دعوت محرمانه</span></label><input id="private-invitation" className="input ltr-input" readOnly value={privateLink} onFocus={e=>e.target.select()}/><button type="button" className="btn" style={{marginBlockStart:12}} onClick={()=>void navigator.clipboard.writeText(privateLink).then(()=>setMessage('لینک دعوت کپی شد؛ فقط برای همان همکار بفرستید.')).catch(()=>setError('کپی خودکار انجام نشد؛ لینک را انتخاب و کپی کنید.'))}>کپی لینک دعوت</button></div>}
      <p>دعوت مخصوص همان فرد است. اگر ایمیل را ندید، پوشه Spam را بررسی کند. ارسال دوباره، لینک قبلی و اتصال ناتمام آن را باطل می‌کند.</p>
    </section>
    <section className="card" style={{marginBlockStart:24}}><h2>وضعیت حساب‌ها و دعوت‌ها</h2>
      {isLoading&&<p role="status">در حال دریافت کارکنان…</p>}
      {listError&&<p role="alert">دریافت فهرست کارکنان ناموفق بود. <button type="button" className="btn" onClick={()=>void mutate()}>تلاش دوباره</button></p>}
      {data?.length===0&&<p>هنوز کارمندی اضافه نشده است.</p>}
      {data?.map(u=><article key={u.id} style={{paddingBlock:16,borderBlockEnd:'1px solid var(--silver)',overflowWrap:'anywhere'}}>
        <h3>{u.displayName}</h3><p><bdi>{u.email}</bdi></p>
        <p>{u.isActive?'فعال':u.invitationExpiresAt&&new Date(u.invitationExpiresAt).getTime()<Date.now()?'دعوت منقضی شده؛ دوباره بفرستید':deliveryLabels[u.invitationDelivery]??'در انتظار فعال‌سازی'}</p>
        {!u.isActive&&u.invitationDelivery==='failed'&&<p className="small">علت: {failureLabels[u.invitationFailure??'unknown']??failureLabels.unknown}</p>}
        <p>{u.roles.map(r=>ROLE_LABELS[r]).join('، ')}</p>
        {!u.isActive&&<button type="button" className="btn" disabled={busy||!ready} aria-label={`ارسال دوباره دعوت برای ${u.displayName}`} onClick={()=>void invite(u)}>{busyEmail===u.email?'در حال ارسال…':'ارسال دوباره دعوت'}</button>}
        {!u.isActive&&(!ready||u.invitationDelivery==='failed')&&<button type="button" className="btn" disabled={busy} aria-label={`ساخت لینک خصوصی برای ${u.displayName}`} onClick={()=>void invite(u,'manual')}>ساخت لینک خصوصی تازه</button>}
      </article>)}
    </section>
  </>;
}
