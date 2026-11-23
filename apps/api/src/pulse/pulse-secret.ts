import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// The کسب‌وکار password is stored only encrypted: AES-256-GCM with a server key from the
// environment (PULSE_SECRET_KEY, at least 32 characters; the AES key is its SHA-256), a
// fresh 12-byte IV per value and the 16-byte authentication tag. Format: v1.<iv>.<tag>.<data>
// in base64url. The browser never receives it back (spec section 26).

const deriveKey = (secret: string) => createHash('sha256').update(secret, 'utf8').digest();

export class PulseSecretError extends Error {
  constructor() {
    super('PULSE_SECRET');
    this.name = 'PulseSecretError';
  }
}

export function encryptSecret(plain: string, secret: string): string {
  if (!secret || secret.length < 32) throw new PulseSecretError();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** Throws PulseSecretError for a wrong key or a modified value (never returns garbage). */
export function decryptSecret(stored: string, secret: string): string {
  const [v, iv, tag, data] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || data == null || !secret) throw new PulseSecretError();
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new PulseSecretError();
  }
}
