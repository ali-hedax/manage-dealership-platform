import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@manage/shared';

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
        body = {
          statusCode: status,
          code: status === 429 ? 'RATE_LIMITED' : status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
          message:
            status === 429
              ? 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.'
              : status === 404
                ? 'مسیر درخواستی وجود ندارد'
                : exception.message,
        };
      }
    } else {
      this.logger.error({ err: exception, requestId: req.id }, 'Unhandled error');
      body = { statusCode: 500, code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور' };
    }
    res.status(body.statusCode).json({ ...body, requestId: req.id });
  }
}
