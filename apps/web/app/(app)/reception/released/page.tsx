'use client';
import { ReceptionList } from '@/components/Reception';

/** «ترخیص‌شده‌ها» (spec section 26). */
export default function ReceptionReleasedPage() {
  return <ReceptionList view="released" />;
}
