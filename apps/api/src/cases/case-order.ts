import { asc, desc, sql } from 'drizzle-orm';
import { cases } from '../db/schema';

/** Natural case numbers, including unpadded legacy and Persian-digit numbers. */
export function caseListOrder(sort = 'admitted_desc') {
  const latin = sql`translate(${cases.caseNumber}, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')`;
  const prefix = sql`regexp_replace(${latin}, '[0-9]+$', '')`;
  const number = sql`coalesce(nullif(substring(${latin} from '[0-9]+$'), ''), '0')::numeric`;
  if (sort === 'case_number_desc') return [desc(prefix), desc(number), desc(cases.admittedAt), desc(cases.id)];
  if (sort === 'case_number_asc') return [asc(prefix), asc(number), asc(cases.admittedAt), asc(cases.id)];
  if (sort === 'admitted_asc') return [asc(cases.admittedAt), asc(prefix), asc(number), asc(cases.id)];
  return [desc(cases.admittedAt), desc(prefix), desc(number), desc(cases.id)];
}
