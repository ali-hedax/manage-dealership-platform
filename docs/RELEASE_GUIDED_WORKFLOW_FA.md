# آماده‌سازی انتشار مسیر هدایت‌شده

وضعیت: آماده‌سازی؛ نسخهٔ Production همچنان `dadab06bdd133dd6f9b62c6da37518696e1b531d` است. شاخهٔ کار `fix/guided-accident-workflow` از همین `origin/main` ساخته شده است. مجوز قبلی مالک فقط برای نصب dadab06 بود؛ ادغام این PR و نصب نسخهٔ تازه هنوز مجوز ندارند. SHA آزموده‌شده و نتیجهٔ CI در PROGRESS و PR ثبت می‌شوند.

## نسخه و artifact

نسخهٔ قابل نصب فقط SHA نهایی ادغام‌شده در main است، بعد از موفقیت هر شش بررسی CI همان SHA. پیش از ادغام، SHA و شناسهٔ تصویر آن اجرای آینده وجود ندارند؛ تصویر آزمایش PR جایگزین تصویر main نیست.

از همان اجرای main، artifact `preview-images-<full-main-sha>` شامل `preview-image-source.txt`، `preview-image-ids.txt` (API سپس وب)، `preview-images.sha256` و `preview-images.tar.gz` دریافت شود. SHA کامل منبع و checksum آرشیو باید تطبیق داشته باشند. تصویرها روی سرور ساخته نشوند. نام و شناسهٔ دقیق ایمیج‌ها هنگام آماده‌شدن همان artifact در گزارش انتشار ثبت شوند؛ هر تفاوت باعث توقف پیش از recreate است.

## پیش‌نیاز نصب پس از مجوز مالک

1. اتصال با هویت اختصاصی Manage و StrictHostKeyChecking=yes؛ تأیید کاربر manage، میزبان manage-preview و مسیر /opt/manage. شناسهٔ کانتینرها، ایمیج‌ها و StartedAt قبل از تغییر ثبت شود. اگر همین نسخه از قبل سالم است، دوباره راه‌اندازی نشود.
2. حفظ فایل اصلاح‌شدهٔ gate و بکاپش و `/home/manage/operations/operational.yml`. فایل gate باید همان SHA-256 `09e653793efb4a6ed89c9f27b89c6ab415b758cd58ba0f3a943a736e4db5a57a` را داشته باشد. روی checkout سرور pull/reset/checkout اجرا نشود؛ هیچ بخشی از Source دست نخورد.
3. پشتیبان PostgreSQL و بازیابی تمرینی طبق [BACKUP_RESTORE](BACKUP_RESTORE.md). migrationهای 0024 و 0025 روی نسخهٔ بازیابی‌شده تمرین شوند؛ تعداد migrationها ۲۴ ← ۲۶ و جدول‌ها ۵۳ ← ۵۴، ردیف‌های قدیمی تغییر نکنند. مدرک و فرانشیز واقعی به محیط تست کپی نشوند.
4. ZIP همان اجرای CI در stage تازه باز شود (`python3 -m zipfile -e` اگر unzip موجود نیست). از شناسهٔ ایمیج‌های واقعاً در حال اجرای API و وب تگ rollback یکتا ساخته شود؛ سپس docker load و تطبیق هر شناسه با سرویس متناظر انجام شود. در شکست تطبیق، تگ‌ها برگردند و هیچ سرویسی بازسازی نشود.
5. migration از ایمیج تأییدشده با `bash deploy/operational/operational-compose.sh run --rm --no-deps api node dist/scripts/migrate.js` اجرا شود. فقط بعد از موفقیت migration، از /opt/manage دستور زیر اجرا شود:

```bash
bash deploy/operational/operational-compose.sh up -d --no-build --pull never --no-deps --force-recreate --wait --wait-timeout 120 api web
```

## سلامت و بازگشت

- شناسهٔ هر ایمیج در حال اجرا باید با manifest تأییدشده یکی باشد. از gate، `http://api:4000/api/v1/health` باید HTTP 200، status=ok و db=ok بدهد. `https://managebyhedax.ir/login` باید 200 باشد. شناسه، StartedAt و هش فایل gate قبل و بعد برابر بمانند.
- در نشست زندهٔ مجاز، فقط خواندنی: مسیر جاری پرونده، بایگانی، متن وضعیت امداد و صف جمع‌آوری فاکتور بررسی شوند؛ هیچ پرونده، مبلغ یا حساب واقعی برای smoke test تغییر نکند.
- در شکست نصب/سلامت، تگ‌های API و وب به شناسه‌های قبل برگردند و فقط همان دو سرویس با دستور بالا بازسازی شوند؛ سلامت نسخهٔ قبل دوباره بررسی شود. migrationها افزایشی‌اند و کد قبلی ستون/جدول تازه را نمی‌خواند؛ برای rollback تصویر، ستون یا مدرک تازه حذف نشود. بازیابی پایگاه یا down روی Production اقدام جداگانه با حفظ داده و مجوز مالک است.
- نتیجهٔ دقیق (نصب سالم، بازگشت سالم، یا مرحله/خطای توقف)، SHA main، شناسهٔ تصویرها، مسیر پشتیبان، نتیجهٔ تمرین و timestamp در گزارش انتشار ثبت شود. push یا build موفق، به معنی نصب موفق نیست.
