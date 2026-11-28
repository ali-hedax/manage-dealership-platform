import { newId } from '../common/ids';
import type { DbOrTx } from '../db/database';
import { receptionDefects, receptionEvents, receptionParts, receptionRepairs, receptions } from '../db/schema';
import type { KasbRow } from './kasb-table';
import { findCaseLink } from './pulse-link';
import { isClosed, jalaliDay, mapCard, mapDefect, mapPart, mapRepair } from './pulse-map';

// Synthetic receptions for the demo dealership (development and Preview only, and only while
// PULSE_ENABLED is on): the «پذیرش و ترخیص» pages and their browser test have something to show
// without any connection to کسب‌وکار. Invented data only (TESTVIN…, 0900…), is_test = true.

const DAY = 86_400_000;
const STATUS: Record<string, string> = { '3': 'در حال تعمیر', '5': 'در انتظار قطعه', '9': 'ترخیص شده' };

function card(n: number, daysAgo: number, over: KasbRow = {}): KasbRow {
  const at = new Date(Date.now() - daysAgo * DAY);
  return {
    DrcdRcd: 990000 + n, DrcdDealerSeq: String(1405090000 + n), DrcdDocNo: String(700 + n), DrcdRcptDate: jalaliDay(at), DrcdRcptTime: `0${8 + (n % 2)}:${10 + n}`,
    DrcdCarSt: 3, DrcdGarStatus: 'عادی', DrcdRecType: 'حضوری', DrcdEntryType: 'تعمیرات عمومی', DrcdGchsChs: `NAA${90000 + n}`, // Only the first one shares a VIN with a demo accident case (one «تصادفی» link).
    GchsVin: `TESTVIN${String(n === 1 ? 1 : 9900 + n).padStart(10, '0')}`,
    DrcdEngineNo: `ENG-DEMO-${n}`, GctpCtp: '1234', GctpDesc: ['تارا', 'دنا پلاس', 'رانا پلاس', 'سورن پلاس'][n % 4], WvmdVmd: '56789', WvmdDes: ['تارا اتوماتیک V4', 'دنا پلاس توربو', 'رانا پلاس دنده‌ای', 'سورن پلاس'][n % 4],
    GcolDesc: 'سفید', GchsDeliveDate: '1402/05/10', DrcdEntranceKm: 21000 + n * 1700, DrcdPlateSec: String(11 * n).padStart(2, '0').slice(-2), DrcdPlateAlph: 'ب', DrcdPlateThr: String(100 * n + n).padStart(3, '0').slice(-3), DrcdPlateReg: '10',
    DrcdCustName: `مشتری نمونهٔ ${n}`, DrcdOwnerMob: `0900000${String(n).padStart(4, '0')}`, DrcdOwnerTel: '', DrcdOwnerNatinalIde: '0000000000', DrcdOwnerAdd: 'نشانی ساختگی',
    DrcdDeliverName: 'تحویل‌دهندهٔ نمونه', DrcdDeliverMob: '09000009999', DssdDesc: 'سالن ۱', NdRcptFullName: 'پذیرشگر نمونه', DrcdCostEstim: 4_500_000 * n, DrcdExtDte: '', DrcdExtTim: '',
    ...over,
  };
}

const LINES: Record<number, { parts: KasbRow[]; repairs: KasbRow[]; defects: KasbRow[] }> = {
  1: {
    parts: [
      { DrepRep: 1101, DrepWgdsGds: '0012345601', WgdsDesc: 'لنت ترمز جلو', DrepQty: 1, DrepFinalQty: 1, DrepDUnitPrice: 3_200_000, DrepState: 'تأیید شده', DrepDEmdadFlg: 0 },
      { DrepRep: 1102, DrepWgdsGds: '0012345602', WgdsDesc: 'دیسک چرخ جلو', DrepQty: 2, DrepFinalQty: 2, DrepDUnitPrice: 5_800_000, DrepState: 'ثبت شده', DrepDEmdadFlg: 1 },
      { DrepRep: 1103, DrepWgdsGds: '0012345603', WgdsDesc: 'بلبرینگ چرخ', DrepQty: 1, DrepFinalQty: 0, DrepDUnitPrice: 1_900_000, DrepState: 'ردشده', DrepDcarCar: 'عدم موجودی' },
    ],
    repairs: [{ DrerRer: 2101, DrerGrprRpr: '101', DrerDesc: 'تعویض لنت و تراش دیسک', DrerState: 'در حال انجام', DrerFinalPrice: 2_400_000, DrerIsGar: 'N' }],
    defects: [{ DrefRef: 3101, DrefCustomerExp: 'صدای ترمز هنگام توقف', DrefExpertExp: 'ساییدگی لنت و دیسک', DrefState: 'تأیید شده', DrefType: 'مکانیکی' }],
  },
  2: { parts: [{ DrepRep: 1201, DrepWgdsGds: '0012345701', WgdsDesc: 'فیلتر روغن', DrepQty: 1, DrepFinalQty: 1, DrepDUnitPrice: 650_000, DrepState: 'تحویل شده', DrepDEmdadFlg: 0 }], repairs: [{ DrerRer: 2201, DrerGrprRpr: '010', DrerDesc: 'سرویس دوره‌ای', DrerState: 'انجام شد', DrerFinalPrice: 900_000 }], defects: [] },
  3: { parts: [], repairs: [], defects: [{ DrefRef: 3301, DrefCustomerExp: 'روشن شدن چراغ موتور', DrefState: 'باز' }] },
  4: { parts: [{ DrepRep: 1401, DrepWgdsGds: '0012345901', WgdsDesc: 'تسمه تایم', DrepQty: 1, DrepFinalQty: 1, DrepDUnitPrice: 2_700_000, DrepState: 'تحویل شده' }], repairs: [], defects: [] },
};

/** Four synthetic receptions: two today, one open for three days, one released. */
export async function seedDemoReceptions(tx: DbOrTx, tenantId: string): Promise<void> {
  const now = new Date();
  const rows = [card(1, 0), card(2, 0, { DrcdCarSt: 5 }), card(3, 3), card(4, 5, { DrcdCarSt: 9, DrcdExtDte: jalaliDay(new Date(Date.now() - DAY)), DrcdExtTim: '16:40' })];
  for (const row of rows) {
    const v = mapCard(row)!;
    const statusText = v.statusCode ? STATUS[v.statusCode] ?? null : null;
    const closed = isClosed(v.exitAt, statusText);
    const link = await findCaseLink(tx, tenantId, v.admissionNoKey, v.vin);
    const id = newId();
    const { kasbRcd, exitAt, searchText, official, rowHash, ...fields } = v;
    await tx.insert(receptions).values({
      ...fields, id, tenantId, kasbRcd, searchText, official, rowHash, statusText, isOpen: !closed, releasedAt: closed ? exitAt ?? now : null,
      firstSeenAt: now, lastSeenAt: now, linesReadAt: now, caseId: link.state === 'linked' ? link.caseIds[0]! : null, linkState: link.state, isDemo: true, isTest: true,
    });
    await tx.insert(receptionEvents).values({ id: newId(), tenantId, receptionId: id, kind: 'created', data: { status: statusText }, isTest: true });
    if (link.state === 'linked') await tx.insert(receptionEvents).values({ id: newId(), tenantId, receptionId: id, kind: 'case_linked', data: { caseId: link.caseIds[0] }, isTest: true });
    if (closed) await tx.insert(receptionEvents).values({ id: newId(), tenantId, receptionId: id, kind: 'released', data: null, isTest: true });
    const lines = LINES[Number(row.DrcdRcd) - 990000]!;
    for (const p of lines.parts.map((row) => mapPart(row))) {
      await tx.insert(receptionParts).values({ id: newId(), tenantId, receptionId: id, kasbLineId: p.lineId, official: p.official, rowHash: p.rowHash, name: p.name, code: p.code, qtyRequested: p.qtyRequested, qtyFinal: p.qtyFinal, unitPriceRial: p.unitPriceRial, state: p.state, specialAid: p.specialAid, warranty: p.warranty, rejectReason: p.rejectReason, repairLineId: p.repairLine, isTest: true });
      await tx.insert(receptionEvents).values({ id: newId(), tenantId, receptionId: id, kind: 'part_added', data: { name: p.name, code: p.code }, isTest: true });
    }
    for (const r of lines.repairs.map((row) => mapRepair(row))) await tx.insert(receptionRepairs).values({ id: newId(), tenantId, receptionId: id, kasbLineId: r.lineId, official: r.official, rowHash: r.rowHash, code: r.code, description: r.description, name: r.name, technician: r.technician, station: r.station, state: r.state, finalPriceRial: r.finalPriceRial, warranty: r.warranty, defectLineId: r.defectLine, isTest: true });
    for (const d of lines.defects.map(mapDefect)) await tx.insert(receptionDefects).values({ id: newId(), tenantId, receptionId: id, kasbLineId: d.lineId, official: d.official, rowHash: d.rowHash, customerText: d.customerText, expertText: d.expertText, state: d.state, type: d.type, isTest: true });
  }
}
