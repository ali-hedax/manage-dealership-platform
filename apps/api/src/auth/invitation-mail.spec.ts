import nodemailer from 'nodemailer';
import type {SendMailOptions} from 'nodemailer';
import {loadConfig} from '../config';
import {InvitationMailService} from './invitation-mail.service';

describe('Invitation mail transport',()=>{
  afterEach(()=>jest.restoreAllMocks());
  const cfg=()=>loadConfig({APP_ENV:'test',SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'synthetic-mail-password',SMTP_FROM:'sender@example.test'});
  const message={email:'worker@example.test',displayName:'<script>synthetic</script>',invitationUrl:'https://manage.example.test/activate#token=synthetic'};
  it('requires encrypted transport, disables URL/file access and escapes names in HTML',async()=>{
    const sendMail=jest.fn(async(_options:SendMailOptions)=>({accepted:[message.email],rejected:[]}));
    const close=jest.fn();const factory=jest.spyOn(nodemailer,'createTransport').mockReturnValue({sendMail,close} as unknown as ReturnType<typeof nodemailer.createTransport>);
    await new InvitationMailService(cfg()).send(message);
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({secure:true,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true}));
    expect(sendMail.mock.calls[0]![0].html).toContain('&lt;script&gt;');
    expect(sendMail.mock.calls[0]![0].html).not.toContain('<script>');
    expect(sendMail.mock.calls[0]![0].text).toContain(message.invitationUrl);expect(close).toHaveBeenCalled();
  });
  it('requires STARTTLS for a non-implicit-TLS connection and rejects refused recipients',async()=>{
    const config=cfg();config.SMTP_SECURE=false;const close=jest.fn();
    const factory=jest.spyOn(nodemailer,'createTransport').mockReturnValue({sendMail:jest.fn(async()=>({accepted:[],rejected:[message.email]})),close} as unknown as ReturnType<typeof nodemailer.createTransport>);
    await expect(new InvitationMailService(config).send(message)).rejects.toThrow('Recipient not accepted');
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({secure:false,requireTLS:true}));expect(close).toHaveBeenCalled();
  });
});
