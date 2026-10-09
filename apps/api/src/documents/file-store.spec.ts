import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BlobStorageService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { FileStore, s3FromEnv } from './file-store';

// The shared file store (lifecycle 6a, D9 / D10) with an S3-compatible bucket: what reaches the bucket is never the
// readable bytes, refs are "s3:<key>", and a read decrypts back to the original. The bucket is an in-memory stand-in
// for the S3 client (no network); MinIO / AWS behave the same through the official SDK.
describe('FileStore on an S3-compatible bucket', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('is off without S3_BUCKET and uses path-style addressing with an endpoint (MinIO)', () => {
    expect(s3FromEnv({})).toBeNull();
    const s3 = s3FromEnv({ S3_BUCKET: 'yx-docs', S3_ENDPOINT: 'http://127.0.0.1:9000', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 'b' });
    expect(s3?.bucket).toBe('yx-docs');
    expect(s3?.client.config.forcePathStyle).toBe(true);
  });

  it('stores sealed bytes under the key and reads them back', async () => {
    process.env.S3_BUCKET = 'yx-docs';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9000';
    const crypto = { encrypt: (s: string) => `sealed:${Buffer.from(s).toString('hex')}`, decrypt: (s: string) => Buffer.from(s.slice(7), 'hex').toString() } as unknown as OrgSecretsCryptoService;
    const store = new FileStore({ isConfigured: () => false } as unknown as BlobStorageService, crypto);
    const bucket = new Map<string, Buffer>();
    const client = (store as unknown as { s3: { client: { send: (c: unknown) => Promise<unknown> } } }).s3.client;
    client.send = async (c: unknown) => {
      if (c instanceof PutObjectCommand) bucket.set(c.input.Key!, c.input.Body as Buffer);
      if (c instanceof GetObjectCommand) return { Body: { transformToByteArray: async () => new Uint8Array(bucket.get(c.input.Key!)!) } };
      return {};
    };
    const data = Buffer.from('PAN card scan');
    const ref = await store.put('org/o1/documents/f1', data);
    expect(ref).toBe('s3:org/o1/documents/f1');
    expect(bucket.get('org/o1/documents/f1')!.includes(data)).toBe(false);
    expect((await store.get(ref)).equals(data)).toBe(true);
  });
});
