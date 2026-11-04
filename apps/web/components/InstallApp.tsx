'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {Dialog} from './Dialog';

interface InstallEvent extends Event {
 prompt():Promise<void>;
 userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
const InstallContext=createContext<{open:()=>void;standalone:boolean}|null>(null);

/** Online installation only: no service worker, offline queue or private-data cache. */
export function InstallProvider({children}:{children:ReactNode}){
 const [open,setOpen]=useState(false),[standalone,setStandalone]=useState(false),[installed,setInstalled]=useState(false);
 const [ios,setIos]=useState(false),[secure,setSecure]=useState(false);
 const [pending,setPending]=useState<InstallEvent|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  const media=window.matchMedia('(display-mode: standalone)');
  const sync=()=>setStandalone(media.matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
  sync();setSecure(window.isSecureContext);
  setIos(/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1));
  const available=(event:Event)=>{event.preventDefault();setPending(event as InstallEvent);};
  const onInstalled=()=>{setPending(null);setInstalled(true);setMessage('');};
  window.addEventListener('beforeinstallprompt',available);window.addEventListener('appinstalled',onInstalled);media.addEventListener('change',sync);
  return ()=>{window.removeEventListener('beforeinstallprompt',available);window.removeEventListener('appinstalled',onInstalled);media.removeEventListener('change',sync);};
 },[]);
 async function install(){
  if(!pending||busy)return;
  setBusy(true);setMessage('');
  try{
   await pending.prompt();const result=await pending.userChoice;
   setMessage(result.outcome==='accepted'?'درخواست نصب تأیید شد؛ تکمیل نصب را روی دستگاه بررسی کنید.':'نصب انجام نشد؛ همچنان می‌توانید از مرورگر استفاده کنید.');
  }catch{setMessage('پنجره نصب باز نشد؛ از راهنمای نصب مرورگر در همین صفحه استفاده کنید.');}
  finally{setPending(null);setBusy(false);}
 }
 return <InstallContext.Provider value={{open:()=>{setMessage('');setOpen(true);},standalone:standalone||installed}}>{children}
  <Dialog open={open} title="نصب Manage روی دستگاه" onClose={()=>setOpen(false)} footer={<button className="btn install-touch" type="button" onClick={()=>setOpen(false)}>بستن راهنما</button>}>
   <div className="install-brand"><img src="/brand/pwa-192.png" width={60} height={60} alt=""/><div><strong>Manage by HEDAX</strong><p>ورود سریع به میز کار، از آیکون روی گوشی</p></div></div>
   <p className="callout callout-blue">این نسخه برای دریافت و ثبت اطلاعات به اینترنت یا شبکه متصل به سرور نیاز دارد. نصب برنامه، دسترسی حساب شما را تغییر نمی‌دهد.</p>
   {standalone?<p role="status">این پنجره در حالت برنامه باز شده است.</p>:installed?<p role="status">Manage نصب شد؛ از آیکون آن روی دستگاه وارد شوید.</p>:<>
    {!secure&&<p className="callout callout-amber">برای نصب، نشانی امن HTTPS سامانه را در مرورگر اصلی دستگاه باز کنید.</p>}
    {secure&&pending&&!ios&&<button className="btn btn-primary install-touch" type="button" disabled={busy} onClick={()=>void install()}>{busy?'در حال باز کردن نصب…':'نصب برنامه'}</button>}
    {ios?<section><h2 className="install-heading">نصب روی آیفون و آیپد</h2><ol className="install-steps"><li>Manage را در Safari باز کنید.</li><li>منوی اشتراک‌گذاری (Share) را بزنید و «افزودن به صفحه اصلی» (Add to Home Screen) را انتخاب کنید.</li><li>اگر «باز کردن به‌صورت برنامه» (Open as Web App) نمایش داده شد، آن را فعال و «افزودن» (Add) را بزنید.</li></ol></section>:<>
     <section><h2 className="install-heading">نصب روی اندروید</h2><ol className="install-steps"><li>Manage را در Chrome باز کنید.</li><li>از منوی سه‌نقطه، «نصب برنامه» یا «افزودن به صفحه اصلی» را بزنید؛ ممکن است گزینه «نصب» در مرحله بعد نمایش داده شود.</li><li>نصب را تأیید کنید؛ سپس از آیکون Manage وارد شوید.</li></ol></section>
     <details><summary>رایانه و سایر مرورگرها</summary><p>در Chrome یا Edge از نشان نصب کنار نشانی سایت یا گزینه نصب در منوی مرورگر استفاده کنید. در مرورگرهای فاقد نصب، همان صفحه وب در دسترس است.</p></details>
    </>}
   </>}
   {message&&<p role="status">{message}</p>}
   <p className="small muted">نصب را در مرورگر اصلی دستگاه انجام دهید. پس از ورود، تعمیرکار کارهای خودش و مدیر میز مربوط به حساب خودش را می‌بیند.</p>
  </Dialog>
 </InstallContext.Provider>;
}

export function InstallButton(){
 const context=useContext(InstallContext);
 if(!context||context.standalone)return null;
 return <button type="button" className="btn btn-sm install-touch" onClick={context.open}>نصب روی گوشی</button>;
}
