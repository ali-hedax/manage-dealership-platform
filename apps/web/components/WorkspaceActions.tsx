'use client';

import Link from 'next/link';
import type { Workspace } from '@/lib/workspaces';
import { useAuth } from '@/lib/auth';
import { AppIcon } from './AppIcon';

export function WorkspaceActions({workspace:w}:{workspace:Workspace}) {
  const {can} = useAuth();
  const actions = w.actions.filter(a => !a.permission || can(a.permission));
  const render = (items: typeof actions) => <div className="action-grid">{items.map(a => <Link href={a.href} key={a.href} className="action-card"><AppIcon name={a.icon}/><strong>{a.label}</strong><span className="muted small">{a.detail}</span></Link>)}</div>;
  const groups = w.key === 'admin' ? Array.from(new Set(actions.map(a=>a.group))) : [undefined];
  return <nav aria-label={`کارهای ${w.label}`} className="workspace-action-sections">{groups.map(group=>{
    const items = group ? actions.filter(a=>a.group===group) : actions;
    return <section key={group || 'main'}>{group && <h2>{group}</h2>}{render(items.slice(0,3))}{items.length > 3 && <details className="compact-disclosure workspace-more"><summary>{group ? `سایر کارهای ${group}` : 'سایر امکانات این میز'} ({items.length-3})</summary>{render(items.slice(3))}</details>}</section>;
  })}</nav>;
}
