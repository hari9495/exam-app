import { Injectable, Logger } from '@nestjs/common';
import { BlobServiceClient, BlockBlobClient, ContainerClient, BlobSASPermissions, SASProtocol } from '@azure/storage-blob';

// Data URIs into uploadDataUri come straight from a candidate (webcam/screen captures), so
// the content type is untrusted input, not a server-chosen value. Without an allowlist a
// candidate could POST data:text/html;base64,... and get live HTML hosted at a .jpg path on
// the storage origin. Every current caller uploads a JPEG; PNG/WebP are allowed too since
// browsers can produce either from a canvas depending on support.
const ALLOWED_DATA_URI_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Shared with any caller that needs the raw bytes (e.g. AttemptService's face-embedding path) so
// the upload path and its callers cannot drift apart on what counts as a base64 data URI.
// ai-provider.ts keeps its own, deliberately stricter regex for a different purpose.
export function extractBase64FromDataUri(dataUri: string): { contentType: string; base64: string } | null {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUri);
  if (!match) return null;
  const [, contentType, base64] = match;
  return { contentType, base64 };
}

// Evidence links only need to survive one reviewer's page load, not a whole review session.
const SAS_READ_TTL_MS = 15 * 60_000;
// A caller's clock running a few minutes behind ours must not see a freshly minted link as
// "not yet valid" -- back-date the start slightly instead of pinning it to exactly now().
const SAS_CLOCK_SKEW_MS = 5 * 60_000;

// What actually happened to one blob-delete request. A GDPR erase caller aggregates these across
// a whole candidate's evidence and must be able to tell "we deleted everything" apart from "we
// silently skipped everything" -- the three no-op cases used to all disappear into a `void`
// return, indistinguishable from a real delete. A thrown error (storage genuinely unreachable,
// etc.) is deliberately not one of these outcomes -- it still rejects, same as before, so callers
// keep using their existing timeout/Promise.allSettled handling for that case.
export type BlobDeleteOutcome =
  | 'deleted'
  | 'not-found'
  | 'skipped-not-ours'
  | 'skipped-empty-name'
  | 'skipped-not-configured';

@Injectable()
export class BlobStorageService {
  private readonly logger = new Logger(BlobStorageService.name);
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
    const parsed = extractBase64FromDataUri(dataUri);
    if (!parsed) {
      throw new Error('Expected a base64 data URI');
    }
    const { contentType, base64 } = parsed;
    if (!ALLOWED_DATA_URI_CONTENT_TYPES.has(contentType)) {
      throw new Error(`Unsupported data URI content type: ${contentType}`);
    }
    return this.upload(blobPath, Buffer.from(base64, 'base64'), contentType);
  }

  // Guards signIfOurs and deleteByUrl so an unconfigured environment (local dev) degrades to a
  // reported no-op instead of getContainer() below throwing.
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
  //
  // Returns a reason alongside the null case so deleteByUrl can report *why* a URL was skipped
  // (not-ours vs. empty-name) without duplicating this resolution logic -- signIfOurs only ever
  // needs the blob-or-not distinction, so it just checks `.blob`.
  private resolveOwnedBlob(blobUrl: string): { blob: BlockBlobClient } | { blob: null; reason: 'not-ours' | 'empty-name' } {
    const container = this.getContainer();
    const prefix = `${container.url}/`;
    if (!blobUrl.startsWith(prefix)) {
      return { blob: null, reason: 'not-ours' };
    }
    let name: string;
    try {
      name = decodeURIComponent(blobUrl.slice(prefix.length));
    } catch {
      return { blob: null, reason: 'not-ours' }; // malformed percent-encoding in a database-sourced URL -- never ours to guess at
    }
    if (!name) {
      return { blob: null, reason: 'empty-name' }; // the container URL plus a trailing slash decodes to an empty blob name -- nothing to address
    }
    const blob = container.getBlockBlobClient(name);
    if (!blob.url.startsWith(prefix)) {
      return { blob: null, reason: 'not-ours' };
    }
    return { blob };
  }

  async deleteByUrl(blobUrl: string): Promise<BlobDeleteOutcome> {
    if (!this.isConfigured()) {
      return 'skipped-not-configured';
    }
    const resolved = this.resolveOwnedBlob(blobUrl);
    if (!resolved.blob) {
      return resolved.reason === 'empty-name' ? 'skipped-empty-name' : 'skipped-not-ours';
    }
    const response = await resolved.blob.deleteIfExists();
    return response.succeeded ? 'deleted' : 'not-found';
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
  //
  // ttlMs defaults to the evidence-review TTL (a live page load, signed fresh every request).
  // A caller embedding the result in an EMAIL must pass a much longer TTL -- the HTML is
  // rendered once at send time and the recipient may not open it for days, so a short-lived
  // link would go from working to a broken image the moment it expires. See
  // EMAIL_LOGO_SAS_TTL_MS in invitations.service.ts.
  async signIfOurs(value: unknown, ttlMs: number = SAS_READ_TTL_MS): Promise<unknown> {
    if (typeof value !== 'string' || !value || !this.isConfigured()) {
      return value;
    }
    const resolved = this.resolveOwnedBlob(value);
    if (!resolved.blob) {
      return value;
    }
    const blob = resolved.blob;
    try {
      const now = Date.now();
      return await blob.generateSasUrl({
        permissions: BlobSASPermissions.parse('r'),
        protocol: SASProtocol.Https,
        startsOn: new Date(now - SAS_CLOCK_SKEW_MS),
        expiresOn: new Date(now + ttlMs),
      });
    } catch (error) {
      // Degrade, don't throw -- the caller falls back to the raw (unrenderable) URL rather than
      // failing the whole request. But a silent fallback here is indistinguishable from the bug
      // this file exists to fix, so log it -- blob *name* only, never the URL/token, since a
      // credential failure means nothing was signed yet, but the input value could still be a
      // previously-signed URL passed back through in some future caller.
      this.logger.warn(`Failed to sign evidence blob URL for ${blob.name}`, error as Error);
      return value;
    }
  }
}
