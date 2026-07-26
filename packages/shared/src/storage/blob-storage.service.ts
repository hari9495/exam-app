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

  // Checked once by callers doing a batch of deletes so a missing env var produces one
  // log line, not one per blob (getContainer() below still throws for any other caller
  // that skips this check).
  isConfigured(): boolean {
    return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING && process.env.AZURE_STORAGE_CONTAINER);
  }

  async deleteByUrl(blobUrl: string): Promise<void> {
    const container = this.getContainer();
    const prefix = `${container.url}/`;
    if (!blobUrl.startsWith(prefix)) {
      return; // not ours -- never try to delete an arbitrary URL
    }
    let blob;
    try {
      blob = container.getBlockBlobClient(decodeURIComponent(blobUrl.slice(prefix.length)));
    } catch {
      return; // malformed percent-encoding in a database-sourced URL -- never ours to guess at
    }
    // The plain string check above passes a "../other-container/x.jpg" suffix (or its
    // %2E%2E-encoded form) straight through -- the SDK resolves the ".." when it builds
    // the client's own .url, landing outside our container. Round-trip through that
    // instead of trusting the string check alone: this can never disagree with what
    // deleteIfExists() below is actually about to address.
    if (!blob.url.startsWith(prefix)) {
      return;
    }
    await blob.deleteIfExists();
  }
}
