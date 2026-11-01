#!/usr/bin/env node
// Regenerates the synthetic parts-import sample offered for download in the
// web app. Run after `pnpm build` (uses the compiled API xlsx writer).
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { writeSheet } = require(join(root, 'apps/api/dist/parts/xlsx.js'));
const { IMPORT_COLUMNS } = require(join(root, 'apps/api/dist/parts/parts.service.js'));

const c = IMPORT_COLUMNS;
const rows = [
  [c.description, c.partNumber, c.quantity, c.source, c.approvedUnitPriceRial, c.notes],
  ['سپر عقب', 'TEST-PN-9001', 1, 'قطعه شرکت', 38000000, 'نمونه ساختگی'],
  ['چراغ خطر عقب راست', 'TEST-PN-9002', 1, 'انبار نمایندگی', 9500000, null],
  ['براکت سپر', 'TEST-PN-9003', 2, 'خرید بیرونی مجاز', 1200000, null],
  ['آرم صندوق', null, 1, 'قطعه مشتری', null, 'مشتری خودش تهیه می‌کند'],
];
const out = join(root, 'apps/web/public/samples/parts-import-sample.xlsx');
writeFileSync(out, writeSheet('قطعات', rows));
console.log(`written ${out}`);
