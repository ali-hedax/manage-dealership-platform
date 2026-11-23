'use client';
import { ReceptionList } from '@/components/Reception';

/** «پذیرش‌های امروز» (spec section 26). */
export default function ReceptionTodayPage() {
  return <ReceptionList view="today" />;
}
