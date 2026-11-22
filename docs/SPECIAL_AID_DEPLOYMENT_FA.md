# نصب ماژول «پیگیری امداد ویژه» روی Production — دستور کار

وضعیت: کد در main ادغام می‌شود (PR #119)؛ **نصب روی Production هنوز انجام نشده** و فقط با تأیید مالک، با روال انتشار موجود روی سرور (`/home/manage/incoming/<release>/`) انجام می‌شود. Production دادهٔ واقعی دارد. SHA دقیق main در [PROGRESS](../PROGRESS.md) ثبت است.

## آنچه نصب می‌شود
- دو migration افزایشی پس از v1.0.8 (۳۴ migration → ۳۶): `0034_special_aid_module` و `0035_special_aid_completion`.
  - ۸ جدول تازه (پرونده، پذیرش، قطعه، تماس، گروه، کارت پذیرش، بازخورد، تصمیم نوبت) که پس از migration خالی‌اند.
  - `stock_reservations`: ستون `special_aid_item_id`؛ `case_id` و `part_request_id` nullable؛ قید `stock_reservations_owner_ck` (هر رزرو دقیقاً یک صاحب). همهٔ رزروهای فعلی پرونده و قطعه دارند و قید روی آن‌ها برقرار است.
  - `notifications`: `category`، `urgent` (پیش‌فرض false)، `resolved_at`، `resolved_by`.
  - `users`: `job_titles` (پیش‌فرض خالی)، `access_expires_at` (پیش‌فرض null).
  - `special_aid_items.replaces_item_id`.
- هیچ ردیف موجودی پاک یا بازنویسی نمی‌شود؛ هیچ رزرو قبلی آزاد نمی‌شود؛ رفتار تازهٔ انبار فقط روی رزروهای امداد ویژهٔ تازه اثر دارد.
- فایل‌های `apps/api/src/db/down/0034…` و `0035…` فقط برای تمرین‌اند.

## شواهد تمرین موجود (بدون دادهٔ واقعی)
- آزمون `guided-migrations` (PGlite): ارتقا، حفظ رزرو قبلی، رد رزرو بی‌صاحب، down هر دو migration.
- CI، job «Migrations and demo seed on PostgreSQL 16»: اسکریپت `rehearse-special-aid` روی (۱) نسخهٔ ساختگی ۳۴ migration و (۲) پایگاه دموی ساخته‌شده با خود کد v1.0.8 (`b3bfc8f`)؛ تعداد ردیف همهٔ جدول‌ها و اثر انگشت ردیف‌های موجود پیش و پس مقایسه می‌شود؛ شواهد در artifact «migration-rehearsal-evidence».
- **تمرین روی نسخهٔ بازیابی‌شده از پشتیبان Production هنوز انجام نشده** (نیازمند دسترسی سرور و تأیید مالک؛ مرحلهٔ ۲ زیر).

## ۱. پشتیبان رمزگذاری‌شده (روی سرور، پیش از هر کار)
با روال موجود (`operational.py` / `maint_backup.py`) پشتیبان بگیرید، یا معادل دستی:
```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
docker exec manage-db-1 pg_dump -U manage -d manage -Fc > /home/manage/backups/operational/$TS-special-aid-pre.dump
sha256sum /home/manage/backups/operational/$TS-special-aid-pre.dump > /home/manage/backups/operational/$TS-special-aid-pre.dump.sha256
# نسخهٔ رمزگذاری‌شده برای نگه‌داری بیرون از سرور (گذرواژه را در فایل یا تاریخچهٔ shell ننویسید):
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in /home/manage/backups/operational/$TS-special-aid-pre.dump -out /home/manage/backups/operational/$TS-special-aid-pre.dump.enc
```
روی رایانهٔ مدیر، نسخهٔ DPAPI مثل روال قبلی در `F:\Manage Backups` نگه داشته شود. پیش از ادامه، بازیابی آزمایشی همان پشتیبان در پایگاه جدا بررسی شود.

## ۲. تمرین روی نسخهٔ بازیابی‌شده (نه روی Production)
```bash
docker exec manage-db-1 createdb -U manage manage_aid_rehearsal_$TS
docker exec -i manage-db-1 pg_restore -U manage -d manage_aid_rehearsal_$TS < /home/manage/backups/operational/$TS-special-aid-pre.dump
# با image تازهٔ API (شبکهٔ داخلی compose)، فقط روی پایگاه تمرین:
docker run --rm --network <شبکهٔ compose> <image تازهٔ API> node dist/scripts/rehearse-special-aid.js \
  --url postgres://manage:<گذرواژه>@db:5432/manage_aid_rehearsal_$TS --out /tmp/evidence.json
```
- اسکریپت پایگاهی با نام `manage` را رد می‌کند و فقط روی پایگاه دقیقاً ۳۴ migration کار می‌کند.
- باید `"ok": true` بدهد. یعنی تعداد ردیف همهٔ جدول‌ها یکسان، اثر انگشت ردیف‌های موجود (`stock_reservations`، `users`، `notifications`، `cases`، `part_requests`، `emdad_requests`، `reference_entries`، `tenants`) یکسان، رزرو بی‌صاحب صفر، قید معتبر، جدول‌های تازه خالی، کاربر قبلی بدون عنوان و تاریخ پایان.
- شواهد JSON کنار پوشهٔ انتشار نگه داشته شود.

### بررسی دادهٔ قدیمی انبار (فقط خواندنی، پیش و پس)
```sql
select status, count(*), sum(quantity) from stock_reservations group by status order by status;
select count(*) from stock_reservations where case_id is null or part_request_id is null;   -- پیش از migration باید 0 باشد
select count(*) from stock_reservations where status = 'issued' and reflected_at is null;    -- بدون تغییر پس از migration
```

## ۳. نصب (فقط با تأیید مالک)
1. artifact همان SHA main از CI (تصاویر Docker «preview-images-<sha>») یا ساخت تصویر از همان SHA با `docker compose build` در checkout همان commit.
2. روال موجود: stage → load → rehearse → final backup → migrate صریح (`node dist/scripts/migrate.js`) → جایگزینی کانتینرها با تله برگشت.
3. سلامت: `/api/v1/health` با `"db":"ok"`؛ ورود مالک؛ باز شدن «پیگیری امداد ویژه»، «مرکز گزارش‌های کسب‌وکار» و یک پروندهٔ تصادفی موجود؛ تعداد رزروهای فعال برابر پیش از نصب.
4. ثبت نسخه: `deploy/operational/confirm-healthy-release.sh <SHA کامل>` (نسخهٔ بعدی v1.0.9 خودکار).

## ۴. پس از نصب (مالک یا مدیر سیستم)
1. «پیگیری امداد ویژه ← کارهای امروز ← خواندن دوباره از گزارش‌های ثبت‌شده» یک بار (یا انتظار برای گزارش امداد بعدی) تا پرونده‌ها از ردیف‌های ثبت‌شدهٔ قبلی ساخته شوند. رزرو خودکار فقط پس از انتشار گزارش امداد بعدی و فقط با همهٔ شرط‌ها انجام می‌شود.
2. نخستین فایل «تعمیرات خودرو» و «لیست نوبت پذیرش» را با تأیید ستون‌ها در «اطلاعات پایه» وارد کنید ([راهنمای گزارش‌ها](ISACO_REPORTS_GUIDE_FA.md)).
3. **فهرست نقش‌ها (فقط مالک، «تنظیمات ← دسترسی‌ها»):**
   - [ ] اپراتور امداد ویژه: نقش «اپراتور امداد ویژه» (در صورت نیاز همراه نقش فعلی).
   - [ ] کارشناس پیگیری تأمین: نقش «کارشناس پیگیری تأمین امداد ویژه».
   - [ ] مدیر خدمات: بدون تغییر (گزارش و تذکر از قبل در نقش هست).
   - [ ] مسئول قطعات: بدون تغییر (مشاهدهٔ امداد ویژه از قبل در نقش هست).
   - [ ] مدیر سیستم یا مسئول ورود گزارش نوبت: مجوز «ورود گزارش لیست نوبت پذیرش» اگر مدیر سیستم نیست.
   - [ ] عنوان‌های شغلی و حساب مهمان (با تاریخ پایان) در صورت نیاز.

## برگشت
- برگشت کد: نصب دوبارهٔ تصاویر v1.0.8 (برچسب برگشت روال موجود). جدول‌ها و ستون‌های تازه برای نسخهٔ قبلی بی‌اثرند؛ اما رزروهای امداد ویژهٔ بدون پرونده (`case_id is null`) را کد قبلی نمی‌شناسد. در صورت برگشت، پیش از هر اقدام انبار با مالک هماهنگ شود.
- برگشت پایگاه داده فقط از پشتیبان مرحلهٔ ۱ (فایل‌های down فقط برای تمرین‌اند).

## ریسک‌های باز
- OCR تنظیم نشده؛ تطبیق کارت با شمارهٔ واردشده (تصمیم مالک).
- ستون‌های واقعی دو گزارش تازه در مخزن نیست؛ ورود اول با تأیید انسانی.
- ساخت محلی وب گاهی روی بررسی امنیتی نسخهٔ Next.js متوقف می‌شود (مسئلهٔ قبلی؛ ساخت CI موفق است).
