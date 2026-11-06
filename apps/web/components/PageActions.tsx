'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useAuth} from '@/lib/auth';
import type {Action} from '@/lib/workspaces';
import {AppIcon} from './AppIcon';
export function PageActions(){
 const path=usePathname(),{can,me}=useAuth();if(path==='/launch'||path.startsWith('/accidents'))return null;
 if(path.startsWith('/workshop'))return null;
 let label='واحد تصادفات';let actions:Action[]=[];
 const match=path.match(/^\/cases\/([^/]+)$/);
 if(match&&!['new','import'].includes(match[1]))actions=[{label:'کارشناسی',detail:'',href:'#case-assessment',icon:'file',permission:can('assessment.manage')?'assessment.manage':'assessment.authorize'},{label:'قطعات',detail:'',href:'#case-parts',icon:'box',permission:can('part.request')?'part.request':'part.manage'},{label:'فعالیت‌های تعمیر',detail:'',href:'#case-tasks',icon:'wrench',permission:can('task.manage')?'task.manage':'task.approve'},{label:'موانع',detail:'',href:'#case-blockers',icon:'alert',permission:can('blocker.report')?'blocker.report':'blocker.manage'},{label:'کنترل کیفیت و تحویل',detail:'',href:'#case-quality',icon:'check',permission:can('qc.inspect')?'qc.inspect':'case.technical_close'},{label:'مالی و پیش‌پرداخت',detail:'',href:'#case-finance',icon:'money',permission:can('finance.payment')?'finance.payment':can('finance.propose')?'finance.propose':can('finance.approve')?'finance.approve':'finance.close'}];
 else if(path==='/users'){label='مدیریت کارکنان';actions=[{label:'دعوت همکار',detail:'',href:'#invite-staff',icon:'add',permission:'user.manage'},...(me.isOwner?[{label:'دسترسی و الگوهای سمت',detail:'',href:'#access-control',icon:'shield'} as Action,{label:'مرز مالک و مدیر سیستم',detail:'',href:'#owner-admin',icon:'shield'} as Action]:[])];}
 else if(path==='/reference-data'){label='اطلاعات پایه';}
 else if(path.startsWith('/modules'))return null;
 else actions=[{label:'ورود به میز کار',detail:'',href:'/accidents',icon:'desk'},...(!path.startsWith('/cases/new')?[{label:'پذیرش جدید',detail:'',href:'/cases/new',icon:'add',permission:'case.create'} as Action]:[])];
 return <div className="page-context no-print"><Link className="context-unit" href={path==='/users'?'/users':path==='/reference-data'?'/reference-data':'/accidents'}><AppIcon name={path==='/users'?'team':path==='/reference-data'?'database':'car'}/>{label}</Link><nav aria-label="دسترسی سریع صفحه" className="page-actions">{actions.filter(a=>!a.permission||can(a.permission)).map(a=>a.href.startsWith('#')?<a key={a.href} href={a.href}><AppIcon name={a.icon}/>{a.label}</a>:<Link key={a.href} href={a.href}><AppIcon name={a.icon}/>{a.label}</Link>)}</nav></div>;
}
