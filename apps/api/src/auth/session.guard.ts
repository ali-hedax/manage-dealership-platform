import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { Reflector } from '@nestjs/core';
import { featureOpen, type FeatureKey, type Permission } from '@manage/shared';
import { AppError, forbidden, notFound } from '../common/errors';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, type AuthedRequest } from './auth.types';
import { IS_PUBLIC, REQUIRED_FEATURE, REQUIRED_PERMISSIONS } from './decorators';

// Global guard: every route requires a valid session unless marked @Public(),
// and the permissions listed with @RequirePermissions(). This is the
// authoritative RBAC check — the web app hiding a button is only cosmetic.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
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

    // A module closed by the central switch does not exist for non-owners (404, before any permission check).
    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(REQUIRED_FEATURE, targets);
    if (feature && !featureOpen(feature, user.isOwner, this.cfg.OPEN_FEATURES)) throw notFound('صفحه');
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, targets) ?? [];
    if (required.some((p) => !user.permissions.has(p))) throw forbidden();
    return true;
  }
}
