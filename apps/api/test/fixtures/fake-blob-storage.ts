// In-memory stand-in for BlobStorageService (Azure Blob Storage) at the provider boundary, so no e2e
// test ever reaches a real storage account. Override it with:
//   builder.overrideProvider(BlobStorageService).useValue(fakeBlobStorage)
export const FAKE_BLOB_CONTAINER_URL = 'https://fake-blob.test/container';

export function createFakeBlobStorage() {
  const blobs = new Map<string, { data: Buffer; contentType: string }>();
  const nameOf = (url: string) => url.slice(FAKE_BLOB_CONTAINER_URL.length + 1);
  const isOurs = (value: unknown): value is string => typeof value === 'string' && value.startsWith(`${FAKE_BLOB_CONTAINER_URL}/`);

  return {
    blobs,
    upload: jest.fn(async (blobPath: string, data: Buffer, contentType: string) => {
      blobs.set(blobPath, { data, contentType });
      return `${FAKE_BLOB_CONTAINER_URL}/${blobPath}`;
    }),
    uploadDataUri: jest.fn(async (blobPath: string, dataUri: string) => {
      const match = /^data:(.+);base64,(.*)$/.exec(dataUri);
      if (!match) throw new Error('Expected a base64 data URI');
      blobs.set(blobPath, { data: Buffer.from(match[2], 'base64'), contentType: match[1] });
      return `${FAKE_BLOB_CONTAINER_URL}/${blobPath}`;
    }),
    downloadToBuffer: jest.fn(async (blobUrl: string) => {
      const blob = isOurs(blobUrl) ? blobs.get(nameOf(blobUrl)) : undefined;
      if (!blob) throw new Error(`Fake blob not found: ${blobUrl}`);
      return blob.data;
    }),
    deleteByUrl: jest.fn(async (blobUrl: string) => {
      if (!isOurs(blobUrl)) return 'skipped-not-ours' as const;
      return blobs.delete(nameOf(blobUrl)) ? ('deleted' as const) : ('not-found' as const);
    }),
    // The real service appends a short-lived SAS token to URLs it owns; pass-through keeps assertions simple.
    signIfOurs: jest.fn(async (value: unknown) => value),
    isConfigured: () => true,
  };
}
