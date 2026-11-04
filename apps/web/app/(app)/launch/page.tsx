'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {useAuth} from '@/lib/auth';
import {workspaceHome} from '@/lib/workspaces';

/** One stable installation entry point; the current account determines its desk. */
export default function LaunchPage(){
 const {me}=useAuth();const router=useRouter();
 useEffect(()=>{router.replace(workspaceHome(me));},[me,router]);
 return <p role="status">در حال باز کردن میز کار شما…</p>;
}
