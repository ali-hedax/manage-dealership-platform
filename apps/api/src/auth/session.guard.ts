import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@manage/shared';
import { AppError, forbidden } from '../common/errors';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, type AuthedRequest } from './auth.types';
import { IS_PUBLIC, REQUIRED_PERMISSIONS } from './decorators';

// Global guard: every route requires a valid session unless marked @Public(),
// and the permissions listed with @RequirePermissions(). This is the
// authoritative RBAC check — the web app hiding a button is only cosmetic.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    const user = token ? await this.auth.authenticate(token) : null;
    if (!user) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'لطفاً دوباره وارد شوید');
    }
    req.user = user;

    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, targets) ?? [];
    if (required.some((p) => !user.permissions.has(p))) throw forbidden();
    return true;
  }
}
