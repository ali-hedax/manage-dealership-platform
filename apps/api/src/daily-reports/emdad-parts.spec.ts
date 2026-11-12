import { decideByRequest, requestNoKey } from './emdad-parts';

const part = (id: string, partNumber: string | null, chassisRef: string | null = null) => ({ id, caseId: 'case-1', partNumber, vin: 'TESTVIN0000000001', chassisRef });
const report = (code: string) => ({ partCode: code, initialCode: code, fullCodeBase: code });

describe('request number key', () => {
  it('normalises Persian and Arabic digits, spaces, dashes and leading zeros, never inventing a number', () => {
    expect(requestNoKey('۰۵۶۰۰۵۱')).toBe('560051');
    expect(requestNoKey(' 56-0051 ')).toBe('560051');
    expect(requestNoKey('٥٦٠٠٥١')).toBe('560051');
    expect(requestNoKey('0')).toBe('0');
    expect(requestNoKey('req-12')).toBe('REQ12');
    expect(requestNoKey('')).toBeNull();
    expect(requestNoKey(null)).toBeNull();
  });
});

describe('request number + code + chassis', () => {
  it('lets the technical code choose among the lines of one vehicle request', () => {
    const d = decideByRequest(report('22223352'), null, [part('p1', '2222335101'), part('p2', '22223352')]);
    expect(d).toMatchObject({ kind: 'link', part: { id: 'p2' }, note: 'شمارهٔ درخواست و کد فنی یکسان است' });
  });

  it('notes a matching chassis and accepts a single candidate whose code differs only when the chassis agrees', () => {
    expect(decideByRequest(report('22223351'), 'zzz-00061', [part('p1', '22223351', 'ZZZ00061')])).toMatchObject({ kind: 'link', note: 'شمارهٔ درخواست، کد فنی و شاسی یکسان است' });
    expect(decideByRequest(report('99998861'), 'ZZZ00061', [part('p1', '33334461', 'ZZZ00061')])).toMatchObject({ kind: 'link', note: expect.stringContaining('کد فنی گزارش با قطعه فرق دارد') });
  });

  it('never guesses: two lines with the same code, or neither code nor chassis agreeing, go to review', () => {
    expect(decideByRequest(report('44445571'), null, [part('p1', '44445571'), part('p2', '4444557102')])).toMatchObject({ kind: 'review', note: expect.stringContaining('چند قطعه') });
    expect(decideByRequest(report('99998861'), 'ZZZ00061', [part('p1', '33334461', 'OTHER001')])).toMatchObject({ kind: 'review' });
    expect(decideByRequest(report('99998861'), null, [part('p1', null)])).toMatchObject({ kind: 'review' });
    // Two candidates without a code match are not settled by the chassis alone.
    expect(decideByRequest(report('99998861'), 'ZZZ00061', [part('p1', '11110001', 'ZZZ00061'), part('p2', '11110002', 'ZZZ00061')])).toMatchObject({ kind: 'review' });
  });
});
