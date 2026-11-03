import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config';

export const CLIENT_HEADER = 'x-manage-client';
export const DAILY_UPLOAD_PATH = '/api/v1/daily-reports/uploads';

/** HTTP hardening shared by the server entry point and the test harness. */
export function configureApp(app: INestApplication, cfg: AppConfig): void {
  const express = app as NestExpressApplication;
  // Behind one reverse proxy (Caddy/Nginx or the Next.js server) in every environment.
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  express.set('loginRateLimit', cfg.LOGIN_RATE_LIMIT ?? (cfg.APP_ENV === 'test' ? 1000 : 10));
  // Reference files allow 5 MB XLSX; other import contracts retain their own smaller caps.
  express.useBodyParser('json', { limit: '8mb' });
  // Binary upload of daily report files: raw bytes on this one route only (no base64 in JSON).
  express.useBodyParser('raw', {
    limit: cfg.DAILY_REPORT_MAX_BYTES,
    type: (req: { url?: string; headers: Record<string, unknown> }) =>
      !!req.url?.startsWith(DAILY_UPLOAD_PATH) && String(req.headers['content-type'] ?? '').startsWith('application/octet-stream'),
  });
  app.use(helmet());
  app.use(cookieParser());
  app.use((req:Request,res:Response,next:NextFunction)=>{
    if(req.path.startsWith('/api/v1/auth/')||req.path.startsWith('/api/v1/reference-')||req.path.startsWith('/api/v1/daily-reports')||req.path.startsWith('/api/v1/emdad')||req.path.startsWith('/api/v1/stock'))res.setHeader('Cache-Control','no-store');
    next();
  });

  // CSRF defence: state-changing requests must carry a custom header, which a
  // cross-site form or image cannot set and which CORS blocks for other origins.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.headers[CLIENT_HEADER]) return next();
    res.status(403).json({
      statusCode: 403,
      code: 'CSRF_HEADER_MISSING',
      message: 'درخواست نامعتبر است',
    });
  });

  const origins = cfg.API_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: true });

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
}
