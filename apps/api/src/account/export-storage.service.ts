import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ContainerClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { JWT } from 'google-auth-library';

// T2-G 45 (answer 2744): uploads the company's encrypted export to the storage it connected, with each provider's
// official SDK (AWS SDK v3, Azure Storage Blob, Google's auth library for the Drive upload). Tests replace this service.

export type DestinationKind = 's3' | 'azure_blob' | 'google_drive';
export interface S3Target { bucket: string; region: string; prefix: string }
export interface AzureTarget { accountName: string; container: string; prefix: string }
export interface DriveTarget { folderId: string }
export type Target = S3Target | AzureTarget | DriveTarget;
/** The decrypted secret: an access key pair, a storage account key, or a Google service account's JSON key. */
export type Secret = { accessKeyId: string; secretAccessKey: string } | { accountKey: string } | { clientEmail: string; privateKey: string };

const join = (prefix: string, name: string) => [prefix.replace(/^\/+|\/+$/g, ''), name].filter(Boolean).join('/');

@Injectable()
export class ExportStorageService {
  async upload(kind: DestinationKind, target: Target, secret: Secret, name: string, data: Buffer): Promise<void> {
    if (kind === 's3') {
      const t = target as S3Target;
      const s = secret as { accessKeyId: string; secretAccessKey: string };
      const client = new S3Client({ region: t.region, credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey } });
      try {
        await client.send(new PutObjectCommand({ Bucket: t.bucket, Key: join(t.prefix, name), Body: data, ContentType: 'application/zip' }));
      } finally {
        client.destroy();
      }
      return;
    }
    if (kind === 'azure_blob') {
      const t = target as AzureTarget;
      const s = secret as { accountKey: string };
      const container = new ContainerClient(`https://${t.accountName}.blob.core.windows.net/${t.container}`, new StorageSharedKeyCredential(t.accountName, s.accountKey));
      await container.getBlockBlobClient(join(t.prefix, name)).uploadData(data, { blobHTTPHeaders: { blobContentType: 'application/zip' } });
      return;
    }
    const t = target as DriveTarget;
    const s = secret as { clientEmail: string; privateKey: string };
    const jwt = new JWT({ email: s.clientEmail, key: s.privateKey, scopes: ['https://www.googleapis.com/auth/drive.file'] });
    const boundary = `yx${Date.now().toString(36)}`;
    const meta = JSON.stringify({ name, parents: [t.folderId], mimeType: 'application/zip' });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    await jwt.request({ url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  }
}
