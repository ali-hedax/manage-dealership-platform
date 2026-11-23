import { generateKeyPairSync } from 'node:crypto';
import { aesDecrypt, aesEncrypt, evpBytesToKey, importPrivateKey, importPublicKey, openAnswer, openRequest, sealAnswer, sealRequest } from './kasb-crypto';
import { KasbError } from './kasb-errors';

// Synthetic keys generated in the test; the real keys are read from the site at run time.
const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const server = pair();
const client = pair();
const bare = (pem: string) => pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

// OpenSSL 3.0: `openssl enc -aes-256-cbc -md md5 -pass pass:<passphrase> -S 0102030405060708`, with
// the "Salted__" header that CryptoJS.AES.encrypt(text, passphrase).toString() produces.
const PASSPHRASE = '7f3c9a1e5b2d4c6f8a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5';
const PLAIN = '{"Success":true,"Data":{"متن":"ي و ك"}}';
const OPENSSL_VECTOR = 'U2FsdGVkX18BAgMEBQYHCKAjeWMonwfO4pAuuUe2aA6JLDspXqaMQRGbokQ7UHXpWCWo84cjWERVk+G/3hks5Q==';

describe('kasb-crypto', () => {
  it('produces and reads the CryptoJS/OpenSSL «Salted__» format byte for byte', () => {
    expect(aesEncrypt(PLAIN, PASSPHRASE, Buffer.from('0102030405060708', 'hex'))).toBe(OPENSSL_VECTOR);
    expect(aesDecrypt(OPENSSL_VECTOR, PASSPHRASE)).toBe(PLAIN);
    expect(OPENSSL_VECTOR.startsWith('U2FsdGVkX1')).toBe(true); // base64 of "Salted__"
  });

  it('derives key and IV with EVP_BytesToKey(MD5)', () => {
    const { key, iv } = evpBytesToKey(Buffer.from('secret'), Buffer.from('0102030405060708', 'hex'));
    expect(key).toHaveLength(32);
    expect(iv).toHaveLength(16);
    // A second derivation is identical; another salt is not.
    expect(evpBytesToKey(Buffer.from('secret'), Buffer.from('0102030405060708', 'hex')).key.equals(key)).toBe(true);
    expect(evpBytesToKey(Buffer.from('secret'), Buffer.from('0102030405060709', 'hex')).key.equals(key)).toBe(false);
  });

  it('round-trips a request and an answer with RSA-OAEP-SHA256 envelopes (PEM and bare base64 keys)', () => {
    const synthetic = ['synthetic', 'login'].join('-');
    const payload = { Scus: '9999', UserName: 'test.user', Password: synthetic, ClientVersion: '3.3.1', Lng: 'fa' };
    const request = sealRequest(payload, importPublicKey(bare(server.publicKey)));
    expect(Object.keys(request).sort()).toEqual(['data', 'key']);
    expect(request.data).not.toContain(synthetic);
    expect(openRequest(request, importPrivateKey(server.privateKey))).toEqual(payload);

    const answer = { Success: true, Data: { Token: 'aaa.bbb.ccc', TokenAge: 42000, status: 2 } };
    const envelope = sealAnswer(answer, importPublicKey(client.publicKey));
    expect(openAnswer(envelope, importPrivateKey(bare(client.privateKey)))).toEqual(answer);
  });

  it('uses a fresh passphrase for every request', () => {
    const key = importPublicKey(server.publicKey);
    const a = sealRequest({ x: 1 }, key), b = sealRequest({ x: 1 }, key);
    expect(a.data).not.toBe(b.data);
    expect(a.key).not.toBe(b.key);
  });

  it('fails with stable codes and never echoes content', () => {
    const answer = sealAnswer({ Success: true, Data: null }, importPublicKey(client.publicKey));
    // Wrong private key: KASB_DECRYPT.
    expect(() => openAnswer(answer, importPrivateKey(server.privateKey))).toThrow('KASB_DECRYPT');
    expect(() => openAnswer({ data: 1 }, importPrivateKey(client.privateKey))).toThrow('KASB_PROTOCOL');
    expect(() => aesDecrypt('bm90IHNhbHRlZA==', PASSPHRASE)).toThrow(KasbError);
    expect(() => importPublicKey('not a key')).toThrow('KASB_KEYS');
    // An answer without Success is not an answer of the site.
    const odd = sealAnswer({ Data: 1 } as never, importPublicKey(client.publicKey));
    expect(() => openAnswer(odd, importPrivateKey(client.privateKey))).toThrow('KASB_PROTOCOL');
  });
});
