import Link from 'next/link';
import {AppIcon} from '@/components/AppIcon';

export default function NotFound(){
 return <main className="empty-state-page"><section className="empty-state"><img className="empty-brand" src="/brand/manage-logo-light.svg" alt="Manage by HEDAX" width={150} height={38}/><span className="empty-icon"><AppIcon name="file"/></span><h1>این صفحه پیدا نشد</h1><p>نشانی ممکن است اشتباه باشد یا صفحه جابه‌جا شده باشد.</p><div className="row"><Link className="btn btn-primary" href="/launch">بازگشت به میز کار</Link></div></section></main>;
}
