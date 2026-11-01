import { formatJalali, toPersianDigits } from '@manage/shared';

export { formatJalali, toPersianDigits };

const DAY = 86_400_000;

/** "۳ روز مانده" / "۲ روز گذشته" / "امروز" relative to now. */
export function relativeDays(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - now;
  const days = Math.round(Math.abs(diff) / DAY);
  if (Math.abs(diff) < 12 * 3_600_000) {
    const hours = Math.max(1, Math.round(Math.abs(diff) / 3_600_000));
    return diff >= 0 ? `${toPersianDigits(hours)} ساعت مانده` : `${toPersianDigits(hours)} ساعت گذشته`;
  }
  return diff >= 0 ? `${toPersianDigits(days)} روز مانده` : `${toPersianDigits(days)} روز گذشته`;
}

/** Duration between two instants, e.g. "۱ روز و ۴ ساعت". */
export function duration(fromIso: string, toIso: string): string {
  const ms = Math.max(0, new Date(toIso).getTime() - new Date(fromIso).getTime());
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / 3_600_000);
  if (days && hours) return `${toPersianDigits(days)} روز و ${toPersianDigits(hours)} ساعت`;
  if (days) return `${toPersianDigits(days)} روز`;
  if (hours) return `${toPersianDigits(hours)} ساعت`;
  return `${toPersianDigits(Math.max(1, Math.floor(ms / 60_000)))} دقیقه`;
}

export type Tone = 'red' | 'amber' | 'green' | 'neutral';

/** Commitment tone: overdue red, within 48h amber. */
export function deadlineTone(iso: string | null, active: boolean): Tone {
  if (!iso || !active) return 'neutral';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'red';
  if (diff < 2 * DAY) return 'amber';
  return 'neutral';
}

export function faNum(n: number): string {
  return toPersianDigits(n.toLocaleString('en-US'));
}
