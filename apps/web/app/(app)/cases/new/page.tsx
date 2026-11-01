'use client';

import { CaseForm } from '@/components/CaseForm';
import { useAuth } from '@/lib/auth';

export default function NewCasePage() {
  const { can } = useAuth();
  if (!can('case.create')) return <div className="callout callout-blue">نقش شما اجازه ثبت پرونده ندارد.</div>;
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
