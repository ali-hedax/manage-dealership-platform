// Central switch of unfinished modules (H2; owner decision 2026-11-27). One list for the menu, the
// pages, the API and the tests. «ownerOnly»: closed for everyone except the owner — not in the
// menu, the page shows «به‌زودی», the API answers 404. «experimental»: the owner sees a small
// «آزمایشی» tag. To open a module to everyone, set ownerOnly to false (and experimental to false
// once it is complete); nothing else has to change.

export const FEATURES = {
  /** «خودروهای متوقف» and its management report: first version, not yet validated with a real report. */
  stoppages: { ownerOnly: true, experimental: true, label: 'خودروهای متوقف' },
  /** Planned modules (/modules/*): not built. */
  planned_modules: { ownerOnly: true, experimental: true, label: 'ماژول‌های برنامه‌ریزی‌شده' },
  /** Standalone Special Aid: in daily use; the owner's section 29 rules are not built yet. */
  special_aid: { ownerOnly: false, experimental: true, label: 'امداد ویژه' },
  /** Night report «تعویض روغن / تعمیر فنی» (C5): the name lists are not yet checked against real data. */
  night_job_split: { ownerOnly: false, experimental: true, label: 'شمارش تعویض روغن و تعمیر فنی' },
} as const satisfies Record<string, { ownerOnly: boolean; experimental: boolean; label: string }>;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];
export const EXPERIMENTAL_LABEL = 'آزمایشی';

/**
 * Whether this person may open the feature (menu, page and API). `opened` is the server's
 * OPEN_FEATURES list: modules the owner opened to everyone without a code change.
 */
export function featureOpen(key: FeatureKey, isOwner: boolean | undefined, opened: readonly string[] = []): boolean {
  return !!isOwner || !FEATURES[key].ownerOnly || opened.includes(key);
}

/** OPEN_FEATURES of the server (comma separated); unknown names are ignored. */
export function parseOpenFeatures(value: string | undefined | null): FeatureKey[] {
  return [...new Set((value ?? '').split(',').map((v) => v.trim()).filter((v): v is FeatureKey => (FEATURE_KEYS as string[]).includes(v)))];
}

/** Whether to show the small «آزمایشی» tag: only to the owner, only on unfinished features. */
export function featureTagged(key: FeatureKey, isOwner: boolean | undefined): boolean {
  return !!isOwner && FEATURES[key].experimental;
}

/** The feature a pathname belongs to, for pages opened by a direct link. */
export function featureOfPath(pathname: string): FeatureKey | null {
  if (pathname === '/reception/stoppage' || pathname.startsWith('/reception/stoppage/') || pathname === '/control-room/stoppages') return 'stoppages';
  if (pathname.startsWith('/modules/')) return 'planned_modules';
  if (pathname === '/special-aid' || pathname.startsWith('/special-aid/')) return 'special_aid';
  return null;
}
