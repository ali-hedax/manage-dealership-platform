'use client';

import { CaseForm } from '@/components/CaseForm';
import {EmptyState} from '@/components/EmptyState';
import { useAuth } from '@/lib/auth';

export default function NewCasePage() {
  const { can } = useAuth();
  if (!can('case.create')) return <EmptyState icon="shield" title="ثبت پرونده برای نقش شما فعال نیست" action={{href:'/cases',label:'مشاهدهٔ پرونده‌ها'}}>اگر باید پرونده ثبت کنید، از مدیر سامانه بخواهید این دسترسی را به نقش شما بدهد.</EmptyState>;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>ثبت پرونده خودروی تصادفی</h1>
          <p className="muted small">هر مراجعه یک پرونده مستقل است؛ فرم به‌صورت خودکار پیش‌نویس می‌شود.</p>
        </div>
      </div>
      <CaseForm />
    </div>
  );
}
