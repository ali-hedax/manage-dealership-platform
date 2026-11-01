import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@manage/shared';

function isBodyParserError(e: unknown): e is { type: string; status: number } {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { type?: unknown }).type === 'string' &&
    (e as { type: string }).type.startsWith('entity.') &&
    typeof (e as { status?: unknown }).status === 'number'
  );
}

// Errors raised by Nest or Express themselves, without a domain code.
const GENERIC: Record<number, { code: string; message: string }> = {
  400: { code: 'INVALID_BODY', message: 'اطلاعات ارسالی قابل خواندن نیست' },
  404: { code: 'NOT_FOUND', message: 'مسیر درخواستی وجود ندارد' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'حجم اطلاعات ارسالی بیش از حد مجاز است' },
  429: { code: 'RATE_LIMITED', message: 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.' },
};

// Every error leaves the API as { statusCode, code, message, details? }.
// Unexpected errors are logged with the request id and never leak internals.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let body: ApiError;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload && 'code' in payload) {
        body = payload as ApiError;
      } else {
        body = { statusCode: status, ...(GENERIC[status] ?? { code: 'HTTP_ERROR', message: exception.message }) };
      }
    } else if (isBodyParserError(exception)) {
      // Raw error of the JSON body parser (thrown before any route runs).
      const status = exception.type === 'entity.too.large' ? 413 : 400;
      body = { statusCode: status, ...GENERIC[status]! };
    } else {
      this.logger.error({ err: exception, requestId: req.id }, 'Unhandled error');
      body = { statusCode: 500, code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور' };
    }
    res.status(body.statusCode).json({ ...body, requestId: req.id });
  }
}
