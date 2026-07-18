import { OrgSecretsCryptoService } from './org-secrets-crypto.service';

describe('OrgSecretsCryptoService', () => {
  let service: OrgSecretsCryptoService;

  beforeEach(() => {
    process.env.ORG_SECRETS_ENCRYPTION_KEY = '0'.repeat(64);
    service = new OrgSecretsCryptoService();
  });

  it('round-trips a plaintext value through encrypt then decrypt', () => {
    const blob = service.encrypt('sk-ant-super-secret-key');
    expect(service.decrypt(blob)).toBe('sk-ant-super-secret-key');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const first = service.encrypt('same-plaintext');
    const second = service.encrypt('same-plaintext');
    expect(first).not.toBe(second);
  });

  it('throws when the encryption key env var is missing', () => {
    delete process.env.ORG_SECRETS_ENCRYPTION_KEY;
    expect(() => service.encrypt('anything')).toThrow('ORG_SECRETS_ENCRYPTION_KEY is not set');
  });

  it('throws when decrypting a tampered blob (auth tag mismatch)', () => {
    const blob = service.encrypt('sensitive-value');
    const [iv, authTag, ciphertext] = blob.split('.');
    const tampered = [iv, authTag, ciphertext.slice(0, -4) + 'AAAA'].join('.');
    expect(() => service.decrypt(tampered)).toThrow();
  });
});
