import PDFDocument from 'pdfkit';
import { formatJalaliDateInput, formatTimeInput, toPersianDigits } from '@manage/shared';
import { BOLD, FONT, drawLine, wrap, type Doc } from './pdf';

// Printable checklists (owner, 2026-11-18): the warehouse picking list of one
// vehicle and the accident supervisor's daily inspection walk. A4, Persian RTL,
// embedded Vazirmatn, white background and thin grey rules (printer friendly).
// Every page carries the small «MANAGE by HEDAX» mark top-left, the title
// top-right, the repeated table header and «صفحه x از y» in the footer.
// Printing is read-only: these functions only draw what they are given.

export interface ChecklistColumn {
  title: string;
  /** Relative width; the first column is the tick box. */
  width: number;
  /** Identifiers (codes, plates written in Latin) keep Latin digits. */
  latin?: boolean;
  align?: 'right' | 'center';
}

export interface ChecklistRow {
  /** One value per column; the first (tick box) is ignored. */
  cells: string[];
  /** Not to be picked / informational: grey text and no tick box. */
  muted?: boolean;
  /** Optional small second line under the given column. */
  note?: { column: number; text: string };
}

export interface ChecklistSpec {
  title: string;
  subtitle?: string;
  /** Lines under the title on the first page (vehicle, counts, …). */
  meta: string[];
  layout: 'portrait' | 'landscape';
  columns: ChecklistColumn[];
  rows: ChecklistRow[];
  /** Minimum row height in points (room for a pen mark or notes). */
  minRowHeight: number;
  emptyText: string;
  /** Labels of the signature fields printed after the table («نام …», «تاریخ», «امضا»). */
  signature: string[];
  generatedAt: Date;
  /** Short legend printed above the signature (optional). */
  legend?: string;
}

const INK = '#1d2126';
const MUTED = '#7a7f87';
const RULE = '#b9bdc3';
const HEAD_FILL = '#f3f4f6';

/** «۱۴۰۵/۰۸/۲۷ ساعت ۱۴:۳۰» in Tehran time. */
export function jalaliStamp(d: Date): string {
  return `${toPersianDigits(formatJalaliDateInput(d))} ساعت ${toPersianDigits(formatTimeInput(d))}`;
}

export function renderChecklistPdf(spec: ChecklistSpec): Promise<Buffer> {
  const doc: Doc = new PDFDocument({ size: 'A4', layout: spec.layout, margins: { top: 30, bottom: 34, left: 30, right: 30 }, bufferPages: true, info: { Title: spec.title, Producer: 'Manage by HEDAX' } });
  doc.registerFont('fa', FONT);
  doc.registerFont('fa-bold', BOLD);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom - 14;
  const total = spec.columns.reduce((n, c) => n + c.width, 0);
  // Column edges from the right (RTL): the tick box is the right-most column.
  const edges: { r: number; l: number }[] = [];
  let x = right;
  for (const c of spec.columns) {
    const w = ((right - left) * c.width) / total;
    edges.push({ r: x, l: x - w });
    x -= w;
  }
  const pad = 4;
  const fontSize = spec.layout === 'landscape' ? 9 : 9.5;
  const lineH = fontSize + 4.5;
  const stamp = jalaliStamp(spec.generatedAt);

  const pageTop = () => {
    // Brand mark top-left (discreet), title top-right.
    doc.font('fa-bold').fontSize(8.5).fillColor(INK).text('MANAGE', left, 30, { lineBreak: false, characterSpacing: 1.2 });
    const w = doc.widthOfString('MANAGE', { characterSpacing: 1.2 });
    doc.font('fa').fontSize(7.5).fillColor(MUTED).text(' by HEDAX', left + w, 31, { lineBreak: false });
    doc.font('fa-bold').fontSize(13).fillColor(INK);
    drawLine(doc, spec.title, left + 120, right, 27);
    let y = 47;
    // The actual generation time (Tehran, Jalali) on every page, under the title.
    doc.font('fa').fontSize(8.5).fillColor(MUTED);
    drawLine(doc, [spec.subtitle, `تهیه‌شده ${stamp}`].filter(Boolean).join(' · '), left + 120, right, y);
    y += 13;
    doc.moveTo(left, y + 2).lineTo(right, y + 2).lineWidth(0.6).strokeColor(INK).stroke();
    return y + 10;
  };

  const tableHead = (y: number) => {
    const h = lineH + 2 * pad;
    doc.rect(left, y, right - left, h).fillColor(HEAD_FILL).fill();
    doc.font('fa-bold').fontSize(fontSize - 0.5).fillColor(INK);
    spec.columns.forEach((c, i) => {
      const e = edges[i]!;
      // The tick column carries a small box instead of a glyph the embedded font may lack.
      if (i === 0) doc.rect(e.l + (e.r - e.l - 8) / 2, y + pad + 2, 8, 8).lineWidth(0.7).strokeColor(MUTED).stroke();
      else drawLine(doc, c.title, e.l + pad, e.r - pad, y + pad, c.align ?? 'right');
    });
    doc.moveTo(left, y).lineTo(right, y).moveTo(left, y + h).lineTo(right, y + h).lineWidth(0.6).strokeColor(RULE).stroke();
    return y + h;
  };

  let y = pageTop();
  doc.font('fa').fontSize(9).fillColor(INK);
  for (const line of spec.meta) {
    for (const part of wrap(doc, line, right - left)) {
      drawLine(doc, part, left, right, y);
      y += 13;
    }
  }
  y += 4;
  y = tableHead(y);

  const cellLines = (row: ChecklistRow, i: number) => {
    if (i === 0) return [];
    const text = row.cells[i] ?? '';
    if (!text) return [];
    const shown = spec.columns[i]!.latin ? text : toPersianDigits(text);
    doc.font('fa').fontSize(fontSize);
    return wrap(doc, shown, edges[i]!.r - edges[i]!.l - 2 * pad);
  };

  if (!spec.rows.length) {
    doc.font('fa').fontSize(10).fillColor(MUTED);
    drawLine(doc, spec.emptyText, left, right, y + 10, 'center');
    y += 34;
  }
  spec.rows.forEach((row) => {
    const lines = spec.columns.map((_, i) => cellLines(row, i));
    if (row.note) doc.font('fa').fontSize(fontSize - 1.5);
    const noteLines = row.note ? wrap(doc, toPersianDigits(row.note.text), edges[row.note.column]!.r - edges[row.note.column]!.l - 2 * pad) : [];
    const count = Math.max(1, ...lines.map((l, i) => l.length + (row.note?.column === i ? noteLines.length : 0)));
    const h = Math.max(spec.minRowHeight, count * lineH + 2 * pad);
    if (y + h > bottom) {
      doc.addPage();
      y = tableHead(pageTop());
    }
    if (!row.muted) {
      const e = edges[0]!;
      const size = 11;
      doc.rect(e.l + (e.r - e.l - size) / 2, y + pad + 1, size, size).lineWidth(0.9).strokeColor(INK).stroke();
    }
    lines.forEach((ls, i) => {
      const e = edges[i]!;
      doc.font('fa').fontSize(fontSize).fillColor(row.muted ? MUTED : INK);
      ls.forEach((l, n) => drawLine(doc, l, e.l + pad, e.r - pad, y + pad + n * lineH, spec.columns[i]!.align ?? 'right'));
      if (row.note?.column === i) {
        doc.font('fa').fontSize(fontSize - 1.5).fillColor(MUTED);
        noteLines.forEach((l, n) => drawLine(doc, l, e.l + pad, e.r - pad, y + pad + (ls.length + n) * lineH, 'right'));
      }
    });
    for (let i = 1; i < edges.length; i++) doc.moveTo(edges[i]!.r, y).lineTo(edges[i]!.r, y + h);
    doc.moveTo(left, y + h).lineTo(right, y + h).lineWidth(0.4).strokeColor(RULE).stroke();
    y += h;
  });

  // Signature block after the table (kept on one page).
  const block = (spec.legend ? 18 : 0) + 34;
  if (y + block + 10 > bottom) {
    doc.addPage();
    y = pageTop();
  }
  y += 14;
  if (spec.legend) {
    doc.font('fa').fontSize(8).fillColor(MUTED);
    drawLine(doc, spec.legend, left, right, y);
    y += 18;
  }
  doc.font('fa').fontSize(9.5).fillColor(INK);
  const slot = (right - left) / Math.max(1, spec.signature.length);
  spec.signature.forEach((label, i) => {
    const r = right - i * slot;
    drawLine(doc, `${label}: ....................................`, r - slot + 8, r, y);
  });

  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    const fy = doc.page.height - doc.page.margins.bottom - 2;
    // Footer text sits inside the bottom margin; without this pdfkit would start a new page.
    doc.page.margins.bottom = 0;
    doc.moveTo(left, fy - 5).lineTo(right, fy - 5).lineWidth(0.4).strokeColor(RULE).stroke();
    doc.font('fa').fontSize(7.5).fillColor(MUTED);
    drawLine(doc, `صفحه ${toPersianDigits(String(p + 1))} از ${toPersianDigits(String(range.count))}`, left, right, fy);
    drawLine(doc, 'چاپ این برگه هیچ اطلاعاتی را در منیج تغییر نمی‌دهد', left, right, fy, 'center');
    doc.text('Manage by HEDAX', left, fy, { lineBreak: false });
  }
  doc.end();
  return done;
}
