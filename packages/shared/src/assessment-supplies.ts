import { normalizeAssessmentSearch } from './assessment-search';

/** Only explicitly generic labels, or ordinary fasteners/adhesives without a vehicle label. */
export function isUniversalAssessmentSupply(name: string, vehicleLabel: string | null | undefined): boolean {
  const label = normalizeAssessmentSearch(vehicleLabel);
  if (['عمومی','مشترک','همهخودروها','تمامخودروها','یونیورسال'].map(normalizeAssessmentSearch).includes(label)) return true;
  if (label && label !== 'نامشخص') return false;
  // A cylinder-head/manifold gasket is a vehicle-specific part, not a generic washer.
  if (/سرسیلندر|منیفولد|کارتل|دنا|سورن|سمند|تارا|پژو|پراید|رانا|هایما|ریرا|206|207|405/i.test(normalizeAssessmentSearch(name))) return false;
  return /^(چسب|پیچ|مهره|واشر|درزگیر|سیلانت)(?:[\s‌\d]|$)/u.test(name.trim());
}
