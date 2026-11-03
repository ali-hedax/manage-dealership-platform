'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {MODULE_LABELS,ROLE_LABELS} from '@manage/shared';
import {api} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {visibleWorkspaces} from '@/lib/workspaces';
import {AppIcon,type IconName} from './AppIcon';
import {PageActions} from './PageActions';
export function Shell({children}:{children:ReactNode}){
 const {me,can}=useAuth(),pathname=usePathname(),router=useRouter();const [open,setOpen]=useState(false),[mobile,setMobile]=useState(false);const menu=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const media=window.matchMedia('(max-width: 860px)');const sync=()=>setMobile(media.matches);sync();media.addEventListener('change',sync);return ()=>media.removeEventListener('change',sync);},[]);
 useEffect(()=>{if(!open||!mobile)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);menu.current?.focus();}};document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);},[open,mobile]);
 const accident=pathname.startsWith('/cases')||pathname.startsWith('/reports')||pathname.startsWith('/accidents');
 function nav(href:string,label:string,icon:IconName,show=true){if(!show)return null;const active=href==='/'?pathname==='/':href.includes('#')?false:pathname===href||(href==='/cases'&&/^\/cases\/(?!new|import)/.test(pathname));return href.includes('#')&&href.split('#')[0]===pathname?<a key={href} href={'#'+href.split('#')[1]}><AppIcon name={icon}/><span>{label}</span></a>:<Link key={href} href={href} aria-current={active?'page':undefined}><AppIcon name={icon}/><span>{label}</span></Link>;}
 async function logout(){await api('/auth/logout',{method:'POST'}).catch(()=>{});router.replace('/login');}
 return <div className="shell"><a className="skip-link" href="#page-content">رفتن به محتوای صفحه</a>{open&&mobile&&<button type="button" className="nav-scrim" aria-label="بستن منو" onClick={()=>{setOpen(false);menu.current?.focus();}}/>}
 <aside className={`sidebar${open?' open':''}`} aria-label="منوی اصلی" inert={mobile&&!open}>
 <div className="brand"><img src="/brand/logo-dark.png" alt="Manage by HEDAX" width={132} height={44}/><div className="tenant">{me.tenant.name}</div></div>
 <nav className="nav" id="main-navigation" aria-label="واحدها و میزهای کار" onClick={e=>{if((e.target as HTMLElement).closest('a'))setOpen(false);}}>
 {nav('/','داشبورد','home',can('dashboard.read'))}
 <details className="nav-unit" key={`accident-${accident}`} open={accident||pathname==='/'}><summary><AppIcon name="car"/><span>واحد تصادفات</span></summary><div className="nav-sub">
 {nav('/accidents','میزهای کار تصادفات','team')}{nav('/cases','پرونده‌های تصادفی','file',can('case.read'))}{nav('/cases/new','ثبت پرونده','add',can('case.create'))}{nav('/reports','گزارش‌ها','chart',can('report.manager')||can('part.manage')||can('case.update')||can('task.manage')||can('qc.inspect'))}
 <div className="nav-caption">میزهای کار مجاز شما</div>{visibleWorkspaces(me).map(w=>nav(`/accidents/${w.key}`,w.label,w.icon))}
 </div></details>
 {(can('user.manage')||can('reference.parts.read')||can('reference.customers.read')||me.isOwner)&&<details className="nav-unit" open={pathname==='/users'||pathname==='/reference-data'}><summary><AppIcon name="settings"/><span>مدیریت و اطلاعات پایه</span></summary><div className="nav-sub">{nav('/users','کارکنان','team',can('user.manage'))}{nav('/users#access-control','مدیریت دسترسی‌ها','shield',!!me.isOwner)}{nav('/reference-data','اطلاعات پایه','database',can('reference.parts.read')||can('reference.customers.read'))}</div></details>}
 <details className="nav-unit planned-units"><summary><AppIcon name="box"/><span>سایر واحدها</span></summary><p className="nav-caption">واحدهای زیر هنوز در دست توسعه‌اند</p><div className="nav-sub">{me.modules.filter(m=>m.status==='planned').map(m=><Link key={m.key} href={`/modules/${m.key}`} className="planned" aria-current={pathname===`/modules/${m.key}`?'page':undefined}><span>{MODULE_LABELS[m.key]}</span><span className="tag-dev">در دست توسعه</span></Link>)}</div></details>
 </nav><div className="account"><div className="name">{me.displayName}</div><div className="xs">{me.isOwner?'مالک سامانه':me.roles.map(r=>ROLE_LABELS[r]).join('، ')}</div><div className="sync"><i aria-hidden="true"/>همگام‌سازی محلی: هنوز فعال نشده</div><button type="button" className="btn btn-sm" onClick={logout}>خروج</button></div></aside>
 <div className="main"><div className="topbar"><img src="/brand/logo-dark.png" alt="Manage by HEDAX" width={104} height={35}/><button ref={menu} type="button" className="btn btn-sm" aria-controls="main-navigation" aria-expanded={open} onClick={()=>setOpen(!open)}>منو</button></div>{me.environment!=='production'&&<div className="env-banner" role="note">نسخه آزمایشی — داده‌های این محیط ساختگی‌اند و جای سامانه‌های رسمی را نمی‌گیرند.</div>}
 <main className="page" id="page-content" tabIndex={-1}><PageActions/>{children}</main></div></div>;
}
