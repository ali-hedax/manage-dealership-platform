import { decryptSecret, encryptSecret, PulseSecretError } from './pulse-secret';

// Synthetic, built at run time (not a credential).
const KEY = `test-only-pulse-${'k'.repeat(28)}`;

describe('pulse-secret (AES-256-GCM)', () => {
  it('round-trips with a fresh IV each time and never stores the plain text', () => {
    const a = encryptSecret('synthetic-password', KEY), b = encryptSecret('synthetic-password', KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain('synthetic');
    expect(a.split('.')).toHaveLength(4);
    expect(decryptSecret(a, KEY)).toBe('synthetic-password');
    expect(decryptSecret(encryptSecret('رمز فارسی ۱۲۳', KEY), KEY)).toBe('رمز فارسی ۱۲۳');
  });

  it('refuses a short key, a wrong key and a modified value', () => {
    expect(() => encryptSecret('x', 'short')).toThrow(PulseSecretError);
    const stored = encryptSecret('synthetic-password', KEY);
    expect(() => decryptSecret(stored, `${KEY}-other`)).toThrow(PulseSecretError);
    const [v, iv, tag, data] = stored.split('.');
    const flipped = `${v}.${iv}.${tag}.${data!.slice(0, -2)}${data!.endsWith('A') ? 'B' : 'A'}${data!.slice(-1)}`;
    expect(() => decryptSecret(flipped, KEY)).toThrow(PulseSecretError);
    expect(() => decryptSecret('plain', KEY)).toThrow(PulseSecretError);
  });
});
