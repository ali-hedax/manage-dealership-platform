import Link from 'next/link';
import type {ReactNode} from 'react';
import {AppIcon,type IconName} from './AppIcon';

type Action={href:string;label:string};

/** One pattern for empty lists, missing permission and recoverable errors:
 * icon, a short title, one sentence, and the next useful step. */
export function EmptyState({icon='file',title,children,action,heading='h2'}:{icon?:IconName;title:string;children?:ReactNode;action?:Action|ReactNode;heading?:'h1'|'h2'}){
 const H=heading;
 const isLink=(a:unknown):a is Action=>typeof a==='object'&&a!==null&&'href' in a&&'label' in a;
 const act:ReactNode=isLink(action)?<Link className="btn btn-primary" href={action.href}>{action.label}</Link>:action as ReactNode;
 return <section className="empty-state" role="status"><span className="empty-icon"><AppIcon name={icon}/></span><H>{title}</H>{children&&<p>{children}</p>}{act&&<div className="row">{act}</div>}</section>;
}
