import { searchKey, type CoverageType } from '@manage/shared';

export interface CaseCompleteness {
  coverageType: CoverageType | string;
  customerName: string | null;
  customerPhone: string | null;
  vehicleModel: string | null;
  plate: string | null;
  vin: string | null;
  odometerKm: number | null;
  damageDescription: string | null;
  responsibleUserId: string | null;
  goldenCardFileNo: string | null;
  officialDeadlineAt: Date | null;
  insurerName: string | null;
  insuranceClaimNo: string | null;
}

/**
 * Fields still unknown on a case ("نیازمند تکمیل"). Unknown data is kept
 * empty and flagged — never filled with placeholder values.
 */
export function computeMissingFields(c: CaseCompleteness): string[] {
  const missing: string[] = [];
  if (!c.customerName) missing.push('customer_name');
  if (!c.customerPhone) missing.push('customer_phone');
  if (!c.vehicleModel) missing.push('vehicle_model');
  if (!c.plate && !c.vin) missing.push('vehicle_identity');
  if (c.odometerKm == null) missing.push('odometer');
  if (!c.damageDescription) missing.push('damage_description');
  if (!c.responsibleUserId) missing.push('responsible');
  if (c.coverageType === 'unknown') missing.push('coverage_type');
  if (c.coverageType === 'golden_card') {
    if (!c.goldenCardFileNo) missing.push('golden_card_file_no');
    if (!c.officialDeadlineAt) missing.push('official_deadline');
  }
  if (c.coverageType === 'insurance') {
    if (!c.insurerName) missing.push('insurer');
    if (!c.insuranceClaimNo) missing.push('insurance_claim_no');
  }
  return missing;
}

/** Space-separated search keys; each key has no internal spaces. */
export function buildSearchText(values: (string | null | undefined)[]): string {
  return values
    .filter((v): v is string => !!v)
    .map(searchKey)
    .filter(Boolean)
    .join(' ');
}

export function formatCaseNumber(jalaliYear: number, seq: number): string {
  return `AC-${jalaliYear}-${String(seq).padStart(4, '0')}`;
}
