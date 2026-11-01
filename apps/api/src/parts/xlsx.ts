import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

// Minimal .xlsx support for the parts import: reads the first worksheet as a
// grid of strings and writes a single right-to-left sheet. Formulas, dates and
// styles are out of scope; amounts are read as plain numbers or digit strings.

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

/** Rows of the first worksheet; empty cells are ''. */
export function readFirstSheet(data: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new XlsxError('فایل اکسل معتبر نیست (فقط .xlsx پذیرفته می‌شود)');
  }
  const sheetPath = firstSheetPath(files);
  const sheet = files[sheetPath];
  if (!sheet) throw new XlsxError('برگه‌ای در فایل اکسل پیدا نشد');

  const sharedXml = files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : '';
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));

  const rows: string[][] = [];
  for (const rowMatch of strFromU8(sheet).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
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

function firstSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = files['xl/workbook.xml'] && strFromU8(files['xl/workbook.xml']);
  const rels = files['xl/_rels/workbook.xml.rels'] && strFromU8(files['xl/_rels/workbook.xml.rels']);
  const rid = workbook && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (rid && rels) {
    const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].find((m) => m[1]!.includes(`Id="${rid}"`));
    const target = rel && /Target="([^"]+)"/.exec(rel[1]!)?.[1];
    if (target) return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  return 'xl/worksheets/sheet1.xml';
}

/** A one-sheet, right-to-left workbook; numbers stay numeric. */
export function writeSheet(name: string, rows: (string | number | null)[][]): Uint8Array {
  const col = (i: number) => {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const sheetRows = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          if (v === null || v === '') return '';
          const ref = `${col(ci)}${ri + 1}`;
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${encode(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;
  return zipSync({
    '[Content_Types].xml': strToU8(
      xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
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
          `<sheets><sheet name="${encode(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
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
    'xl/worksheets/sheet1.xml': strToU8(
      xml(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          '<sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews>' +
          `<sheetData>${sheetRows}</sheetData></worksheet>`,
      ),
    ),
  });
}
