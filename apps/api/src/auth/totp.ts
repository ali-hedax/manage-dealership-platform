import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {Secret,TOTP} from 'otpauth';

export function authenticator(secret: string,email='Manage') {
  return new TOTP({issuer:'Manage by HEDAX',label:email,algorithm:'SHA1',digits:6,period:30,secret:Secret.fromBase32(secret)});
}
export function newTotpSeed(){return new Secret({size:20}).base32;}
export function totpStep(secret:string,code:string,lastStep:number,now=Date.now()):number|null {
  if(!/^\d{6}$/.test(code))return null;
  const delta=authenticator(secret).validate({token:code,timestamp:now,window:1});
  if(delta===null)return null;
  const step=Math.floor(now/30000)+delta;
  return step>lastStep?step:null;
}
export function encryptTotp(secret:string,key:string){
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(key).digest(),nonce);
  const data=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return [nonce,cipher.getAuthTag(),data].map(b=>b.toString('base64url')).join('.');
}
export function decryptTotp(value:string,key:string){
  const [nonce,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64url'));
  const cipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(key).digest(),nonce!);
  cipher.setAuthTag(tag!);return Buffer.concat([cipher.update(data!),cipher.final()]).toString('utf8');
}
