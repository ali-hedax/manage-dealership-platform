# محیط آزمایشی (staging) منیج

**نشانی:** https://staging.managebyhedax.ir

بازسازی منیج روی شاخهٔ `rebuild` ساخته می‌شود. هر بار که کاری در این شاخه ادغام شود، نسخهٔ تازه روی staging نصب می‌شود. منیج اصلی (`managebyhedax.ir`) تا جایگزینی نهایی دست نمی‌خورد.

## جداسازی از منیج اصلی (تصمیم مالک، ۶ آذر ۱۴۰۵)

staging روی همان سرور منیج اصلی است، ولی هیچ بخشی از منیج اصلی را با آن شریک نیست:

| مورد | منیج اصلی | staging |
| --- | --- | --- |
| پوشه | `/opt/manage` | `/home/manage/manage-staging` |
| پایگاه داده | `manage-db-1` | `manage-staging-staging-db-1`، با volume جدا |
| سرویس‌ها | `api`، `web`، `pulse`، `gate` | `staging-api`، `staging-web`، `staging-pulse`، `staging-db` |
| ایمیج | `manage-api:latest`، `manage-web:latest` | `manage-api:staging`، `manage-web:staging` |
| فایل محیط و رمزها | `/opt/manage/.env` | `/home/manage/manage-staging/secrets/` |
| لایهٔ رمز | فرم gate | رمز جدای مرورگر (basic auth) |
| حافظه | — | سقف حدود ۱٫۳ گیگابایت برای هر چهار سرویس |

- فقط `staging-web` به شبکهٔ منیج اصلی وصل است، با نام یکتای `manage-staging-web`، تا Caddy بتواند درخواست‌ها را به آن برساند. این سرویس رمز پایگاه داده ندارد.
- نام همهٔ سرویس‌های staging با `staging-` شروع می‌شود تا هیچ‌کدام هم‌نام سرویس‌های منیج اصلی نشود.
- **نصب نسخهٔ تازه** برچسب ایمیج‌های منیج اصلی را عوض نمی‌کند. اسکریپت `load-images.py` برچسب‌های داخل فایل ایمیج را پیش از بارگذاری به `staging-<sha>` تغییر می‌دهد، و `deploy.sh` بعد از بارگذاری بررسی می‌کند که برچسب‌های منیج اصلی ثابت مانده باشند.
- **Caddy:** فقط یک بلوک تازه برای `staging.managebyhedax.ir` به فایل منیج اصلی اضافه شد. از فایل قبلی پشتیبان گرفته شد و بلوک‌های قبلی دست نخوردند.
- **Caddy در حال اجرا:** نسخهٔ قدیمی‌تری از فایل `Caddyfile` را می‌خواند (inode جدا؛ در ۷ آذر پیدا شد). محتوای آن با فایل روی دیسک یکی بود. پیکربندی تازه با `caddy reload` از یک کپی داخل کانتینر بارگذاری شد و فایل روی دیسک همان چیزی است که راه‌اندازی دوبارهٔ Caddy می‌خواند.
- **گواهی:** گواهی لبهٔ آروان wildcard است (`*.managebyhedax.ir`). سرور برای این نام گواهی داخلی Caddy دارد و در پنل آروان کاری لازم نیست.

## پالس روی staging

- با همان نام کاربری کسب‌وکار منیج اصلی کار می‌کند (تصمیم مالک).
- **فقط خواندنی** است. پالس فقط درخواست‌های فهرست مجاز فقط‌خواندنی را می‌فرستد (`assertAllowed` در `kasb-client.ts`) و در کسب‌وکار چیزی نمی‌نویسد، ثبت نمی‌کند و تأیید نمی‌کند.
- **فاصلهٔ خواندن** حداقل ۳۰ دقیقه است. هر نصب و هر بررسی خودکار آن را دوباره به ۳۰ دقیقه برمی‌گرداند.
- **ورود اطلاعات کسب‌وکار** را مالک خودش انجام می‌دهد: وارد staging شوید، به «تنظیمات ← Manage Nexus ← اتصال و تنظیمات پالس» بروید، کد نمایندگی، نام کاربری و کلمهٔ عبور را وارد کنید و «شروع» را بزنید.
  - کلمهٔ عبور رمزگذاری‌شده در پایگاه دادهٔ staging ذخیره می‌شود، با کلید جدای staging. در git، گزارش یا PR نمی‌آید.

## ورود به staging

1. **رمز مرورگر:** نام کاربری `staging`. رمز را از گزارش نصب یا از فایل `/home/manage/manage-staging/secrets/basic-auth.txt` روی سرور بگیرید.
2. **ورود به خود منیج:** حساب‌های نمونه (`admin` و بقیه) با رمز فایل `/home/manage/manage-staging/secrets/staging-accounts.txt`.
   - دادهٔ staging نمونه است. پذیرش‌هایی که پالس می‌خواند به آن اضافه می‌شود.

## نصب نسخهٔ تازه

**خودکار:** پس از هر ادغام در `rebuild`، CI ایمیج‌ها را می‌سازد. `poll.sh` هر ۵ دقیقه آخرین CI سبز `rebuild` را می‌گیرد و نصب می‌کند. این بخش فقط وقتی فعال است که مالک یک توکن فقط‌خواندنی گیت‌هاب بسازد:

1. در گیت‌هاب: Settings ← Developer settings ← Fine-grained tokens ← Generate new token.
2. مخزن را فقط `ali-hedax/manage-dealership-platform` بگذارید. مجوز Actions را **Read-only** کنید و بقیه را «No access» بگذارید.
3. توکن را در سرور در فایل `/home/manage/manage-staging/secrets/github-token` بگذارید (یک خط، مجوز ۶۰۰).

**دستی (Claude Code):**
- `bash scripts/claude/staging.sh fetch-artifact <sha> <size> <sha256>` با نشانی امضاشدهٔ artifact روی ورودی استاندارد.
- سپس `bash scripts/claude/staging.sh deploy <sha>`.

**بازگشت:** `bash scripts/claude/staging.sh rollback` نسخهٔ قبلی staging را دوباره بالا می‌آورد.

**آزمون دود:** `bash scripts/claude/staging.sh smoke`. هم staging (رمز، صفحهٔ ورود، API) و هم منیج اصلی (ورود ۲۰۰، API بدون نشست ۴۰۱) را بررسی می‌کند.

## دسترسی Claude Code

- **کلید جدای staging:** کلید `~/.ssh/manage_staging_gate_ed25519` روی سرور فقط با forced command `staging-gate.sh` پذیرفته می‌شود. فقط می‌تواند این دستورها را اجرا کند و shell و دسترسی دیگری ندارد:
  - `status`
  - `logs`
  - `fetch-artifact`
  - `deploy`
  - `rollback`
  - `smoke`
- **اسکریپت‌ها و فایل compose** یک بار با تأیید مالک نصب شدند و از راه این کلید قابل تغییر نیستند.
- **سرور اصلی:** هر فرمانی با کلید منیج اصلی (`manage_preview_ed25519`) یا روی `85.198.52.255` در `.claude/settings.json` روی «ask» است. Claude Code بدون تأیید تک‌به‌تک مالک آن را اجرا نمی‌کند.
- **ادغام:** ادغام در `main` ممنوع است (`deny`). ادغام در `rebuild` فقط با `scripts/claude/merge-into-rebuild.sh` انجام می‌شود، که مقصد را `rebuild` و همهٔ بررسی‌های CI را سبز می‌خواهد.

## فایل‌ها

پوشهٔ `deploy/staging/` شامل `docker-compose.staging.yml`، `deploy.sh`، `load-images.py`، `staging-gate.sh`، `fetch-artifact.py`، `poll.sh`، `poll-github.py`، `smoke.sh`، `setup.sh` و `Caddyfile.staging-block` است.
