import { z } from 'zod';
import { ROLES } from '@manage/shared';

export const emailLoginSchema = z.object({ email: z.email().trim().toLowerCase().max(254), password: z.string().min(1).max(256) });
export const emailVerifySchema = z.object({ challengeId: z.uuid(), proof: z.string().min(40).max(100), code: z.string().regex(/^\d{6}$/) });
export const invitationSchema = z.object({ email: z.email().trim().toLowerCase().max(254), displayName: z.string().trim().min(1).max(120), roles: z.array(z.enum(ROLES)).min(1).max(7) });
export const passwordSetSchema = z.object({ token: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/i), password: z.string().min(12).max(128) });
export const emailRequestSchema = z.object({ email: z.email().trim().toLowerCase().max(254) });
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type EmailVerifyInput = z.infer<typeof emailVerifySchema>;
export type InvitationInput = z.infer<typeof invitationSchema>;
export type PasswordSetInput = z.infer<typeof passwordSetSchema>;
