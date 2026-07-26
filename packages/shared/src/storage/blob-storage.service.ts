import { Injectable } from '@nestjs/common';
import { BlobServiceClient, BlockBlobClient, ContainerClient, BlobSASPermissions } from '@azure/storage-blob';

// Data URIs into uploadDataUri come straight from a candidate (webcam/screen captures), so
// the content type is untrusted input, not a server-chosen value. Without an allowlist a
// candidate could POST data:text/html;base64,... and get live HTML hosted at a .jpg path on
// the storage origin. Every current caller uploads a JPEG; PNG/WebP are allowed too since
// browsers can produce either from a canvas depending on support.
const ALLOWED_DATA_URI_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Evidence links only need to survive one reviewer's page load, not a whole review session.
const SAS_READ_TTL_MS = 15 * 60_000;
// A caller's clock running a few minutes behind ours must not see a freshly minted link as
// "not yet valid" -- back-date the start slightly instead of pinning it to exactly now().
const SAS_CLOCK_SKEW_MS = 5 * 60_000;

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
    if (!ALLOWED_DATA_URI_CONTENT_TYPES.has(contentType)) {
      throw new Error(`Unsupported data URI content type: ${contentType}`);
    }
    return this.upload(blobPath, Buffer.from(base64, 'base64'), contentType);
  }

  // Checked once by callers doing a batch of deletes so a missing env var produces one
  // log line, not one per blob (getContainer() below still throws for any other caller
  // that skips this check).
  isConfigured(): boolean {
    return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING && process.env.AZURE_STORAGE_CONTAINER);
  }

  // Shared by deleteByUrl and signIfOurs: resolve a database-sourced URL to a blob client, but
  // only if it truly lives inside our own container. A plain `startsWith(prefix)` string check
  // passes a "../other-container/x.jpg" suffix (or its %2E%2E-encoded form) straight through --
  // the SDK resolves the ".." when it builds the client's own .url, landing outside our
  // container. Round-tripping through the SDK's own URL resolution instead of trusting the
  // string check alone means this can never disagree with what the caller is actually about to
  // address (delete or sign).
  private resolveOwnedBlob(blobUrl: string): BlockBlobClient | null {
    const container = this.getContainer();
    const prefix = `${container.url}/`;
    if (!blobUrl.startsWith(prefix)) {
      return null; // not ours
    }
    let name: string;
    try {
      name = decodeURIComponent(blobUrl.slice(prefix.length));
    } catch {
      return null; // malformed percent-encoding in a database-sourced URL -- never ours to guess at
    }
    if (!name) {
      return null; // the container URL plus a trailing slash decodes to an empty blob name -- nothing to address
    }
    const blob = container.getBlockBlobClient(name);
    if (!blob.url.startsWith(prefix)) {
      return null;
    }
    return blob;
  }

  async deleteByUrl(blobUrl: string): Promise<void> {
    const blob = this.resolveOwnedBlob(blobUrl);
    if (!blob) {
      return; // not ours -- never try to delete an arbitrary URL
    }
    await blob.deleteIfExists();
  }

  // Response-shaping helper: mint a short-lived, read-only SAS URL for a value that came back
  // from an already tenant-scoped query, IF it's a URL pointing into our own private container.
  // Everything else -- inline data: URIs from before this fix, null/undefined/empty, non-string
  // values, a URL belonging to someone else's container, or storage simply not being configured
  // (local dev) -- passes through unchanged. Never throws: a signing failure must not fail the
  // request that's fetching the event list, only cost that one image.
  //
  // Callers must only ever feed this values sourced from their own tenant-scoped queries --
  // never a client-supplied path/URL -- or this becomes an arbitrary-blob read oracle.
  async signIfOurs(value: unknown): Promise<unknown> {
    if (typeof value !== 'string' || !value || !this.isConfigured()) {
      return value;
    }
    try {
      const blob = this.resolveOwnedBlob(value);
      if (!blob) {
        return value;
      }
      const now = Date.now();
      return await blob.generateSasUrl({
        permissions: BlobSASPermissions.parse('r'),
        startsOn: new Date(now - SAS_CLOCK_SKEW_MS),
        expiresOn: new Date(now + SAS_READ_TTL_MS),
      });
    } catch {
      return value; // e.g. no shared-key credential to sign with -- degrade, don't throw
    }
  }
}
