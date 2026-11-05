/** A stock mutation changes option balances, reservation queues and desk totals. */
export function isStockCacheKey(key: unknown): boolean {
  return typeof key === 'string' && (
    key.startsWith('/stock/options?') ||
    key.startsWith('/stock/reservations?') ||
    key === '/daily-reports/status'
  );
}
