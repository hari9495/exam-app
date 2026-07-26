import { Injectable } from '@nestjs/common';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

@Injectable()
export class BlobStorageService {
  private containerClient: ContainerClient | null = null;

  private getContainer(): ContainerClient {
    if (!this.containerClient) {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const containerName = process.env.AZURE_STORAGE_CONTAINER;
      if (!connectionString || !containerName) {
        throw new Error('Azure Blob Storage is not configured (AZURE_STORAGE_CONNECTION_STRING / AZURE_STORAGE_CONTAINER)');
      }
      this.containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
    }
    return this.containerClient;
  }

  async upload(blobPath: string, data: Buffer, contentType: string): Promise<string> {
    const blockBlobClient = this.getContainer().getBlockBlobClient(blobPath);
    await blockBlobClient.uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
    return blockBlobClient.url;
  }

  async uploadDataUri(blobPath: string, dataUri: string): Promise<string> {
    const match = /^data:(.+);base64,(.*)$/.exec(dataUri);
    if (!match) {
      throw new Error('Expected a base64 data URI');
    }
    const [, contentType, base64] = match;
    return this.upload(blobPath, Buffer.from(base64, 'base64'), contentType);
  }

  async deleteByUrl(blobUrl: string): Promise<void> {
    const container = this.getContainer();
    const prefix = `${container.url}/`;
    if (!blobUrl.startsWith(prefix)) {
      return; // not ours -- never try to delete an arbitrary URL
    }
    await container.getBlockBlobClient(decodeURIComponent(blobUrl.slice(prefix.length))).deleteIfExists();
  }
}
