import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

// Minimal .xlsx support for the parts and vehicle imports: reads worksheets as
// grids of strings and writes right-to-left sheets. Formula results are read as
// cached values; styles are out of scope, so a date-formatted cell arrives as
// its serial number and the caller decides how to interpret it.

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const encode = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Text of all <t> runs inside a fragment (rich text is flattened). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]!)).join('');

const columnIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export class XlsxError extends Error {}

// Decompression limits: an .xlsx is a ZIP archive, and a small upload could
// otherwise expand to gigabytes. Only the parts we read are decompressed; the
// declared size bounds the output buffer, so it is checked before inflating.
export const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const needed = (name: string) =>
  name === 'xl/workbook.xml' ||
  name === 'xl/_rels/workbook.xml.rels' ||
  name === 'xl/sharedStrings.xml' ||
  /^xl\/worksheets\/[^/]+\.xml$/.test(name);

export interface Worksheet {
  name: string;
  rows: string[][];
}

/** Rows of the first worksheet; empty cells are ''. */
export function readFirstSheet(data: Uint8Array): string[][] {
  return readWorkbook(data)[0]!.rows;
}

/** Every worksheet in workbook order with its name; empty cells are ''. */
export function readWorkbook(data: Uint8Array): Worksheet[] {
  let files: Record<string, Uint8Array>;
  let entries = 0;
  let total = 0;
  let tooLarge = false;
  try {
    files = unzipSync(data, {
      filter: (f) => {
        entries += 1;
        if (!needed(f.name)) return false;
        total += f.originalSize;
        if (entries > MAX_ENTRIES || f.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) tooLarge = true;
        return !tooLarge;
      },
    });
  } catch {
    throw new XlsxError('فایل اکسل معتبر نیست (فقط .xlsx پذیرفته می‌شود)');
  }
  if (tooLarge) throw new XlsxError('محتوای فایل اکسل بیش از حد بزرگ است؛ فایل را به چند بخش تقسیم کنید');

  const sharedXml = files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : '';
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));
  const sheets = sheetPaths(files)
    .filter((sh) => files[sh.path])
    .map((sh) => ({ name: sh.name, rows: parseSheet(strFromU8(files[sh.path]!), shared) }));
  if (!sheets.length) throw new XlsxError('برگه‌ای در فایل اکسل پیدا نشد');
  return sheets;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNo = Number(/\br="(\d+)"/.exec(rowMatch[1]!)?.[1] ?? rows.length + 1);
    const cells: string[] = [];
    for (const c of rowMatch[2]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (v !== undefined) value = decode(v);
      cells[ref ? columnIndex(ref) : cells.length] = value.trim();
    }
    rows[rowNo - 1] = Array.from(cells, (x) => x ?? '');
  }
  return Array.from(rows, (r) => r ?? []);
}

/** Sheet names and part paths in workbook order (falls back to sheet1). */
function sheetPaths(files: Record<string, Uint8Array>): { name: string; path: string }[] {
  const workbook = files['xl/workbook.xml'] && strFromU8(files['xl/workbook.xml']);
  const rels = files['xl/_rels/workbook.xml.rels'] && strFromU8(files['xl/_rels/workbook.xml.rels']);
  if (!workbook || !rels) return [{ name: '', path: 'xl/worksheets/sheet1.xml' }];
  return [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => {
    const name = decode(/\bname="([^"]*)"/.exec(m[1]!)?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(m[1]!)?.[1];
    const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].find((r) => r[1]!.includes(`Id="${rid}"`));
    const target = rel && /Target="([^"]+)"/.exec(rel[1]!)?.[1];
    const path = !target ? '' : target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    return { name, path };
  });
}

type Cell = string | number | null;

const column = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const sheetRows = (rows: Cell[][]) =>
  rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          if (v === null || v === '') return '';
          const ref = `${column(ci)}${ri + 1}`;
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${encode(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');

/** A one-sheet, right-to-left workbook; numbers stay numeric. */
export function writeSheet(name: string, rows: Cell[][]): Uint8Array {
  return writeWorkbook([{ name, rows }]);
}

/** A right-to-left workbook with the given sheets in order; numbers stay numeric. */
export function writeWorkbook(sheets: { name: string; rows: Cell[][] }[]): Uint8Array {
  const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;
  const n = (i: number) => i + 1;
  return zipSync({
    '[Content_Types].xml': strToU8(
      xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          sheets
            .map(
              (_, i) =>
                `<Override PartName="/xl/worksheets/sheet${n(i)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
            )
            .join('') +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>',
      ),
    ),
    '_rels/.rels': strToU8(
      xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    ),
    'xl/workbook.xml': strToU8(
      xml(
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets>${sheets.map((sh, i) => `<sheet name="${encode(sh.name)}" sheetId="${n(i)}" r:id="rId${n(i)}"/>`).join('')}</sheets></workbook>`,
      ),
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          sheets
            .map(
              (_, i) =>
                `<Relationship Id="rId${n(i)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n(i)}.xml"/>`,
            )
            .join('') +
          `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          '</Relationships>',
      ),
    ),
    'xl/styles.xml': strToU8(
      xml(
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
          '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
          '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
          '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
          '</styleSheet>',
      ),
    ),
    ...Object.fromEntries(
      sheets.map((sh, i) => [
        `xl/worksheets/sheet${n(i)}.xml`,
        strToU8(
          xml(
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
              '<sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews>' +
              `<sheetData>${sheetRows(sh.rows)}</sheetData></worksheet>`,
          ),
        ),
      ]),
    ),
  });
}
