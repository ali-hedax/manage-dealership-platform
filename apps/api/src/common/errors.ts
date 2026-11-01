import { HttpException, HttpStatus } from '@nestjs/common';

// Domain errors carry a stable machine code plus a Persian message that the
// web app can show directly.
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const notFound = (what = 'مورد') =>
  new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} پیدا نشد`);

export const forbidden = (message = 'شما مجوز انجام این عملیات را ندارید') =>
  new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.CONFLICT, code, message, details);

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);

export const versionConflict = (currentVersion?: number) =>
  conflict(
    'VERSION_CONFLICT',
    'این رکورد هم‌زمان توسط کاربر دیگری تغییر کرده است. صفحه را تازه کنید و دوباره تلاش کنید.',
    currentVersion === undefined ? undefined : { currentVersion },
  );
