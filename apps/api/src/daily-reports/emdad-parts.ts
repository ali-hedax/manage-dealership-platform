import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import { EMDAD_ARRIVED_CATEGORIES, EMDAD_DEALER_SUPPLY_CATEGORY, normalizePersian, parseBasePartNumber, parseStockCode } from '@manage/shared';
import type { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { DbOrTx } from '../db/database';
import { cases, emdadRequests, partRequests, vehicles } from '../db/schema';
import { caseAndBayRecipients, notifyUsers, partLink, usersWithRole } from '../parts/part-notify';
import { idKey } from '../vehicle-import/vehicle-sheet';
import type { EmdadOfficial } from './report-rows';

/**
 * Comparison key of a request number: Persian/Arabic digits and letters
 * normalised, spaces and dashes removed; an all-digit number loses its leading
 * zeros («۰۵۰۰۰۴۱» = «500041»). The stored text is never rewritten.
 */
export function requestNoKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = idKey(normalizePersian(raw));
  if (!k) return null;
  return /^\d+$/.test(k) ? k.replace(/^0+(?=\d)/, '') : k;
}

const baseOf = (code: string | null | undefined) => (code ? (parseStockCode(code)?.basePartNumber ?? parseBasePartNumber(code)) : null);

type RequestCandidate = { id: string; caseId: string; partNumber: string | null; vin: string | null; chassisRef: string | null };
type RequestDecision = { kind: 'link'; part: RequestCandidate; note: string } | { kind: 'review'; note: string };

/**
 * One Emdad request number belongs to one vehicle and may cover several of its
 * lines, so the technical code chooses the line; the chassis confirms a single
 * candidate whose code differs. Anything else waits for a person: never a guess.
 */
export function decideByRequest(o: Pick<EmdadOfficial, 'partCode' | 'initialCode' | 'fullCodeBase'>, chassis: string | null, candidates: RequestCandidate[]): RequestDecision {
  const reportBases = new Set([o.partCode, o.initialCode, o.fullCodeBase].map((c) => baseOf(c)).filter((b): b is string => !!b));
  const shortChassis = idKey(chassis ?? '');
  const chassisOk = (c: RequestCandidate) => !!shortChassis && (shortChassis.length === 17 ? idKey(c.vin ?? '') === shortChassis : idKey(c.chassisRef ?? '') === shortChassis);
  const byCode = candidates.filter((c) => {
    const b = baseOf(c.partNumber);
    return !!b && reportBases.has(b);
  });
  if (byCode.length === 1) {
    return { kind: 'link', part: byCode[0]!, note: chassisOk(byCode[0]!) ? 'شمارهٔ درخواست، کد فنی و شاسی یکسان است' : 'شمارهٔ درخواست و کد فنی یکسان است' };
  }
  if (byCode.length > 1) return { kind: 'review', note: 'چند قطعهٔ باز با همین شمارهٔ درخواست و کد فنی هست؛ یکی را دستی انتخاب کنید' };
  if (candidates.length === 1 && chassisOk(candidates[0]!)) {
    return { kind: 'link', part: candidates[0]!, note: 'شمارهٔ درخواست و شاسی یکسان است؛ کد فنی گزارش با قطعه فرق دارد' };
  }
  return { kind: 'review', note: 'شمارهٔ درخواست در منیج ثبت شده ولی کد فنی و شاسی با گزارش یکسان نیست؛ دستی تطبیق دهید' };
}

/**
 * Daily Emdad Vijeh report → unified parts list (spec section 7). Runs inside
 * the publish transaction of the report.
 *  1. A report line not yet linked to a part is linked by its request number
 *     (normalised) plus technical code or chassis (decideByRequest); an
 *     ambiguous or contradicting line waits in the review queue. A manual
 *     decision is never overridden.
 *  2. «وارد موجودی» / «رسید توسط نمایندگی»: the line becomes «امداد ویژه رسیده»
 *     (ready for handover); the case's expert and its bays are told.
 *  3. «تأمین توسط نمایندگی»: the parts clerks are told to price and supply it.
 */
export async function applyEmdadToParts(tx: DbOrTx, audit: AuditService, actor: Actor, importId: string, reportAt: Date) {
  const tenantId = actor.user.tenantId;
  const result = { linkedByRequestNo: 0, arrived: 0, dealerSupply: 0, needsReview: 0 };

  // 1. Link by request number + technical code + chassis (the request number
  // is entered by hand once, when the clerk registers Emdad on the line).
  const unlinked = await tx
    .select()
    .from(emdadRequests)
    .where(and(eq(emdadRequests.tenantId, tenantId), eq(emdadRequests.lastImportId, importId), isNull(emdadRequests.partRequestId), isNotNull(emdadRequests.requestNo), eq(emdadRequests.matchSource, 'auto')));
  if (unlinked.length) {
    const open = await tx
      .select({ id: partRequests.id, caseId: partRequests.caseId, orderRef: partRequests.orderRef, partNumber: partRequests.partNumber, vin: vehicles.vin, chassisRef: vehicles.chassisRef })
      .from(partRequests)
      .innerJoin(cases, eq(cases.id, partRequests.caseId))
      .innerJoin(vehicles, eq(vehicles.id, cases.vehicleId))
      .where(and(eq(partRequests.tenantId, tenantId), isNotNull(partRequests.orderRef), eq(partRequests.source, 'company'), eq(partRequests.status, 'ordered'), eq(cases.status, 'open')));
    const taken = new Set(
      open.length
        ? (await tx.select({ id: emdadRequests.partRequestId }).from(emdadRequests).where(and(eq(emdadRequests.tenantId, tenantId), inArray(emdadRequests.partRequestId, open.map((p) => p.id))))).map((x) => x.id!)
        : [],
    );
    const byRequest = new Map<string, typeof open>();
    for (const p of open) {
      if (taken.has(p.id)) continue; // already followed by another report line
      const k = requestNoKey(p.orderRef);
      if (k) byRequest.set(k, [...(byRequest.get(k) ?? []), p]);
    }
    for (const r of unlinked) {
      const candidates = byRequest.get(requestNoKey(r.requestNo) ?? '') ?? [];
      if (!candidates.length) continue;
      const decision = decideByRequest(r.official as EmdadOfficial, r.chassis, candidates);
      if (decision.kind === 'review') {
        if (r.matchStatus !== 'needs_review' || r.matchNote !== decision.note) {
          await tx
            .update(emdadRequests)
            .set({ matchStatus: 'needs_review', matchNote: decision.note, updatedAt: new Date(), version: r.version + 1 })
            .where(and(eq(emdadRequests.id, r.id), eq(emdadRequests.version, r.version)));
          result.needsReview += 1;
        }
        continue;
      }
      const part = decision.part;
      byRequest.set(requestNoKey(r.requestNo)!, candidates.filter((c) => c.id !== part.id));
      await tx
        .update(emdadRequests)
        .set({ partRequestId: part.id, caseId: part.caseId, matchStatus: 'matched', matchNote: decision.note, updatedAt: new Date(), version: r.version + 1 })
        .where(and(eq(emdadRequests.id, r.id), eq(emdadRequests.version, r.version)));
      const same = [part];
      await audit.record(tx, actor, { entityType: 'part', entityId: same[0]!.id, caseId: same[0]!.caseId, action: 'emdad.linked_by_request_no', after: { requestId: r.id, requestNo: r.requestNo } });
      result.linkedByRequestNo += 1;
    }
  }

  // 2 and 3. Status of every linked line in this report.
  const linked = await tx
    .select({ e: emdadRequests, p: partRequests })
    .from(emdadRequests)
    .innerJoin(partRequests, eq(partRequests.id, emdadRequests.partRequestId))
    .innerJoin(cases, eq(cases.id, partRequests.caseId))
    .where(and(eq(emdadRequests.tenantId, tenantId), eq(emdadRequests.lastImportId, importId), eq(partRequests.status, 'ordered'), eq(partRequests.source, 'company'), eq(cases.status, 'open')));
  const clerks = linked.some((l) => l.e.statusCategory === EMDAD_DEALER_SUPPLY_CATEGORY) ? await usersWithRole(tx, tenantId, ['parts_clerk']) : [];
  for (const { e, p } of linked) {
    const official = (e.official ?? {}) as { emdadStatus?: string };
    if ((EMDAD_ARRIVED_CATEGORIES as readonly string[]).includes(e.statusCategory)) {
      const [saved] = await tx
        .update(partRequests)
        .set({ status: 'received', receivedAt: reportAt, inspection: 'ok', inspectionNote: null, receiptDocNo: null, updatedAt: new Date(), version: p.version + 1 })
        .where(and(eq(partRequests.id, p.id), eq(partRequests.version, p.version)))
        .returning();
      if (!saved) continue;
      await audit.record(tx, actor, {
        entityType: 'part',
        entityId: p.id,
        caseId: p.caseId,
        action: 'part.emdad_arrived',
        occurredAt: reportAt,
        before: { status: 'ordered', flowState: 'emdad' },
        after: { description: p.description, status: 'received', flowState: 'ready', emdadStatus: official.emdadStatus ?? null, requestNo: e.requestNo },
        snapshot: { version: saved.version, row: saved },
      });
      const to = await caseAndBayRecipients(tx, tenantId, p.caseId);
      await notifyUsers(tx, tenantId, to, { kind: 'part_ready', title: `امداد ویژه رسید: ${p.description}`, body: 'قطعه آمادهٔ تحویل به جایگاه است؛ تحویل بگیرید.', link: partLink(p.caseId, p.id), dedupeKey: `part_ready:${p.id}:${saved.version}` });
      result.arrived += 1;
    } else if (e.statusCategory === EMDAD_DEALER_SUPPLY_CATEGORY) {
      await notifyUsers(tx, tenantId, clerks, {
        kind: 'emdad_dealer_supply',
        title: `امداد ویژه: تأمین توسط نمایندگی — ${p.description}`,
        body: 'شرکت این قطعه را ندارد. قیمت بدهید و از بازار یا موجودی تأمین کنید (پس از مجوز پرداخت‌کننده).',
        link: partLink(p.caseId, p.id),
        dedupeKey: `emdad_dealer_supply:${p.id}:${e.id}`,
      });
      result.dealerSupply += 1;
    }
  }
  return result;
}
