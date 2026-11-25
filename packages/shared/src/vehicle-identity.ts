import { toLatinDigits } from './text';

/** Same exact identity key as the reception/import matching rule; never infer a VIN suffix. */
export const vehicleIdentityKey = (value: string | null | undefined) =>
  toLatinDigits(value ?? '').replace(/[\s‌\-_/.]+/g, '').toUpperCase();
export const isFullVehicleVin = (value: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(value) || /^TESTVIN[A-Z0-9]{10}$/.test(value);
export const isIsacoVehicleChassis = (value: string) => /^(?=.{8}$)[A-Z]{2,3}[0-9]{5,6}$/.test(value);
export const isVehicleIdentity = (value: string) => isFullVehicleVin(vehicleIdentityKey(value)) || isIsacoVehicleChassis(vehicleIdentityKey(value));
export const ACTIVE_ACCIDENT_DUPLICATE_MESSAGE = 'این خودرو قبلاً در بخش تصادفات پذیرش شده و دارای پرونده فعال است. امکان ثبت پذیرش مجدد وجود ندارد.';
