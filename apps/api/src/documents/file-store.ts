import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BlobStorageService, OrgSecretsCryptoService } from '@exam-platform/shared';

// The one place YukthiX keeps generated and uploaded files at rest (P05 §4.1; lifecycle D10: payroll 5a's file store,
// made shared): every file is encrypted (AES-256-GCM, the platform key) before it leaves the API, so storage never
// holds readable bytes and downloads always go through the API's permission check. Where the bytes live:
//   S3_BUCKET set      an S3-compatible bucket (AWS S3, MinIO on a laptop; founder D9 = A), refs "s3:<key>";
//   blob storage set   the existing Azure blob container (refs are its URLs), kept for files already stored there;
//   neither            a laptop folder (never in production), refs "local:<key>".
// Keys are org/{organization}/{area}/{uuid}: no names of people in them.
// ponytail: one platform key; per-company keys (US-A-160) replace encrypt()/decrypt() here when they exist.

export const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

/** An S3-compatible bucket from the environment, or null. Path-style addressing works for MinIO and AWS alike. */
export function s3FromEnv(env = process.env): { client: S3Client; bucket: string } | null {
  if (!env.S3_BUCKET) return null;
  const client = new S3Client({
    region: env.S3_REGION ?? 'ap-south-1',
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? { credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } } : {}),
  });
  return { client, bucket: env.S3_BUCKET };
}

@Injectable()
export class FileStore {
  private readonly localDir = resolve(process.env.PAY_LOCAL_FILES_DIR ?? join(process.cwd(), '.pay-files'));
  private readonly s3 = s3FromEnv();

  constructor(
    private readonly blobs: BlobStorageService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  async put(key: string, data: Buffer): Promise<string> {
    const sealed = Buffer.from(this.crypto.encrypt(data.toString('base64')), 'utf8');
    if (this.s3) {
      await this.s3.client.send(new PutObjectCommand({ Bucket: this.s3.bucket, Key: key, Body: sealed, ContentType: 'application/octet-stream', ServerSideEncryption: process.env.S3_ENDPOINT ? undefined : 'AES256' }));
      return `s3:${key}`;
    }
    if (this.blobs.isConfigured()) return this.blobs.upload(key, sealed, 'application/octet-stream');
    if (process.env.NODE_ENV === 'production') throw new Error('No file storage is configured');
    const path = join(this.localDir, key);
    await fs.mkdir(join(path, '..'), { recursive: true });
    await fs.writeFile(path, sealed);
    return `local:${key}`;
  }

  async get(ref: string): Promise<Buffer> {
    let sealed: Buffer;
    if (ref.startsWith('s3:')) {
      if (!this.s3) throw new Error('S3 storage is not configured');
      const out = await this.s3.client.send(new GetObjectCommand({ Bucket: this.s3.bucket, Key: ref.slice(3) }));
      sealed = Buffer.from(await out.Body!.transformToByteArray());
    } else if (ref.startsWith('local:')) {
      const path = resolve(this.localDir, ref.slice('local:'.length));
      if (!path.startsWith(this.localDir)) throw new Error('Bad file key');
      sealed = await fs.readFile(path);
    } else sealed = await this.blobs.downloadToBuffer(ref);
    return Buffer.from(this.crypto.decrypt(sealed.toString('utf8')), 'base64');
  }

  async drop(ref: string): Promise<void> {
    if (ref.startsWith('s3:')) {
      if (this.s3) await this.s3.client.send(new DeleteObjectCommand({ Bucket: this.s3.bucket, Key: ref.slice(3) }));
      return;
    }
    if (!ref.startsWith('local:')) {
      await this.blobs.deleteByUrl(ref);
      return;
    }
    const path = resolve(this.localDir, ref.slice('local:'.length));
    if (path.startsWith(this.localDir)) await fs.rm(path, { force: true });
  }
}
