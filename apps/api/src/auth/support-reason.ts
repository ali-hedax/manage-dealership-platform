import { badRequest } from '../common/errors';
import type { Actor } from './auth.types';

/**
 * A system administrator who is not the owner works as support. Every unlocking
 * of a restriction or correction of a recorded value by such an account needs a
 * written reason; it is stored with the audit row and shown in the owner's
 * report of system-admin actions (read from the audit, not copied).
 */
export function isSupportActor(actor: Actor): boolean {
  return !actor.user.isOwner && actor.user.roles.includes('system_admin');
}

export function requireSupportReason(actor: Actor, reason: string | null | undefined): void {
  if (isSupportActor(actor) && !reason?.trim()) {
    throw badRequest('SUPPORT_REASON_REQUIRED', 'مدیر سیستم برای باز کردن محدودیت یا اصلاح ثبت باید دلیل را بنویسد');
  }
}
