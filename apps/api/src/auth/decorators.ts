import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FeatureKey, Permission } from '@manage/shared';
import type { Actor, AuthedRequest } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSIONS = 'requiredPermissions';
export const REQUIRED_FEATURE = 'requiredFeature';

/** Route needs no session (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route requires every listed permission; enforced server-side by SessionGuard. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/**
 * Route belongs to a module of the central switch (packages/shared/src/features.ts). A module closed
 * for non-owners answers 404 to them, as if it did not exist (H2, owner 2026-11-27).
 */
export const RequireFeature = (feature: FeatureKey) => SetMetadata(REQUIRED_FEATURE, feature);

/** Injects the authenticated actor (user + request id + ip). */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return { user: req.user!, requestId: req.id, ip: req.ip };
});
