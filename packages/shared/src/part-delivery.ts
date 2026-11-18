/** Legacy completed lines have no counter; their full quantity was handed over. */
export function handedOverQuantity(p: { quantity: number; status: string; handedOverQuantity?: number | null }): number {
  if (p.status === 'returned' || p.status === 'cancelled') return 0;
  return p.handedOverQuantity ?? (p.status === 'handed_over' ? p.quantity : 0);
}
