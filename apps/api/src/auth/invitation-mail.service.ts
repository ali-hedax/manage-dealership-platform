import { Inject, Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../config';
import { AppError } from '../common/errors';

export interface InvitationMessage { email: string; displayName: string; invitationUrl: string }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

@Injectable()
export class InvitationMailService {
  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  get configured(): boolean {
    return !!(this.cfg.SMTP_HOST && this.cfg.SMTP_USER && this.cfg.SMTP_PASSWORD && this.cfg.SMTP_FROM);
  }

  assertConfigured(): void {
    if (!this.configured) throw new AppError(503, 'INVITATION_MAIL_NOT_CONFIGURED', 'ارسال ایمیل دعوت هنوز تنظیم نشده است؛ با مسئول سامانه تماس بگیرید');
  }

  async send(message: InvitationMessage): Promise<void> {
    this.assertConfigured();
    const transport = nodemailer.createTransport({
      host: this.cfg.SMTP_HOST, port: this.cfg.SMTP_PORT, secure: this.cfg.SMTP_SECURE,
      requireTLS: !this.cfg.SMTP_SECURE,
      auth: { user: this.cfg.SMTP_USER, pass: this.cfg.SMTP_PASSWORD },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      logger: false, debug: false,
      disableFileAccess: true, disableUrlAccess: true,
    });
    try {
      const result = await transport.sendMail({
        from: this.cfg.SMTP_FROM,
        to: { name: message.displayName, address: message.email },
        subject: 'دعوت به Manage by HEDAX',
        text: `${message.displayName} عزیز،\n\nشما به Manage by HEDAX دعوت شده‌اید. برای انتخاب رمز شخصی و اتصال Google Authenticator، این لینک را باز کنید:\n${message.invitationUrl}\n\nدعوت ۲۴ ساعت اعتبار دارد. پس از فعال‌سازی با ایمیل، رمز شخصی و کد Authenticator وارد شوید. این دعوت مخصوص شماست؛ آن را برای دیگران نفرستید. اگر منتظر این دعوت نبودید، آن را نادیده بگیرید.\n\nManage by HEDAX`,
        html: `<div lang="fa" dir="rtl" style="font-family:Tahoma,sans-serif;line-height:2;max-width:560px;margin:auto"><h1>دعوت به Manage by HEDAX</h1><p>${escapeHtml(message.displayName)} عزیز،</p><p>برای انتخاب رمز شخصی و اتصال Google Authenticator، دکمه زیر را بزنید.</p><p><a href="${escapeHtml(message.invitationUrl)}">فعال‌سازی حساب من</a></p><p>این دعوت ۲۴ ساعت اعتبار دارد و مخصوص شماست؛ آن را برای دیگران نفرستید.</p><p>پس از فعال‌سازی با ایمیل، رمز شخصی و کد Authenticator وارد شوید. اگر منتظر این دعوت نبودید، آن را نادیده بگیرید.</p></div>`,
      });
      if (!result.accepted?.length || result.rejected?.length) throw new Error('Recipient not accepted');
    } finally {
      transport.close();
    }
  }
}
