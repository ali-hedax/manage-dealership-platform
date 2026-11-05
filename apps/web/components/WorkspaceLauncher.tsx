'use client';
import Link from 'next/link';
import {useAuth} from '@/lib/auth';
import {visibleWorkspaces} from '@/lib/workspaces';
import {AppIcon} from './AppIcon';
export function WorkspaceLauncher({compact=false}:{compact?:boolean}){const {me}=useAuth();const desks=visibleWorkspaces(me);if(!desks.length)return <p className="callout">هنوز میز کاری برای حساب شما فعال نیست. مدیر سیستم می‌تواند دسترسی حساب را پیگیری کند.</p>;return <nav aria-label="میزهای کار مجاز من" className={`workspace-grid${compact?' compact':''}`}>{desks.map(w=><Link className="workspace-card" href={`/accidents/${w.key}`} key={w.key}><span className="workspace-symbol"><AppIcon name={w.icon}/></span><span><strong>{w.label}</strong>{!compact&&<span className="muted small">{w.description}</span>}</span><span className="workspace-arrow" aria-hidden="true">‹</span></Link>)}</nav>;}
