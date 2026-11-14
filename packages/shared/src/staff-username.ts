import { toLatinDigits } from './text';

/** Display spacing/digits only; legacy punctuation (X30-0) remains exact. */
export function normalizeStaffUsername(value: string): string {
  return toLatinDigits(value.trim()).toLowerCase().replace(/^(tech|exp)\s+(?=[a-z0-9])/, '$1');
}

export function technicianUsernameForStation(code: string): string {
  const suffix = toLatinDigits(code.trim()).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,27}$/.test(suffix)) throw new Error('INVALID_STATION_CODE');
  return `tech${suffix}`;
}

export function expertUsernameForCode(code: string): string {
  const suffix = toLatinDigits(code.trim());
  if (!/^[0-9]{2}$/.test(suffix)) throw new Error('INVALID_PERSONNEL_CODE');
  return `exp${suffix}`;
}

export function displayStaffUsername(value: string): string {
  return value.replace(/^(tech|exp)([0-9]+)$/i, (_, prefix: string, code: string) => `${prefix.toUpperCase()} ${code}`);
}
