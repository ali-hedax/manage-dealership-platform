import { normalizeLaborCode, officialLabourName, UNKNOWN_LABOUR_NAME } from '@manage/shared';
import { badRequest } from '../common/errors';

export interface LabourCatalog {
  version: number;
  names: Record<string, string>;
}

export function labourCatalog(settings: Record<string, unknown> | undefined): LabourCatalog {
  // This setting is only written through the validated import transaction.
  return (settings?.receptionLabourCatalog as LabourCatalog | undefined) ?? { version: 0, names: {} };
}

const csvRow = /^("(?:[^"]|"")*"|[^",]*),("(?:[^"]|"")*"|[^",]*)$/u;
const cell = (value: string) => (value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value).trim();

/** Two-column UTF-8 CSV, one record per line. Keep identifiers as strings from the first read. */
export function parseLabourCatalog(csv: string): Record<string, string> {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/u);
  const header = csvRow.exec(lines[0] ?? '')?.slice(1).map(cell).join(',').toLowerCase();
  if (header !== 'code,name' && header !== 'کد اجرت,نام اجرت') {
    throw badRequest('LABOUR_CATALOG_HEADER', 'سطر اول فایل باید دو ستون code,name یا کد اجرت، نام اجرت داشته باشد.');
  }
  const names = new Map<string, string>();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (names.size >= 20_000) throw badRequest('LABOUR_CATALOG_TOO_MANY', 'حداکثر ۲۰٬۰۰۰ کد اجرت در هر فایل پذیرفته می‌شود.');
    const row = csvRow.exec(line);
    const code = normalizeLaborCode(row ? cell(row[1]!) : '');
    const name = row ? cell(row[2]!) : '';
    if (!/^[\p{L}\d][\p{L}\d._/-]{0,79}$/u.test(code) || name.length > 300
      || /[\p{Cc}\p{Bidi_Control}\uFFFD]/u.test(name) || officialLabourName(name, code) === UNKNOWN_LABOUR_NAME) {
      throw badRequest('LABOUR_CATALOG_ROW', `کد یا نام اجرت در سطر ${i + 1} معتبر نیست.`);
    }
    if (names.has(code)) throw badRequest('LABOUR_CATALOG_DUPLICATE', `کد اجرت در سطر ${i + 1} تکراری است.`);
    names.set(code, name);
  }
  if (!names.size) throw badRequest('LABOUR_CATALOG_EMPTY', 'فایل باید دست‌کم یک کد و نام اجرت داشته باشد.');
  return Object.fromEntries(names);
}

export function resolveNightLabour(
  description: string | null, code: string | null, rawCode: string | null, names: Record<string, string>,
): { name: string; unmatched: boolean } {
  const direct = officialLabourName(description, code);
  if (direct !== UNKNOWN_LABOUR_NAME) return { name: direct, unmatched: false };
  const key = normalizeLaborCode(code ?? '');
  if (key && Object.hasOwn(names, key)) return { name: names[key]!, unmatched: false };
  return key
    ? { name: `کد اجرت ناشناخته (${rawCode?.trim() || code})`, unmatched: true }
    : { name: UNKNOWN_LABOUR_NAME, unmatched: false };
}
