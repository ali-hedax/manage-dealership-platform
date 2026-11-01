import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Response } from 'express';
import { from, mergeMap, of, type Observable } from 'rxjs';
import type { AuthedRequest } from '../auth/auth.types';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { idempotencyKeys } from '../db/schema';
import { badRequest } from './errors';

// Retried POST/PATCH requests with the same Idempotency-Key return the stored
// response instead of repeating the change (double-click, flaky network, and
// later the LAN<->cloud sync replay). Keys are scoped per tenant and user.
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !req.user || !['POST', 'PATCH'].includes(req.method)) {
      return next.handle();
    }
    if (key.length > 100) throw badRequest('INVALID_IDEMPOTENCY_KEY', 'کلید تکرار نامعتبر است');
    const scope = and(
      eq(idempotencyKeys.tenantId, req.user.tenantId),
      eq(idempotencyKeys.userId, req.user.id),
      eq(idempotencyKeys.key, key),
    );
    const path = req.originalUrl.split('?')[0]!;

    return from(this.handle.db.select().from(idempotencyKeys).where(scope).limit(1)).pipe(
      mergeMap(([stored]) => {
        if (stored) {
          if (stored.method !== req.method || stored.path !== path) {
            throw badRequest('IDEMPOTENCY_KEY_REUSED', 'این کلید تکرار برای درخواست دیگری استفاده شده است');
          }
          res.status(stored.responseStatus);
          res.setHeader('Idempotent-Replay', 'true');
          return of(stored.responseBody);
        }
        return next.handle().pipe(
          mergeMap(async (body) => {
            await this.handle.db
              .insert(idempotencyKeys)
              .values({
                tenantId: req.user!.tenantId,
                userId: req.user!.id,
                key,
                method: req.method,
                path,
                responseStatus: res.statusCode,
                responseBody: body ?? null,
              })
              .onConflictDoNothing();
            return body;
          }),
        );
      }),
    );
  }
}
