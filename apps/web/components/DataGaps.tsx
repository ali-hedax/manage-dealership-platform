'use client';
import type { ReceptionDayStats } from '@manage/shared';
import { faNum } from '@/lib/format';

/** What the counts could not see: shown as such, so a zero is never mistaken for a fact (S08/S09). */
export function DataGaps({ stats }: { stats: ReceptionDayStats }) {
  const g = stats.dataGaps;
  if (!g || (!g.linesNotRead && !g.labourWithoutName && !g.partsWithoutName)) return null;
  const parts = [
    g.linesNotRead ? `ریز کارت ${faNum(g.linesNotRead)} پذیرش هنوز خوانده نشده` : null,
    g.labourWithoutName ? `${faNum(g.labourWithoutName)} اجرت فقط کد دارد و نامش در منبع نیست` : null,
    g.partsWithoutName ? `${faNum(g.partsWithoutName)} قطعهٔ مصرفی بی‌نام است` : null,
  ].filter(Boolean);
  return <p className="callout callout-amber small" data-testid="data-gaps">دادهٔ ناقص: {parts.join('؛ ')}. این‌ها در شمارش بالا دیده نشده‌اند؛ وضعیت هر منبع در «منبع‌ها».</p>;
}
