import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';
import { CurrentActor, Public, RequirePermissions } from './decorators';
import { SESSION_COOKIE, type Actor, type AuthedRequest } from './auth.types';
import { emailLoginSchema,emailVerifySchema,invitationSchema,passwordSetSchema,
  type EmailLoginInput,type EmailVerifyInput,type InvitationInput,type PasswordSetInput } from './email.contracts';

const meta = (req: AuthedRequest) => ({ip:req.ip,requestId:req.id,userAgent:req.headers['user-agent']});
@Controller('auth')
export class EmailAuthController {
  constructor(private readonly email: EmailAuthService,private readonly auth:AuthService,@Inject(APP_CONFIG) private readonly cfg:AppConfig) {}
  @Public() @Get('options') options() { return {totpEnabled:this.cfg.TOTP_AUTH_ENABLED}; }
  @Public() @Post('email/login') @Throttle({default:{limit:10,ttl:60000}})
  start(@Body(new ZodPipe(emailLoginSchema)) body:EmailLoginInput,@Req() req:AuthedRequest) {return this.email.start(body,meta(req));}
  @Public() @Post('email/verify') @Throttle({default:{limit:15,ttl:60000}})
  async verify(@Body(new ZodPipe(emailVerifySchema)) body:EmailVerifyInput,@Req() req:AuthedRequest,@Res({passthrough:true}) res:Response) {
    const {token,expiresAt}=await this.email.verify(body,meta(req));
    res.cookie(SESSION_COOKIE,token,{httpOnly:true,sameSite:'lax',secure:this.cfg.COOKIE_SECURE,path:'/',expires:expiresAt});
    return this.auth.me((await this.auth.authenticate(token))!);
  }
  @RequirePermissions('user.manage') @Get('invitations')
  list(@CurrentActor() actor:Actor) {return this.email.list(actor);}
  @RequirePermissions('user.manage') @Get('invitations/email/status')
  mailStatus(@CurrentActor() actor:Actor) {return this.email.mailStatus(actor);}
  @RequirePermissions('user.manage') @Post('invitations/email') @Throttle({default:{limit:5,ttl:60000}})
  emailInvitation(@CurrentActor() actor:Actor,@Body(new ZodPipe(invitationSchema)) body:InvitationInput) {return this.email.invite(actor,body,'email');}
  @RequirePermissions('user.manage') @Post('invitations') @Throttle({default:{limit:5,ttl:60000}})
  invite(@CurrentActor() actor:Actor,@Body(new ZodPipe(invitationSchema)) body:InvitationInput) {return this.email.invite(actor,body);}
  @Public() @Post('invitations/accept') @Throttle({default:{limit:10,ttl:60000}})
  accept(@Body(new ZodPipe(passwordSetSchema)) body:PasswordSetInput,@Req() req:AuthedRequest) {return this.email.enroll(body,meta(req));}
  @Public() @Post('invitations/confirm') @Throttle({default:{limit:10,ttl:60000}})
  confirm(@Body(new ZodPipe(emailVerifySchema)) body:EmailVerifyInput,@Req() req:AuthedRequest) {return this.email.confirmEnrollment(body,meta(req));}
}
