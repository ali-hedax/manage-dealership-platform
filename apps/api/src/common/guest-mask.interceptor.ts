import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { isMaskedViewer, maskForGuest } from '@manage/shared';
import { map, type Observable } from 'rxjs';
import type { AuthedRequest } from '../auth/auth.types';
import { forbidden } from './errors';

// Spec section 29.7: a guest reads with the customer's full name, full chassis/VIN, phone and
// amounts hidden. Masking runs here, on the server, for every JSON response of a guest, so no
// route can hand a guest the raw values. Files and exports cannot be masked: a guest gets 403.
@Injectable()
export class GuestMaskInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user || !isMaskedViewer(req.user.roles, req.user.isOwner)) return next.handle();
    return next.handle().pipe(map((body: unknown) => {
      if (body instanceof StreamableFile || Buffer.isBuffer(body) || body instanceof Uint8Array) throw forbidden('دریافت فایل و خروجی برای مهمان مجاز نیست');
      return maskForGuest(body);
    }));
  }
}
