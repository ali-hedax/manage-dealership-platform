import { buildSearchText, computeMissingFields, formatCaseNumber } from './case-rules';

const complete = {
  coverageType: 'personal',
  customerName: 'x',
  customerPhone: '0900',
  vehicleModel: 'دنا',
  plate: '12ب345',
  vin: null,
  odometerKm: 10,
  damageDescription: 'x',
  responsibleUserId: 'u',
  goldenCardFileNo: null,
  officialDeadlineAt: null,
  insurerName: null,
  insuranceClaimNo: null,
};

describe('case rules', () => {
  it('a complete personal case has nothing missing', () => {
    expect(computeMissingFields(complete)).toEqual([]);
  });

  it('coverage-specific requirements', () => {
    expect(computeMissingFields({ ...complete, coverageType: 'golden_card' })).toEqual([
      'golden_card_file_no',
      'official_deadline',
    ]);
    expect(computeMissingFields({ ...complete, coverageType: 'insurance' })).toEqual([
      'insurer',
      'insurance_claim_no',
    ]);
  });

  it('plate or VIN is enough to identify the vehicle', () => {
    expect(computeMissingFields({ ...complete, plate: null })).toContain('vehicle_identity');
    expect(computeMissingFields({ ...complete, plate: null, vin: 'V' })).not.toContain('vehicle_identity');
  });

  it('search text keeps tokens separate', () => {
    expect(buildSearchText(['AC-1405-0001', null, '۱۲ ب ۳۴۵'])).toBe('ac14050001 12ب345');
  });

  it('formats case numbers', () => {
    expect(formatCaseNumber(1405, 7)).toBe('AC-1405-0007');
  });
});
