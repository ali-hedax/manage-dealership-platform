'use client';
import { useEffect } from 'react';

/** Surfaces that catch the key light and tilt slightly toward the pointer. */
const LIT = '.workspace-card,.action-card,.pipeline a,.attention a,.kpi,.sx-readout';
const TILT = '.workspace-card,.action-card';

/**
 * Pointer-aware lighting for the Signature theme. One passive listener, at most one
 * style write per animation frame, and only on the hovered surface. It does nothing
 * for touch, for the classic theme, or when the user prefers reduced motion, so it
 * never runs continuously and never delays an action.
 */
export function SpatialLight() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let target: HTMLElement | null = null;
    let x = 0;
    let y = 0;
    const reset = (el: HTMLElement | null) => {
      el?.style.removeProperty('--sx-tilt-x');
      el?.style.removeProperty('--sx-tilt-y');
    };
    const paint = () => {
      frame = 0;
      if (!target) return;
      const r = target.getBoundingClientRect();
      const px = (x - r.left) / r.width;
      const py = (y - r.top) / r.height;
      target.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      target.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      if (target.matches(TILT)) {
        target.style.setProperty('--sx-tilt-x', `${((0.5 - py) * 4).toFixed(2)}deg`);
        target.style.setProperty('--sx-tilt-y', `${((px - 0.5) * 4).toFixed(2)}deg`);
      }
    };
    const move = (e: PointerEvent) => {
      if (document.documentElement.dataset.ui !== 'signature' || !fine.matches || calm.matches || e.pointerType !== 'mouse') return;
      const el = (e.target as Element | null)?.closest?.(LIT) as HTMLElement | null;
      if (el !== target) { reset(target); target = el; }
      if (!el) return;
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => { reset(target); target = null; };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
