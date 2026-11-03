'use client';
import Link from 'next/link';
import {useAuth} from '@/lib/auth';
import {visibleWorkspaces} from '@/lib/workspaces';
import {AppIcon} from './AppIcon';
export function WorkspaceLauncher({compact=false}:{compact?:boolean}){const {me}=useAuth();return <nav aria-label="میزهای کار مجاز من" className={`workspace-grid${compact?' compact':''}`}>{visibleWorkspaces(me).map(w=><Link className="workspace-card" href={`/accidents/${w.key}`} key={w.key}><span className="workspace-symbol"><AppIcon name={w.icon}/></span><span><strong>{w.label}</strong>{!compact&&<span className="muted small">{w.description}</span>}</span><span className="workspace-arrow" aria-hidden="true">‹</span></Link>)}</nav>;}
