'use client';
import Link from 'next/link';
import useSWR from 'swr';
import type {AppNotification} from '@manage/shared';
import {api,errorMessage,fetcher} from '@/lib/api';
import {formatJalali} from '@/lib/format';
import {useToast} from '@/lib/toast';

/** Internal reminders (11:00 daily reports). Shown only while unread; never locks the page. */
export function NotificationBar(){
 const toast=useToast();
 const {data,mutate}=useSWR<{unread:number;items:AppNotification[]}>('/notifications',fetcher,{refreshInterval:60_000});
 const unread=data?.items.filter(n=>!n.readAt)??[];
 if(!unread.length)return null;
 async function read(ids:string[]){try{await mutate(await api('/notifications/read',{body:{ids}}),{revalidate:false});}catch(e){toast(errorMessage(e),'error');}}
 return <section className="notice-bar no-print" aria-label="اعلان‌های داخلی" data-testid="notifications">{unread.slice(0,3).map(n=><div key={n.id} className="callout callout-amber small notice"><div><strong>{n.title}</strong> <span className="xs muted">{formatJalali(n.createdAt,{time:true})}</span>{n.body&&<p>{n.body}</p>}</div><div className="row">{n.link&&<Link className="btn btn-sm" href={n.link} onClick={()=>void read([n.id])}>رفتن به بخش مربوط</Link>}<button type="button" className="btn btn-sm btn-ghost" onClick={()=>void read([n.id])}>خواندم</button></div></div>)}</section>;
}
