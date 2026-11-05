import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError } from './errors';

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'اطلاعات ارسالی معتبر نیست',
        result.error.issues.map((i) => {
          const path=i.path.join('.');
          const labels:Record<string,string>={'vehicle.trim':'شرح تیپ خودرو','vehicle.model':'مدل خودرو','vehicle.brand':'برند خودرو','vehicle.color':'رنگ','vehicle.plate':'پلاک','vehicle.vin':'VIN','customer.fullName':'نام مشتری','customer.phone':'تلفن مشتری',admissionNo:'شماره پذیرش',admittedAt:'تاریخ پذیرش',officialDeadlineAt:'موعد رسمی',forecastDeliveryAt:'پیش‌بینی تحویل'};
          const label=labels[path]||'این فیلد';
          const text=i.code==='too_big'?`حداکثر ${String(i.maximum)} ${'origin' in i&&i.origin==='string'?'نویسه':'مقدار'} مجاز است`:i.code==='invalid_format'&&/At$/.test(path)?'تاریخ یا ساعت قابل خواندن نیست؛ از ورودی تاریخ و ساعت استفاده کنید':'مقدار واردشده معتبر نیست';
          return {path,message:`${label}: ${text}`};
        }),
      );
    }
    return result.data;
  }
}
