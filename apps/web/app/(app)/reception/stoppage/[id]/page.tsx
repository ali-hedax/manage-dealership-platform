'use client';
import { use } from 'react';
import { StoppageCase } from '@/components/Stoppages';

/** One stopped vehicle: vehicle card, locked stepper of the official stages, part lines and follow-up. */
export default function StoppageCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <StoppageCase id={id} />;
}
