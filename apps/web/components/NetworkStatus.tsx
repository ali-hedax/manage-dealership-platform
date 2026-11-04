'use client';
import {useEffect,useState} from 'react';

export function NetworkStatus(){
 const [offline,setOffline]=useState(false);
 useEffect(()=>{
  const sync=()=>setOffline(!navigator.onLine);sync();
  window.addEventListener('online',sync);window.addEventListener('offline',sync);
  return ()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync);};
 },[]);
 if(!offline)return null;
 return <div className="network-status no-print" role="alert"><strong>اتصال شبکه قطع است.</strong> برای ثبت کار به شبکه وصل شوید. آخرین اطلاعات روی صفحه ممکن است به‌روز نباشند.</div>;
}
