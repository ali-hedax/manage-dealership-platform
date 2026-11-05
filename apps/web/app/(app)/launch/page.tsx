'use client';
import Link from 'next/link';
import {useAuth} from '@/lib/auth';
import {WorkspaceLauncher} from '@/components/WorkspaceLauncher';
import {AppIcon} from '@/components/AppIcon';

/** Stable installation entry: the account chooses among its permitted desks. */
export default function LaunchPage(){
 const {me}=useAuth();const technician=me.roles.length===1&&me.roles[0]==='technician';
 return <div className="entry-home stack"><header className="entry-welcome"><img src="/brand/logo-dark.png" alt="Manage by HEDAX" width={160} height={53}/><div><p>{me.displayName}، خوش آمدید</p><h1>از میز کار خود شروع کنید.</h1><p>کارهای امروز، در {me.tenant.name}</p></div><span className="entry-line" aria-hidden="true"/></header><section className="entry-desks" aria-label="انتخاب میز کار"><h2>میزهای کار شما</h2><p className="muted">میز مرتبط با کارتان را انتخاب کنید؛ هر زمان می‌توانید به این صفحه برگردید.</p>{technician?<nav aria-label="میزهای کار مجاز من" className="workspace-grid"><Link className="workspace-card" href="/workshop/technician"><span className="workspace-symbol"><AppIcon name="team"/></span><span><strong>کارهای من</strong><span className="small muted">خودروهای محول‌شده؛ شروع و پایان کار</span></span></Link></nav>:<WorkspaceLauncher/>}</section></div>;
}
