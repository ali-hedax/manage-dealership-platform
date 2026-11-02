import nodemailer from 'nodemailer';
import type {SendMailOptions} from 'nodemailer';
import {loadConfig} from '../config';
import {createServer,type AddressInfo} from 'node:net';
import {classifyMailError,InvitationMailService} from './invitation-mail.service';

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
    await expect(new InvitationMailService(config).send(message)).rejects.toMatchObject({failure:'recipient_rejected'});
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({secure:false,requireTLS:true}));expect(close).toHaveBeenCalled();
  });
});

describe('Invitation mail failure categories',()=>{
  it('classifies nodemailer and socket errors without using their text',()=>{
    expect(classifyMailError({code:'EAUTH',responseCode:535,message:'Username and Password not accepted'})).toBe('auth_failed');
    expect(classifyMailError({code:'ETIMEDOUT',message:'Connection timeout'})).toBe('connection_blocked');
    expect(classifyMailError({code:'ESOCKET',message:'connect ECONNREFUSED 127.0.0.1:465'})).toBe('connection_blocked');
    expect(classifyMailError({code:'ESOCKET',message:'self-signed certificate in certificate chain'})).toBe('tls_failed');
    expect(classifyMailError({code:'EDNS',message:'getaddrinfo ENOTFOUND smtp.example.test'})).toBe('dns_failed');
    expect(classifyMailError({code:'EENVELOPE',responseCode:550})).toBe('recipient_rejected');
    expect(classifyMailError(new Error('something else'))).toBe('unknown');
  });
  // Real sockets, no mocks: the categories the owner sees for a closed port and for an unresolvable host.
  const real=(over:Record<string,string>)=>new InvitationMailService(loadConfig({APP_ENV:'test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'synthetic-mail-password',SMTP_FROM:'sender@example.test',...over}));
  it('reports a refused connection as connection_blocked',async()=>{
    const server=createServer().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const port=(server.address() as AddressInfo).port;await new Promise(r=>server.close(r));
    expect(await real({SMTP_HOST:'127.0.0.1',SMTP_PORT:String(port)}).check()).toEqual({status:'failed',failure:'connection_blocked'});
  });
  it('reports a TLS handshake with a non-TLS server as tls_failed',async()=>{
    const server=createServer(s=>s.end('220 plain smtp\r\n')).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    try{expect(await real({SMTP_HOST:'127.0.0.1',SMTP_PORT:String((server.address() as AddressInfo).port)}).check()).toEqual({status:'failed',failure:'tls_failed'});}
    finally{server.close();}
  });
  it('reports an unresolvable host as dns_failed and missing settings as not_configured',async()=>{
    expect(await real({SMTP_HOST:'smtp.invalid'}).check()).toEqual({status:'failed',failure:'dns_failed'});
    expect(await new InvitationMailService(loadConfig({APP_ENV:'test'})).check()).toEqual({status:'not_configured'});
  });
});
