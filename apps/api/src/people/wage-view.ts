import type { TaskWage } from '@manage/shared';
import type { technicianWages } from '../db/schema';

/** What the technician may see of their own wage on a job card: the amount and whether it changed after being seen. */
export function ownWage(w: typeof technicianWages.$inferSelect): TaskWage {
  const seen = w.seenAmountRial !== null;
  return { amountRial: w.amountRial, seen, changed: seen && w.seenAmountRial !== w.amountRial, previousRial: seen ? w.seenAmountRial : null, version: w.version };
}
