import { generateKeyPairSync } from 'node:crypto';
import { importPrivateKey, importPublicKey } from './kasb-crypto';
import { extractKeys, findMainChunk, missingServicePaths, unescapeJs } from './kasb-keys';

const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const { publicKey, privateKey } = pair();

/** A minified bundle shaped like the site's: keys inside the env object, newlines escaped. */
const bundle = (pub: string, priv: string) =>
  `(this.webpackJsonp=this.webpackJsonp||[]).push([[1],{42:function(e,t,n){var r={NODE_ENV:"production",PUBLIC_URL:"",REACT_APP_VERSION:"3.3.1",REACT_APP_PUBLIC_KEY:${JSON.stringify(pub)},REACT_APP_PRIVATE_KEY:${JSON.stringify(priv)}};` +
  `var s={Path:"Srv/rcpt/RepairCard/Drcds/q",Params:{VarChs:"",VarRcptDateTo:"",VarRcptDateFr:"",VarDealerSeq:"",VarCus:""}},l={Path:"Sec/Login/v2"};}}]);`;

describe('kasb-keys', () => {
  it('finds the main bundle referenced by /home', () => {
    expect(findMainChunk('<script src="/static/js/2.9f8e7d6c.chunk.js"></script><script src="/static/js/main.1a2b3c4d.chunk.js"></script>')).toBe('/static/js/main.1a2b3c4d.chunk.js');
    expect(findMainChunk("<script src='./static/js/main.abcdef01.chunk.js'></script>")).toBe('/static/js/main.abcdef01.chunk.js');
    expect(findMainChunk('<html><body>no bundle</body></html>')).toBeNull();
  });

  it('extracts both keys from the env object (escaped PEM) and they import', () => {
    const keys = extractKeys(bundle(publicKey, privateKey));
    expect(keys.publicKey).toBe(publicKey.trim());
    expect(keys.privateKey).toBe(privateKey.trim());
    expect(importPublicKey(keys.publicKey).type).toBe('public');
    expect(importPrivateKey(keys.privateKey).type).toBe('private');
  });

  it('accepts bare base64 keys and quoted property names', () => {
    const b64 = (pem: string) => pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const text = `var e={"REACT_APP_PUBLIC_KEY":'${b64(publicKey)}',"REACT_APP_PRIVATE_KEY":'${b64(privateKey)}'}`;
    const keys = extractKeys(text);
    expect(importPublicKey(keys.publicKey).asymmetricKeyType).toBe('rsa');
    expect(importPrivateKey(keys.privateKey).asymmetricKeyType).toBe('rsa');
  });

  it('fails with KASB_KEYS when a key is missing', () => {
    expect(() => extractKeys('var e={REACT_APP_PUBLIC_KEY:"x"}')).toThrow('KASB_KEYS');
  });

  it('unescapes JavaScript string literals', () => {
    expect(unescapeJs('"a\\nb\\u0041\\x42\\/\\"c"')).toBe('a\nbAB/"c');
  });

  it('reports allowlisted service paths that the bundle no longer contains', () => {
    expect(missingServicePaths(bundle(publicKey, privateKey), ['Srv/rcpt/RepairCard/Drcds/q', 'Sec/Login/v2', 'Srv/rcpt/RepairCard/Dreps/q'])).toEqual(['Srv/rcpt/RepairCard/Dreps/q']);
  });
});
