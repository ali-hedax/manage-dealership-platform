import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { loginSchema, technicianLoginSchema, type LoginInput, type Me, type TechnicianLoginInput } from '@manage/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, type AuthedRequest } from './auth.types';
import { Public } from './decorators';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  // Per-IP brute-force limit; configured in configureApp (relaxed only for tests).
  @Throttle({ default: { limit: (ctx) => ctx.switchToHttp().getRequest().app.get('loginRateLimit') ?? 10, ttl: 60_000 } })
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    const { token, expiresAt } = await this.auth.login(body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
    });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.cfg.COOKIE_SECURE,
      path: '/',
      expires: expiresAt,
    });
    const user = await this.auth.authenticate(token);
    return this.auth.me(user!);
  }

  /** Technician sign-in with username + 4-digit PIN (see AuthService.technicianLogin). */
  @Public()
  @Post('technician-login')
  @HttpCode(200)
  @Throttle({ default: { limit: (ctx) => ctx.switchToHttp().getRequest().app.get('loginRateLimit') ?? 10, ttl: 60_000 } })
  async technicianLogin(
    @Body(new ZodPipe(technicianLoginSchema)) body: TechnicianLoginInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    const { token, expiresAt } = await this.auth.technicianLogin(body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
    });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.cfg.COOKIE_SECURE,
      path: '/',
      expires: expiresAt,
    });
    const user = await this.auth.authenticate(token);
    return this.auth.me(user!);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@Req() req: AuthedRequest): Me {
    return this.auth.me(req.user!);
  }
}
