import { cleanText, flagOf, idText, kasbInstant, numberOf, parseTable, rowHash, stableJson } from './kasb-table';
import { admissionKey, composePlate, diffLines, fullVinKey, isClosed, mapCard, mapPart, searchTextOf, statusTexts, withinWorkingHours, dayChunks, jalaliDay, tehranMidnight } from './pulse-map';

// Synthetic rows only (AGENTS.md): TESTVIN… VINs, 0900… phones, invented names.
const STRUCTURE = ['DrcdRcd', 'DrcdDealerSeq', 'DrcdDocNo', 'DrcdRcptDate', 'DrcdRcptTime', 'DrcdCarSt', 'DrcdGchsChs', 'GchsVin', 'GctpDesc', 'WvmdDes', 'DrcdPlateSec', 'DrcdPlateAlph', 'DrcdPlateThr', 'DrcdPlateReg', 'DrcdCustName', 'DrcdOwnerMob', 'DrcdUpdDte', 'DrcdExtDte', 'DrcdNewColumn'];
const ROW = [881001, '۱۴۰۵۰۲۰۰۰۰', '0012', '1405/09/02', '08:56', 3, 'naa 12345', 'testvin0000000001', 'تارا اتوماتيك', 'تارا اتوماتیک V4', '12', 'ب', '345', '67', 'مشتري آزمايشي', '09000000001', '2026/11/23 08:57:27', '', 'x'];

describe('columnar tables', () => {
  it('maps rows by column name, whatever the column order, and keeps unknown columns', () => {
    const t = parseTable({ Structure: STRUCTURE, Rows: [ROW] });
    expect(t.columns).toHaveLength(STRUCTURE.length);
    expect(t.rows[0]!.DrcdDealerSeq).toBe('۱۴۰۵۰۲۰۰۰۰');
    expect(t.rows[0]!.DrcdNewColumn).toBe('x');
    const reversed = parseTable({ Structure: [...STRUCTURE].reverse(), Rows: [[...ROW].reverse()] });
    expect(reversed.rows[0]).toEqual(t.rows[0]);
    // The hash ignores the column order.
    expect(rowHash(reversed.rows[0]!)).toBe(rowHash(t.rows[0]!));
    expect(stableJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it('accepts an empty Structure, empty Rows and arrays of objects; rejects anything else', () => {
    expect(parseTable({ Structure: [], Rows: [] })).toEqual({ columns: [], rows: [] });
    expect(parseTable({ Structure: [], Rows: null })).toEqual({ columns: [], rows: [] });
    expect(parseTable(null)).toEqual({ columns: [], rows: [] });
    expect(parseTable([{ a: 1 }, { b: 2 }]).columns).toEqual(['a', 'b']);
    expect(parseTable({ Structure: [{ Name: 'A' }], Rows: [[1]] }).rows).toEqual([{ A: 1 }]);
    expect(() => parseTable({ Rows: [] })).toThrow('KASB_PROTOCOL');
    expect(() => parseTable({ Structure: ['a'], Rows: ['x'] })).toThrow('KASB_PROTOCOL');
  });

  it('normalizes text, identifiers, numbers and flags', () => {
    expect(cleanText('  علي   كريمي ')).toBe('علی کریمی');
    expect(cleanText('')).toBeNull();
    expect(idText('۰۰۱۲۳')).toBe('00123');
    expect(idText(1405020000)).toBe('1405020000');
    expect(numberOf('۱٬۲۵۰٬۰۰۰')).toBe(1250000);
    expect(numberOf('12.50')).toBe(12.5);
    expect(numberOf('—')).toBeNull();
    expect(flagOf(1)).toBe(true);
    expect(flagOf('Y')).toBe(true);
    expect(flagOf('0')).toBe(false);
    expect(flagOf(null)).toBe(false);
  });

  it('reads Jalali and Gregorian (Tehran) times as UTC instants', () => {
    // 1405/09/02 08:56 Tehran = 2026-11-23 05:26 UTC (+03:30).
    expect(kasbInstant('1405/09/02', '08:56')!.toISOString()).toBe('2026-11-23T05:26:00.000Z');
    expect(kasbInstant('۱۴۰۵/۰۹/۰۲', '8:56')!.toISOString()).toBe('2026-11-23T05:26:00.000Z');
    expect(kasbInstant('2026/11/23 08:57:27')!.toISOString()).toBe('2026-11-23T05:27:27.000Z');
    expect(kasbInstant('1405/09/02')!.toISOString()).toBe('2026-11-22T20:30:00.000Z');
    expect(kasbInstant('')).toBeNull();
    expect(kasbInstant('1405/13/40')).toBeNull();
  });
});

describe('card mapping', () => {
  const row = parseTable({ Structure: STRUCTURE, Rows: [ROW] }).rows[0]!;
  it('maps an admission with the vehicle-import identifier rules', () => {
    const v = mapCard(row)!;
    expect(v.kasbRcd).toBe('881001');
    expect(v.admissionNo).toBe('1405020000');
    expect(v.admissionNoKey).toBe('1405020000');
    expect(v.cardNo).toBe('0012'); // leading zeros kept
    expect(v.chassis).toBe('NAA12345');
    expect(v.vin).toBe('TESTVIN0000000001');
    expect(v.plate).toBe('12 ب 345 67');
    expect(v.customerName).toBe('مشتری آزمایشی');
    expect(v.productName).toBe('تارا اتوماتیک');
    expect(v.admittedAt!.toISOString()).toBe('2026-11-23T05:26:00.000Z');
    expect(v.statusCode).toBe('3');
    expect(v.exitAt).toBeNull();
    expect(v.official.DrcdNewColumn).toBe('x');
    expect(v.searchText).toContain('1405020000');
    expect(v.searchText).toContain('12ب34567');
    expect(mapCard({ ...row, DrcdRcd: '' })).toBeNull();
  });

  it('never treats a non-identifying admission or a short chassis as an identity', () => {
    expect(admissionKey('بدون پذیرش')).toBeNull();
    expect(admissionKey('برگشتی ۱۲')).toBeNull();
    expect(admissionKey('۱۴۰۵-۰۲۰۰۰۰')).toBe('1405020000');
    expect(fullVinKey('NAA12345')).toBeNull();
    expect(fullVinKey('testvin 00 0000 0001')).toBe('TESTVIN0000000001');
  });

  it('composes the plate for the Plate component and keeps non-standard parts as text', () => {
    expect(composePlate('5', 'ج', '45', '9')).toBe('05 ج 045 09');
    expect(composePlate(null, null, null, null)).toBeNull();
    expect(composePlate('12', 'الف', '345', '678')).toBe('12 الف 345 678');
  });

  it('closes an admission on an exit date or a closing status text', () => {
    expect(isClosed(new Date(), null)).toBe(true);
    expect(isClosed(null, 'ترخیص شده')).toBe(true);
    expect(isClosed(null, 'در حال تعمیر')).toBe(false);
    expect(isClosed(null, null)).toBe(false);
  });

  it('separates search fields so a match never spans two of them', () => {
    expect(searchTextOf(['12', '34', null])).toBe('12~34');
    expect(searchTextOf(['12', '34']).includes('1234')).toBe(false);
  });

  it('reads official status texts of CAR_STATE_REC only', () => {
    const codes = parseTable({ Structure: ['RvDomain', 'RvLowValue', 'RvMeaning'], Rows: [['CAR_STATE_REC', 3, 'در حال تعمير'], ['CAR_STATE_REC', '9', 'ترخيص'], ['OTHER', 3, 'x']] });
    expect(statusTexts(codes)).toEqual({ '3': 'در حال تعمیر', '9': 'ترخیص' });
  });
});

describe('lines of a card', () => {
  const part = (id: number, qty: number, extra: Record<string, unknown> = {}) => mapPart({ DrepRep: id, DrepWgdsGds: '0012345678', DrepQty: qty, DrepFinalQty: qty, DrepDUnitPrice: '1,250,000', DrepState: 'ثبت', DrepDEmdadFlg: 0, ...extra });
  it('maps a part line', () => {
    const p = part(7, 2, { DrepDEmdadFlg: 1, DrepDcarCar: 'عدم تأیید' });
    expect(p).toMatchObject({ lineId: '7', code: '0012345678', qtyRequested: '2', unitPriceRial: 1250000, specialAid: true, rejectReason: 'عدم تأیید', name: null });
  });

  it('diffs: unchanged gives nothing, new/changed/removed/restored are separated', () => {
    const a = part(1, 1), b = part(2, 1), c = part(3, 1);
    const stored = [a, b, c].map((l, i) => ({ id: `s${i}`, lineId: l.lineId, rowHash: l.rowHash, removedAt: i === 2 ? new Date() : null }));
    expect(diffLines(stored.slice(0, 2), [a, b])).toEqual({ added: [], changed: [], restored: [], removed: [] });
    const d = diffLines(stored, [part(1, 3), c, part(4, 1)]);
    expect(d.added.map((l) => l.lineId)).toEqual(['4']);
    expect(d.changed.map((x) => x.stored.lineId)).toEqual(['1']);
    expect(d.restored.map((x) => x.stored.lineId)).toEqual(['3']);
    expect(d.removed.map((x) => x.lineId)).toEqual(['2']);
  });
});

describe('Tehran days and working hours', () => {
  const calendar = { week: Array.from({ length: 7 }, (_, d) => (d === 5 ? [] : [{ start: 480, end: 1110 }])), holidays: [{ date: '2026-11-24', title: 'تعطیل آزمایشی' }], holidaysVerifiedThrough: null };
  const settings = { intervalMinutes: 3, hoursMode: 'calendar' as const, hoursFrom: '07:00', hoursTo: '19:00', openWindowDays: 60 };
  const at = (iso: string) => new Date(iso);
  it('formats the Jalali day and chunks ranges by Tehran day', () => {
    expect(jalaliDay(at('2026-11-23T05:26:00Z'))).toBe('1405/09/02');
    expect(tehranMidnight(at('2026-11-23T05:26:00Z')).toISOString()).toBe('2026-11-22T20:30:00.000Z');
    const chunks = dayChunks(at('2026-11-01T10:00:00Z'), at('2026-11-23T10:00:00Z'), 7);
    expect(chunks).toHaveLength(4);
    expect(jalaliDay(chunks[0]!.from)).toBe('1405/08/10');
    expect(jalaliDay(chunks[3]!.to)).toBe('1405/09/02');
  });
  it('reads from an hour before the first period until an hour after the last, never on holidays', () => {
    // Monday 2026-11-23, one period 08:00–18:30 Tehran: reading window 07:00–19:30.
    expect(withinWorkingHours(at('2026-11-23T05:26:00Z'), settings, calendar as never)).toBe(true); // 08:56
    expect(withinWorkingHours(at('2026-11-23T03:40:00Z'), settings, calendar as never)).toBe(true); // 07:10
    expect(withinWorkingHours(at('2026-11-23T03:20:00Z'), settings, calendar as never)).toBe(false); // 06:50
    expect(withinWorkingHours(at('2026-11-23T15:50:00Z'), settings, calendar as never)).toBe(true); // 19:20
    expect(withinWorkingHours(at('2026-11-23T16:20:00Z'), settings, calendar as never)).toBe(false); // 19:50
    expect(withinWorkingHours(at('2026-11-24T06:00:00Z'), settings, calendar as never)).toBe(false); // holiday
    expect(withinWorkingHours(at('2026-11-27T06:00:00Z'), settings, calendar as never)).toBe(false); // Friday
    const custom = { ...settings, hoursMode: 'custom' as const, hoursFrom: '08:00', hoursTo: '09:00' };
    expect(withinWorkingHours(at('2026-11-23T05:00:00Z'), custom, calendar as never)).toBe(true); // 08:30
    expect(withinWorkingHours(at('2026-11-23T04:00:00Z'), custom, calendar as never)).toBe(false); // 07:30
  });
});
