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

  beforeEach(() => {
    jest.clearAllMocks();
    const realContainer = new ContainerClient(CONTAINER_URL);
    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue({
      getContainerClient: () => realContainer,
    });
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.AZURE_STORAGE_CONTAINER = 'container';
    service = new BlobStorageService();
    // The only thing stubbed is the actual network call -- path joining and .url resolution
    // above this are the genuine SDK.
    deleteIfExists = jest.spyOn(BlockBlobClient.prototype, 'deleteIfExists').mockResolvedValue({} as never);
  });

  afterEach(() => {
    deleteIfExists.mockRestore();
  });

  it('deletes the blob addressed by a URL that lives inside our own container', async () => {
    await service.deleteByUrl(`${CONTAINER_URL}/webcam-snapshots/a.jpg`);

    expect(deleteIfExists).toHaveBeenCalledTimes(1);
  });

  it('decodes a URL-encoded blob path before deleting', async () => {
    await service.deleteByUrl(`${CONTAINER_URL}/screen-captures/att%201-1.jpg`);

    expect(deleteIfExists).toHaveBeenCalledTimes(1);
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
