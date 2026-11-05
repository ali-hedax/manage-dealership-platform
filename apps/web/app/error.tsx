'use client';
import Link from 'next/link';
import {AppIcon} from '@/components/AppIcon';

export default function AppError({reset}:{error:Error&{digest?:string};reset:()=>void}){
 return <main className="empty-state-page"><section className="empty-state" role="alert"><img className="empty-brand" src="/brand/manage-logo-light.svg" alt="Manage by HEDAX" width={150} height={38}/><span className="empty-icon"><AppIcon name="alert"/></span><h1>نمایش این صفحه با مشکل روبه‌رو شد</h1><p>اطلاعات شما تغییری نکرده است. دوباره تلاش کنید؛ اگر تکرار شد، به مدیر سامانه خبر دهید.</p><div className="row"><button type="button" className="btn btn-primary" onClick={reset}>تلاش دوباره</button><Link className="btn" href="/launch">بازگشت به میز کار</Link></div></section></main>;
}
