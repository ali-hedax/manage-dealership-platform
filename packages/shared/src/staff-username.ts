import { normalizeRoles } from './enums';
import { toLatinDigits } from './text';

/** Display spacing/digits only; legacy punctuation (X30-0) remains exact. */
export function normalizeStaffUsername(value: string): string {
  return toLatinDigits(value.trim()).toLowerCase().replace(/^(tech|exp|mgr|gst)\s+(?=[a-z0-9])/, '$1');
}

export function technicianUsernameForStation(code: string): string {
  const suffix = toLatinDigits(code.trim()).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,27}$/.test(suffix)) throw new Error('INVALID_STATION_CODE');
  return `tech${suffix}`;
}

/** Prefix of the owner-chosen two-digit username (spec 29 / scenario): MGR for managers, GST for guests, EXP for everyone else. */
export type StaffCodePrefix = 'exp' | 'mgr' | 'gst';
export function staffCodePrefix(roles: readonly string[]): StaffCodePrefix {
  const r = normalizeRoles(roles);
  if (r.includes('guest')) return 'gst';
  if (r.includes('service_manager')) return 'mgr';
  return 'exp';
}

function twoDigits(code: string): string {
  const suffix = toLatinDigits(code.trim());
  if (!/^[0-9]{2}$/.test(suffix)) throw new Error('INVALID_PERSONNEL_CODE');
  return suffix;
}

export function expertUsernameForCode(code: string): string {
  return `exp${twoDigits(code)}`;
}

/** EXP / MGR / GST + two digits, from the person's roles. Existing usernames keep working until changed. */
export function staffUsernameForCode(roles: readonly string[], code: string): string {
  return `${staffCodePrefix(roles)}${twoDigits(code)}`;
}

/** True when the username already follows a two-digit code (EXP 20, MGR 01, GST 05). */
export function hasStaffCode(username: string): boolean {
  return /^(exp|mgr|gst)[0-9]{2}$/.test(username);
}

export function displayStaffUsername(value: string): string {
  return value.replace(/^(tech|exp|mgr|gst)([0-9]+)$/i, (_, prefix: string, code: string) => `${prefix.toUpperCase()} ${code}`);
}
