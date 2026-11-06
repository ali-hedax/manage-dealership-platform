import { dirname, join } from 'node:path';
import PDFDocument from 'pdfkit';
import bidiFactory from 'bidi-js';
import { formatJalali, REPORT_VIEW_LABELS, toPersianDigits, WORK_PRIORITY_LABELS, type ReportResult } from '@manage/shared';

// Persian A4 PDF of a report: embedded Vazirmatn (OFL), dealership header,
// black-and-white only. pdfkit shapes Persian glyphs but lays words left to
// right and reverses Arabic-script digits, so lines are ordered here with the
// Unicode bidi algorithm (bidi-js) and drawn word by word from the right.

const bidi = bidiFactory();
const fontDir = join(dirname(require.resolve('vazirmatn/package.json')), 'fonts', 'ttf');
const FONT = join(fontDir, 'Vazirmatn-Regular.ttf');
const BOLD = join(fontDir, 'Vazirmatn-Bold.ttf');
export const MAX_PDF_ROWS = 1000;

type Doc = InstanceType<typeof PDFDocument>;
interface Token {
  text: string;
  level: number;
}

/** Words and spaces of a line, each with one bidi level, in logical order. */
function tokens(text: string): Token[] {
  const { levels } = bidi.getEmbeddingLevels(text, 'rtl');
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const space = /\s/.test(text[i]!);
    let j = i + 1;
    while (j < text.length && levels[j] === levels[i] && /\s/.test(text[j]!) === space) j++;
    out.push({ text: text.slice(i, j), level: levels[i]! });
    i = j;
  }
  return out;
}

/** Visual order (UBA rule L2): reverse runs from the highest level down to 1. */
function visual(ts: Token[]): Token[] {
  const v = [...ts];
  const max = Math.max(1, ...v.map((t) => t.level));
  for (let level = max; level >= 1; level--) {
    for (let i = 0; i < v.length; ) {
      if (v[i]!.level < level) {
        i++;
        continue;
      }
      let j = i;
      while (j < v.length && v[j]!.level >= level) j++;
      v.splice(i, j - i, ...v.slice(i, j).reverse());
      i = j;
    }
  }
  return v;
}

// Paired punctuation is mirrored in right-to-left text (UBA rule L4).
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '«': '»', '»': '«', '<': '>', '>': '<' };

// fontkit reverses Arabic-script text; a left-to-right token with Persian digits
// is pre-reversed so that it comes out in reading order.
const glyphText = (t: Token) =>
  t.level % 2 === 1
    ? t.text.replace(/[()[\]{}«»<>]/g, (c) => MIRROR[c]!)
    : /[۰-۹٠-٩]/.test(t.text)
      ? [...t.text].reverse().join('')
      : t.text;

function lineWidth(doc: Doc, text: string): number {
  return tokens(text).reduce((w, t) => w + doc.widthOfString(glyphText(t)), 0);
}

/** Draws one right-to-left line ending at `right` (or centered between left and right). */
function drawLine(doc: Doc, text: string, left: number, right: number, y: number, align: 'right' | 'center' = 'right') {
  const ts = visual(tokens(text));
  const total = ts.reduce((w, t) => w + doc.widthOfString(glyphText(t)), 0);
  let x = align === 'center' ? left + (right - left - total) / 2 : right - total;
  for (const t of ts) {
    const g = glyphText(t);
    const w = doc.widthOfString(g);
    if (!/^\s+$/.test(t.text)) doc.text(g, x, y, { lineBreak: false });
    x += w;
  }
}

/** Greedy word wrap in logical order. */
function wrap(doc: Doc, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (lineWidth(doc, word) > width) {
        if (line) { lines.push(line); line = ''; }
        for (const { segment } of new Intl.Segmenter('fa', { granularity: 'grapheme' }).segment(word)) {
          if (line && lineWidth(doc, line + segment) > width) { lines.push(line); line = ''; }
          line += segment;
        }
        continue;
      }
      const next = line ? `${line} ${word}` : word;
      if (line && lineWidth(doc, next) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

// Identifiers (case and part numbers) keep Latin digits, as in the app.
const LATIN = '⁣';
const persianExceptMarked = (s: string) =>
  s
    .split(/(\s+)/)
    .map((w) => (w.startsWith(LATIN) ? w.slice(1) : toPersianDigits(w)))
    .join('');
const fa = (s: string | number | null | undefined) => (s === null || s === undefined || s === '' ? '—' : toPersianDigits(String(s)));

interface Column {
  title: string;
  width: number;
  value: (r: ReportResult['items']['rows'][number]) => string;
}

export function renderReportPdf(r: ReportResult, dealership: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true, info: { Title: `گزارش ${REPORT_VIEW_LABELS[r.view]}`, Producer: 'Manage by HEDAX' } });
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
  const bottom = doc.page.height - doc.page.margins.bottom - 16;
  let y = doc.page.margins.top;

  // ---- header (dealership letterhead)
  doc.font('fa-bold').fontSize(15).fillColor('#000');
  for (const l of wrap(doc, toPersianDigits(dealership), right - left)) {
    drawLine(doc, l, left, right, y, 'center');
    y += 22;
  }
  y += 2;
  doc.fontSize(12);
  drawLine(doc, `گزارش ${REPORT_VIEW_LABELS[r.view]}${r.isTestData ? ' — داده آزمایشی' : ''}`, left, right, y, 'center');
  y += 22;
  doc.font('fa').fontSize(9);
  const meta = [
    `زمان تهیه: ${formatJalali(r.generatedAt, { time: true })}`,
    `بازه رویدادها: ${r.period.label} (${formatJalali(r.period.from)} تا ${formatJalali(r.period.to)})`,
    `فیلترها: ${r.filters.map((f) => `${f.label}: ${f.key==='station'?LATIN:''}${f.value}`).join('، ')}`,
  ];
  for (const m of meta) {
    for (const l of wrap(doc, toPersianDigits(m), right - left)) {
      drawLine(doc, l, left, right, y);
      y += 13;
    }
  }
  y += 4;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor('#000').stroke();
  y += 8;

  // ---- KPIs (label: value unit), two per line
  doc.font('fa').fontSize(9.5);
  const kpis = r.kpis.map((k) => `${k.label}: ${fa(k.value)} ${k.unit}${k.quantity !== undefined ? ` (${fa(k.quantity)} عدد قطعه)` : ''}`);
  for (let i = 0; i < kpis.length; i += 3) {
    const cell = (right - left) / 3;
    kpis.slice(i, i + 3).forEach((t, j) => drawLine(doc, t, left, right - j * cell, y));
    y += 15;
  }
  for (const e of r.events) {
    drawLine(doc, `${e.label}: ${fa(e.current)} ${e.unit} — بازه قبل هم‌طول: ${fa(e.previous)}`, left, right, y);
    y += 15;
  }
  y += 6;

  // ---- work list table (columns from the right)
  const rows = r.items.rows.slice(0, MAX_PDF_ROWS);
  doc.font('fa-bold').fontSize(10.5);
  drawLine(doc, `کارهای امروز — ${fa(r.items.total)} ردیف${r.items.total > MAX_PDF_ROWS ? `؛ فقط ${fa(MAX_PDF_ROWS)} ردیف اول در این فایل است` : ''}`, left, right, y);
  y += 18;
  const cols: Column[] = [
    { title: 'اولویت', width: 70, value: (i) => `${WORK_PRIORITY_LABELS[i.priority]}\n${i.priorityReason}` },
    { title: 'پرونده / پذیرش / خودرو', width: 105, value: (i) => `${LATIN}${i.caseNumber}\nپذیرش: ${i.admissionNo||'ندارد'}\n${i.vehicleLabel}${i.plate ? ` — ${i.plate}` : ''}` },
    { title: 'شرح', width: 150, value: (i) => [i.description, `جایگاه: ${i.stationCodes?.map(code=>code.split(/(\s+)/).map(w=>w.trim()?LATIN+w:w).join('')).join('، ')||'نامعلوم'}`, i.partNumber ? `شماره فنی: ${LATIN}${i.partNumber}` : '', i.quantity !== undefined ? `تعداد: ${i.quantity}` : ''].filter(Boolean).join('\n') },
    { title: 'وضعیت', width: 80, value: (i) => i.status },
    { title: 'موعد', width: 80, value: (i) => (i.dueAt ? `${formatJalali(i.dueAt, { time: true })}\n${i.dueLabel ?? ''}` : 'بدون موعد') },
    { title: 'مسئول', width: 70, value: (i) => i.responsible?.displayName ?? 'تعیین نشده' },
    { title: 'علت توقف', width: 85, value: (i) => i.stoppedBy ?? '—' },
    { title: 'اقدام بعدی', width: 0, value: (i) => i.nextAction },
  ];
  cols[cols.length - 1]!.width = right - left - cols.slice(0, -1).reduce((n, c) => n + c.width, 0);
  const pad = 4;
  const lineH = 11.5;

  const header = () => {
    doc.font('fa-bold').fontSize(8.5);
    let x = right;
    doc.rect(left, y, right - left, 18).fillColor('#e6e6e6').fill().fillColor('#000');
    for (const c of cols) {
      drawLine(doc, c.title, x - c.width + pad, x - pad, y + 4);
      x -= c.width;
    }
    y += 18;
    doc.font('fa').fontSize(8.5);
  };
  header();
  if (!rows.length) {
    drawLine(doc, 'با این فیلترها موردی برای اقدام نیست.', left, right, y + 6);
    y += 24;
  }
  for (const item of rows) {
    const cells = cols.map((c) => wrap(doc, persianExceptMarked(c.value(item)), c.width - 2 * pad));
    const lines = Math.max(...cells.map((l) => l.length));
    const h = lines * lineH + 2 * pad;
    if (y + h > bottom && h <= bottom - doc.page.margins.top - 18 && y > doc.page.margins.top + 18) {
      doc.addPage();
      y = doc.page.margins.top;
      header();
    }
    let offset = 0;
    while (offset < lines) {
      const capacity = Math.floor((bottom - y - 2 * pad) / lineH);
      if (capacity < 1) {
        doc.addPage();
        y = doc.page.margins.top;
        header();
        continue;
      }
      const count = Math.min(capacity, lines - offset);
      let x = right;
      cols.forEach((c, ci) => {
        cells[ci]!.slice(offset, offset + count).forEach((l, li) => drawLine(doc, l, x - c.width + pad, x - pad, y + pad + li * lineH));
        x -= c.width;
      });
      y += count * lineH + 2 * pad;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor('#555').stroke();
      offset += count;
    }
  }

  // ---- footer on every page
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    doc.font('fa').fontSize(8).fillColor('#000');
    const footY = doc.page.height - doc.page.margins.bottom - 4;
    drawLine(doc, `${dealership} — Manage by HEDAX — صفحه ${fa(p + 1)} از ${fa(range.count)}`, left, right, footY, 'center');
  }
  doc.end();
  return done;
}

export const __bidi = { tokens, visual };

export function renderPersianListPdf(title: string, header: string[], sections: { title: string; rows: string[] }[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 32, info: { Title: title, Producer: 'Manage by HEDAX' } });
  doc.registerFont('fa', FONT);
  doc.registerFont('fa-bold', BOLD);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.once('end', () => resolve(Buffer.concat(chunks)));
    doc.once('error', reject);
  });
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.page.margins.top;
  const bottom = doc.page.height - doc.page.margins.bottom;
  let y = top;
  function print(text: string, bold = false) {
    doc.font(bold ? 'fa-bold' : 'fa').fontSize(bold ? 12 : 10);
    for (const line of wrap(doc, toPersianDigits(text), right - left)) {
      if (y + 16 > bottom) {
        doc.addPage();
        y = top;
      }
      drawLine(doc, line, left, right, y);
      y += 16;
    }
  }
  print(title, true);
  for (const detail of header) print(detail);
  for (const section of sections) {
    y += 8;
    print(section.title, true);
    for (const row of section.rows) { print(row); y += 4; }
    if (!section.rows.length) print('ردیفی ثبت نشده است');
  }
  doc.end();
  return done;
}
