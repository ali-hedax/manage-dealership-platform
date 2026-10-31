import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@manage/shared';
import type { Actor, AuthedRequest } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSIONS = 'requiredPermissions';

/** Route needs no session (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route requires every listed permission; enforced server-side by SessionGuard. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Injects the authenticated actor (user + request id + ip). */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return { user: req.user!, requestId: req.id, ip: req.ip };
});
