import { constants, createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, privateDecrypt, publicEncrypt, randomBytes, type KeyObject } from 'node:crypto';
import { KasbError } from './kasb-errors';

// Application-layer encryption of کسب‌وکار (spec section 26, «رمزنگاری لایهٔ برنامه»):
//   request  = { data: CryptoJS.AES.encrypt(JSON.stringify(payload), passphrase), key: RSA-OAEP-SHA256(passphrase, server public key) }
//   response = { data, key } → passphrase = RSA-OAEP-SHA256-decrypt(key, client private key) → AES-decrypt(data) = '{"data":"<json>"}'
// CryptoJS with a string passphrase uses the OpenSSL format: "Salted__" + 8-byte salt + AES-256-CBC
// ciphertext, key and IV from EVP_BytesToKey(MD5, 1 round). Pure module: Node crypto only.

const SALTED = Buffer.from('Salted__', 'latin1');

export interface KasbEnvelope {
  data: string;
  key: string;
}
export interface KasbAnswer<T = unknown> {
  Success: boolean;
  Data: T;
  MessageCode?: string | number | null;
  MessageDes?: string | null;
  /** Background reports (امداد ویژه): «just started», «running», «result ready», «expired», «error occurred». */
  reportStatus?: string | null;
}

/** OpenSSL EVP_BytesToKey(MD5, count 1): 32-byte key and 16-byte IV for AES-256-CBC. */
export function evpBytesToKey(passphrase: Buffer, salt: Buffer, keyLength = 32, ivLength = 16): { key: Buffer; iv: Buffer } {
  const blocks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let length = 0;
  while (length < keyLength + ivLength) {
    previous = createHash('md5').update(Buffer.concat([previous, passphrase, salt])).digest();
    blocks.push(previous);
    length += previous.length;
  }
  const all = Buffer.concat(blocks);
  return { key: all.subarray(0, keyLength), iv: all.subarray(keyLength, keyLength + ivLength) };
}

/** CryptoJS.AES.encrypt(text, passphrase).toString() */
export function aesEncrypt(text: string, passphrase: string, salt: Buffer = randomBytes(8)): string {
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, 'utf8'), salt);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([SALTED, salt, cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
}

/** CryptoJS.AES.decrypt(base64, passphrase).toString(CryptoJS.enc.Utf8) */
export function aesDecrypt(base64: string, passphrase: string): string {
  const raw = Buffer.from(base64, 'base64');
  if (raw.length < 32 || !raw.subarray(0, 8).equals(SALTED)) throw new KasbError('KASB_DECRYPT');
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, 'utf8'), raw.subarray(8, 16));
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString('utf8');
}

const OAEP = { padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' } as const;
export const rsaEncrypt = (publicKey: KeyObject, text: string) => publicEncrypt({ key: publicKey, ...OAEP }, Buffer.from(text, 'utf8')).toString('base64');
export const rsaDecrypt = (privateKey: KeyObject, base64: string) => privateDecrypt({ key: privateKey, ...OAEP }, Buffer.from(base64, 'base64')).toString('utf8');

/** A public key as PEM or as the bare base64 SPKI form WebCrypto imports. */
export function importPublicKey(text: string): KeyObject {
  const t = text.trim();
  try {
    if (t.includes('-----BEGIN')) return createPublicKey(t);
    return createPublicKey({ key: Buffer.from(t.replace(/\s+/g, ''), 'base64'), format: 'der', type: 'spki' });
  } catch {
    throw new KasbError('KASB_KEYS');
  }
}

/** A private key as PEM or as the bare base64 PKCS#8 form WebCrypto imports. */
export function importPrivateKey(text: string): KeyObject {
  const t = text.trim();
  try {
    if (t.includes('-----BEGIN')) return createPrivateKey(t);
    return createPrivateKey({ key: Buffer.from(t.replace(/\s+/g, ''), 'base64'), format: 'der', type: 'pkcs8' });
  } catch {
    throw new KasbError('KASB_KEYS');
  }
}

/** Encrypts a text for the holder of the private key matching `publicKey`. */
export function sealText(text: string, publicKey: KeyObject): KasbEnvelope {
  const passphrase = randomBytes(32).toString('hex');
  return { data: aesEncrypt(text, passphrase), key: rsaEncrypt(publicKey, passphrase) };
}

export function isEnvelope(value: unknown): value is KasbEnvelope {
  return !!value && typeof value === 'object' && typeof (value as KasbEnvelope).data === 'string' && typeof (value as KasbEnvelope).key === 'string';
}

/** Decrypts an envelope; any failure is KASB_DECRYPT (the cause is never kept, it could contain data). */
export function openText(envelope: unknown, privateKey: KeyObject): string {
  if (!isEnvelope(envelope)) throw new KasbError('KASB_PROTOCOL');
  try {
    return aesDecrypt(envelope.data, rsaDecrypt(privateKey, envelope.key));
  } catch {
    throw new KasbError('KASB_DECRYPT');
  }
}

/** Client side: body of an encrypted request. */
export const sealRequest = (payload: unknown, serverPublic: KeyObject): KasbEnvelope => sealText(JSON.stringify(payload), serverPublic);

/** Client side: `JSON.parse(JSON.parse(plain).data)` of an encrypted answer, checked for its shape. */
export function openAnswer<T = unknown>(envelope: unknown, clientPrivate: KeyObject): KasbAnswer<T> {
  const plain = openText(envelope, clientPrivate);
  let answer: unknown;
  try {
    const outer = JSON.parse(plain) as { data?: unknown };
    answer = typeof outer?.data === 'string' ? JSON.parse(outer.data) : outer?.data ?? outer;
  } catch {
    throw new KasbError('KASB_DECRYPT');
  }
  if (!answer || typeof answer !== 'object' || typeof (answer as KasbAnswer).Success !== 'boolean') throw new KasbError('KASB_PROTOCOL');
  return answer as KasbAnswer<T>;
}

/** Server side (synthetic test server only): the request payload. */
export function openRequest<T = unknown>(envelope: unknown, serverPrivate: KeyObject): T {
  try {
    return JSON.parse(openText(envelope, serverPrivate)) as T;
  } catch (e) {
    throw e instanceof KasbError ? e : new KasbError('KASB_DECRYPT');
  }
}

/** Server side (synthetic test server only): an encrypted answer in the shape the site sends. */
export const sealAnswer = (answer: KasbAnswer, clientPublic: KeyObject): KasbEnvelope => sealText(JSON.stringify({ data: JSON.stringify(answer) }), clientPublic);
