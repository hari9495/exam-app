import { BlobServiceClient, ContainerClient, BlockBlobClient } from '@azure/storage-blob';
import { BlobStorageService } from './blob-storage.service';

// Only BlobServiceClient.fromConnectionString is faked -- ContainerClient/BlockBlobClient are
// the *real* SDK classes below. A jest.fn() standing in for getBlockBlobClient can't reproduce
// the SDK's own URL joining (it just echoes back whatever object you tell it to), so it can't
// catch a guard that disagrees with what the SDK actually resolves a path to. Only a real
// client, exercised end to end, can catch that class of bug (see fix round 1).
jest.mock('@azure/storage-blob', () => {
  const actual = jest.requireActual('@azure/storage-blob');
  return { ...actual, BlobServiceClient: { fromConnectionString: jest.fn() } };
});

const CONTAINER_URL = 'https://fakeaccount.blob.core.windows.net/container';

describe('BlobStorageService.deleteByUrl', () => {
  let service: BlobStorageService;
  let deleteIfExists: jest.SpyInstance;
  // The real address deleteIfExists() was actually invoked against -- read off `this.url`
  // inside the stub rather than asserted from the argument we handed deleteByUrl(). A version
  // of deleteByUrl() that passes the wrong string into getBlockBlobClient() (the raw blobUrl
  // instead of the relative slice, say) still resolves to a real BlockBlobClient and still
  // calls deleteIfExists() once -- asserting call *count* alone can't catch that class of bug,
  // only asserting *which* blob it resolved to can (fix round 2).
  let addressed: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    addressed = [];
    const realContainer = new ContainerClient(CONTAINER_URL);
    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue({
      getContainerClient: () => realContainer,
    });
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.AZURE_STORAGE_CONTAINER = 'container';
    service = new BlobStorageService();
    // The only thing stubbed is the actual network call -- path joining and .url resolution
    // above this are the genuine SDK.
    deleteIfExists = jest.spyOn(BlockBlobClient.prototype, 'deleteIfExists').mockImplementation(async function (this: BlockBlobClient) {
      addressed.push(this.url);
      return {} as never;
    });
  });

  afterEach(() => {
    deleteIfExists.mockRestore();
  });

  it('deletes the blob addressed by a URL that lives inside our own container', async () => {
    await service.deleteByUrl(`${CONTAINER_URL}/webcam-snapshots/a.jpg`);

    expect(addressed).toEqual([`${CONTAINER_URL}/webcam-snapshots/a.jpg`]);
  });

  it('decodes a URL-encoded blob path before deleting', async () => {
    await service.deleteByUrl(`${CONTAINER_URL}/screen-captures/att%201-1.jpg`);

    // Not just "one call" -- the resolved address must be the *decoded* name. Deleting the
    // decodeURIComponent call in the source would re-encode the literal "%20" and still pass a
    // weaker assertion; this one catches it.
    expect(addressed).toEqual([`${CONTAINER_URL}/screen-captures/att%201-1.jpg`]);
  });

  it('does not attempt a delete for a container URL plus a trailing slash (empty blob name)', async () => {
    await expect(service.deleteByUrl(`${CONTAINER_URL}/`)).resolves.toBeUndefined();

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('rejects a URL from a different container that merely starts the same, without attempting a delete', async () => {
    // "container-2" is a different container that happens to share "container" as a string
    // prefix -- the safety property is that this must never be treated as ours.
    await service.deleteByUrl('https://fakeaccount.blob.core.windows.net/container-2/webcam-snapshots/a.jpg');

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('rejects a path-traversal URL that string-matches the prefix but resolves outside our container (fix round 1 regression)', async () => {
    // "../other-container/x.jpg" passes a plain `startsWith(prefix)` string check (it follows
    // immediately after our prefix), but the SDK resolves the ".." when it builds
    // BlockBlobClient#url, landing in a sibling container. A guard that trusts the string
    // check alone hands this straight to deleteIfExists.
    await service.deleteByUrl(`${CONTAINER_URL}/../other-container/x.jpg`);

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('rejects a percent-encoded traversal, which a check running before decode cannot see (fix round 1 regression)', async () => {
    await service.deleteByUrl(`${CONTAINER_URL}/%2E%2E/other-container/x.jpg`);

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('skips the delete without throwing when the URL has malformed percent-encoding', async () => {
    await expect(service.deleteByUrl(`${CONTAINER_URL}/%E0%A4%A`)).resolves.toBeUndefined();

    expect(deleteIfExists).not.toHaveBeenCalled();
  });
});

describe('BlobStorageService.uploadDataUri', () => {
  let service: BlobStorageService;
  let uploadData: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    const realContainer = new ContainerClient(CONTAINER_URL);
    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue({
      getContainerClient: () => realContainer,
    });
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.AZURE_STORAGE_CONTAINER = 'container';
    service = new BlobStorageService();
    uploadData = jest.spyOn(BlockBlobClient.prototype, 'uploadData').mockResolvedValue({} as never);
  });

  afterEach(() => {
    uploadData.mockRestore();
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts a %s data URI and uploads it', async (contentType) => {
    const url = await service.uploadDataUri('screen-captures/a.jpg', `data:${contentType};base64,AAAA`);

    expect(url).toBe(`${CONTAINER_URL}/screen-captures/a.jpg`);
    expect(uploadData).toHaveBeenCalledTimes(1);
  });

  it('rejects a data URI whose declared content type is outside the image allowlist, without uploading', async () => {
    // A candidate controls this content type -- data:text/html;base64,... would otherwise get
    // live HTML hosted at a .jpg-looking path on the storage origin.
    await expect(service.uploadDataUri('screen-captures/a.jpg', 'data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4=')).rejects.toThrow(
      'Unsupported data URI content type: text/html',
    );

    expect(uploadData).not.toHaveBeenCalled();
  });

  it('rejects application/octet-stream (not on the allowlist) without uploading', async () => {
    await expect(service.uploadDataUri('screen-captures/a.jpg', 'data:application/octet-stream;base64,AAAA')).rejects.toThrow(
      'Unsupported data URI content type: application/octet-stream',
    );

    expect(uploadData).not.toHaveBeenCalled();
  });
});
