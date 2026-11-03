// Format detection from content (not the file extension) and a strict,
// streaming-style reader for XML Spreadsheet 2003 (SpreadsheetML), which the
// Emdad Vijeh report exports with an .xls extension. No DOM, no DTD, no
// entities, no network, no formulas. Only two known exporter defects are
// repaired, and each repair is counted in the diagnostics.

export type SheetFormat = 'xlsx' | 'spreadsheetml' | 'xls_binary' | 'unknown';

export function detectFormat(data: Uint8Array): SheetFormat {
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) return 'xlsx';
  if (data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0) return 'xls_binary';
  const head = Buffer.from(data.subarray(0, 4096)).toString('utf8').replace(/^﻿/, '').trimStart();
  if (head.startsWith('<?xml') && /<Workbook\b/.test(head) && /urn:schemas-microsoft-com:office:spreadsheet/.test(head)) return 'spreadsheetml';
  return 'unknown';
}

export const FORMAT_ERRORS: Record<Exclude<SheetFormat, 'xlsx' | 'spreadsheetml'>, string> = {
  xls_binary: 'فایل XLS باینری (Excel 97-2003) هنوز پشتیبانی نمی‌شود؛ خروجی XML یا XLSX همان گزارش را بارگذاری کنید',
  unknown: 'قالب فایل شناخته نشد؛ فقط XLSX و XML Spreadsheet (خروجی امداد ویژه با پسوند xls) پذیرفته می‌شوند',
};

export class SpreadsheetError extends Error {}

export interface ReaderLimits {
  maxRows: number;
  maxColumns: number;
  maxCellChars: number;
  maxMillis: number;
}
export const DEFAULT_LIMITS: ReaderLimits = { maxRows: 200_000, maxColumns: 256, maxCellChars: 10_000, maxMillis: 120_000 };

export interface Diagnostics {
  leadingWhitespace: number;
  unescapedAmpersands: number;
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITY[e]!,
  );

/**
 * Reads the first worksheet (or the one with the given name). Yields each row
 * as an array of cell texts (sparse ss:Index honoured); the header is row 1.
 */
export function readSpreadsheetML(data: Uint8Array, opts: { sheet?: string; limits?: Partial<ReaderLimits> } = {}) {
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const started = Date.now();
  let text = Buffer.from(data).toString('utf8');
  const diagnostics: Diagnostics = { leadingWhitespace: 0, unescapedAmpersands: 0 };
  const lead = /^﻿?\s*/.exec(text)![0].length;
  if (lead) {
    diagnostics.leadingWhitespace = lead;
    text = text.slice(lead);
  }
  if (!text.startsWith('<?xml')) throw new SpreadsheetError('ابتدای فایل XML معتبر نیست');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new SpreadsheetError('فایل شامل DTD یا ENTITY است و به دلایل امنیتی پذیرفته نمی‌شود');
  text = text.replace(/&(?!(?:#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);)/g, () => {
    diagnostics.unescapedAmpersands += 1;
    return '&amp;';
  });

  const sheets = [...text.matchAll(/<Worksheet\b[^>]*\bss:Name="([^"]*)"[^>]*>/g)];
  if (!sheets.length) throw new SpreadsheetError('برگه‌ای در فایل پیدا نشد');
  const chosen = opts.sheet ? sheets.find((m) => decode(m[1]!) === opts.sheet) : sheets[0];
  if (!chosen) throw new SpreadsheetError(`برگه «${opts.sheet}» پیدا نشد`);
  const start = chosen.index! + chosen[0].length;
  const end = text.indexOf('</Worksheet>', start);
  if (end < 0) throw new SpreadsheetError('برگه کامل نیست (پایان Worksheet پیدا نشد)');
  const body = text.slice(start, end);
  text = '';

  function* rows(): Generator<string[]> {
    let pos = 0;
    let count = 0;
    for (;;) {
      const open = body.indexOf('<Row', pos);
      if (open < 0) return;
      const tagEnd = body.indexOf('>', open);
      if (tagEnd < 0) throw new SpreadsheetError('ردیف ناقص در فایل');
      if (body[tagEnd - 1] === '/') {
        pos = tagEnd + 1;
        count += 1;
        yield [];
        continue;
      }
      const close = body.indexOf('</Row>', tagEnd);
      if (close < 0) throw new SpreadsheetError('ردیف بسته نشده است');
      count += 1;
      if (count > limits.maxRows) throw new SpreadsheetError(`تعداد ردیف‌ها بیش از ${limits.maxRows} است`);
      if (count % 1000 === 0 && Date.now() - started > limits.maxMillis) throw new SpreadsheetError('خواندن فایل بیش از حد طول کشید');
      const inner = body.slice(tagEnd + 1, close);
      const cells: string[] = [];
      let col = 0;
      for (const c of inner.matchAll(/<Cell\b([^>]*?)(\/>|>([\s\S]*?)<\/Cell>)/g)) {
        const idx = /\bss:Index="(\d+)"/.exec(c[1]!);
        if (idx) col = Number(idx[1]) - 1;
        if (col >= limits.maxColumns) throw new SpreadsheetError(`تعداد ستون‌ها بیش از ${limits.maxColumns} است`);
        const d = c[3] ? /<Data\b[^>]*>([\s\S]*?)<\/Data>/.exec(c[3]) : null;
        const value = d ? decode(d[1]!.replace(/<[^>]+>/g, '')) : '';
        if (value.length > limits.maxCellChars) throw new SpreadsheetError('متن یک خانه بیش از حد طولانی است');
        cells[col] = value;
        const merge = /\bss:MergeAcross="(\d+)"/.exec(c[1]!);
        col += 1 + (merge ? Number(merge[1]) : 0);
      }
      pos = close + 6;
      yield Array.from(cells, (x) => x ?? '');
    }
  }

  return { sheetName: decode(chosen[1]!), sheetNames: sheets.map((m) => decode(m[1]!)), diagnostics, rows };
}
