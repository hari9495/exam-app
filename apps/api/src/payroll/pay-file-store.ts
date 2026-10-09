import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { BlobStorageService, OrgSecretsCryptoService } from '@exam-platform/shared';

// Generated payroll files (pay documents, exchange files, audit archives) at rest: encrypted (AES-256-GCM, the
// platform key) before they leave the API (§5.1, US-A-160), in blob storage, or a laptop folder in development.
// ponytail: one platform key; per-company keys (US-A-160) replace encrypt()/decrypt() here when they exist.

export const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

@Injectable()
export class PayFileStore {
  private readonly localDir = resolve(process.env.PAY_LOCAL_FILES_DIR ?? join(process.cwd(), '.pay-files'));

  constructor(
    private readonly blobs: BlobStorageService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  async put(key: string, data: Buffer): Promise<string> {
    const sealed = Buffer.from(this.crypto.encrypt(data.toString('base64')), 'utf8');
    if (this.blobs.isConfigured()) return this.blobs.upload(key, sealed, 'application/octet-stream');
    if (process.env.NODE_ENV === 'production') throw new Error('Blob storage is not configured');
    const path = join(this.localDir, key);
    await fs.mkdir(join(path, '..'), { recursive: true });
    await fs.writeFile(path, sealed);
    return `local:${key}`;
  }

  async get(ref: string): Promise<Buffer> {
    let sealed: Buffer;
    if (ref.startsWith('local:')) {
      const path = resolve(this.localDir, ref.slice('local:'.length));
      if (!path.startsWith(this.localDir)) throw new Error('Bad file key');
      sealed = await fs.readFile(path);
    } else sealed = await this.blobs.downloadToBuffer(ref);
    return Buffer.from(this.crypto.decrypt(sealed.toString('utf8')), 'base64');
  }

  async drop(ref: string): Promise<void> {
    if (!ref.startsWith('local:')) {
      await this.blobs.deleteByUrl(ref);
      return;
    }
    const path = resolve(this.localDir, ref.slice('local:'.length));
    if (path.startsWith(this.localDir)) await fs.rm(path, { force: true });
  }
}
