import { Logger } from '@nestjs/common';
import { BlobServiceClient, ContainerClient, BlockBlobClient, StorageSharedKeyCredential } from '@azure/storage-blob';
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
      return { succeeded: true } as never;
    });
  });

  afterEach(() => {
    deleteIfExists.mockRestore();
  });

  it('deletes the blob addressed by a URL that lives inside our own container and reports "deleted"', async () => {
    await expect(service.deleteByUrl(`${CONTAINER_URL}/webcam-snapshots/a.jpg`)).resolves.toBe('deleted');

    expect(addressed).toEqual([`${CONTAINER_URL}/webcam-snapshots/a.jpg`]);
  });

  it('reports "not-found" when the SDK says the blob never existed', async () => {
    deleteIfExists.mockImplementation(async function (this: BlockBlobClient) {
      addressed.push(this.url);
      return { succeeded: false } as never;
    });

    await expect(service.deleteByUrl(`${CONTAINER_URL}/webcam-snapshots/a.jpg`)).resolves.toBe('not-found');
  });

  it('decodes a URL-encoded blob path before deleting', async () => {
    await expect(service.deleteByUrl(`${CONTAINER_URL}/screen-captures/att%201-1.jpg`)).resolves.toBe('deleted');

    // Not just "one call" -- the resolved address must be the *decoded* name. Deleting the
    // decodeURIComponent call in the source would re-encode the literal "%20" and still pass a
    // weaker assertion; this one catches it.
    expect(addressed).toEqual([`${CONTAINER_URL}/screen-captures/att%201-1.jpg`]);
  });

  it('reports "skipped-empty-name" for a container URL plus a trailing slash, without attempting a delete', async () => {
    await expect(service.deleteByUrl(`${CONTAINER_URL}/`)).resolves.toBe('skipped-empty-name');

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('reports "skipped-not-ours" for a URL from a different container that merely starts the same, without attempting a delete', async () => {
    // "container-2" is a different container that happens to share "container" as a string
    // prefix -- the safety property is that this must never be treated as ours.
    await expect(
      service.deleteByUrl('https://fakeaccount.blob.core.windows.net/container-2/webcam-snapshots/a.jpg'),
    ).resolves.toBe('skipped-not-ours');

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('reports "skipped-not-ours" for a path-traversal URL that string-matches the prefix but resolves outside our container (fix round 1 regression)', async () => {
    // "../other-container/x.jpg" passes a plain `startsWith(prefix)` string check (it follows
    // immediately after our prefix), but the SDK resolves the ".." when it builds
    // BlockBlobClient#url, landing in a sibling container. A guard that trusts the string
    // check alone hands this straight to deleteIfExists.
    await expect(service.deleteByUrl(`${CONTAINER_URL}/../other-container/x.jpg`)).resolves.toBe('skipped-not-ours');

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('reports "skipped-not-ours" for a percent-encoded traversal, which a check running before decode cannot see (fix round 1 regression)', async () => {
    await expect(service.deleteByUrl(`${CONTAINER_URL}/%2E%2E/other-container/x.jpg`)).resolves.toBe('skipped-not-ours');

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('reports "skipped-not-ours" without throwing when the URL has malformed percent-encoding', async () => {
    await expect(service.deleteByUrl(`${CONTAINER_URL}/%E0%A4%A`)).resolves.toBe('skipped-not-ours');

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('reports "skipped-not-configured" and never touches the container when storage is not configured', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_CONTAINER;

    await expect(service.deleteByUrl(`${CONTAINER_URL}/webcam-snapshots/a.jpg`)).resolves.toBe('skipped-not-configured');

    expect(deleteIfExists).not.toHaveBeenCalled();
  });

  it('rejects (does not swallow) when the network call itself throws', async () => {
    deleteIfExists.mockRejectedValue(new Error('storage unreachable'));

    await expect(service.deleteByUrl(`${CONTAINER_URL}/webcam-snapshots/a.jpg`)).rejects.toThrow('storage unreachable');
  });
});

describe('BlobStorageService.signIfOurs', () => {
  let service: BlobStorageService;
  // A syntactically valid account key (any base64 string works -- generateSasUrl signs locally
  // via HMAC and never makes a network call, so this needs no real Azure credentials).
  const FAKE_ACCOUNT_KEY = Buffer.from('fake-shared-key-for-tests-only').toString('base64');
  const CREDENTIAL = new StorageSharedKeyCredential('fakeaccount', FAKE_ACCOUNT_KEY);

  beforeEach(() => {
    jest.clearAllMocks();
    const realContainer = new ContainerClient(CONTAINER_URL, CREDENTIAL);
    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue({
      getContainerClient: () => realContainer,
    });
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.AZURE_STORAGE_CONTAINER = 'container';
    service = new BlobStorageService();
  });

  afterEach(() => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_CONTAINER;
  });

  it('signs a URL that lives inside our own container into a short-lived, read-only SAS URL', async () => {
    const before = Date.now();
    const result = await service.signIfOurs(`${CONTAINER_URL}/webcam-snapshots/a.jpg`);
    const after = Date.now();

    expect(typeof result).toBe('string');
    const signed = result as string;
    expect(signed).not.toBe(`${CONTAINER_URL}/webcam-snapshots/a.jpg`);
    expect(signed.startsWith(`${CONTAINER_URL}/webcam-snapshots/a.jpg?`)).toBe(true);

    const params = new URLSearchParams(signed.split('?')[1]);
    expect(params.get('sp')).toBe('r'); // read-only permission
    expect(params.get('spr')).toBe('https'); // cannot be replayed over plain HTTP
    // TTL is 15 minutes with a 5 minute clock-skew back-date on the start.
    const expiresOn = new Date(params.get('se')!).getTime();
    const startsOn = new Date(params.get('st')!).getTime();
    expect(expiresOn).toBeGreaterThanOrEqual(before + 15 * 60_000 - 5_000);
    expect(expiresOn).toBeLessThanOrEqual(after + 15 * 60_000 + 5_000);
    expect(startsOn).toBeGreaterThanOrEqual(before - 5 * 60_000 - 5_000);
    expect(startsOn).toBeLessThanOrEqual(after - 5 * 60_000 + 5_000);
  });

  it('honors a caller-supplied TTL instead of the 15-minute default -- e.g. a link embedded in a static email, which may not be opened for days', async () => {
    const before = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60_000;
    const result = await service.signIfOurs(`${CONTAINER_URL}/logos/org-1.png`, ninetyDaysMs);
    const after = Date.now();

    const signed = result as string;
    const params = new URLSearchParams(signed.split('?')[1]);
    const expiresOn = new Date(params.get('se')!).getTime();
    expect(expiresOn).toBeGreaterThanOrEqual(before + ninetyDaysMs - 5_000);
    expect(expiresOn).toBeLessThanOrEqual(after + ninetyDaysMs + 5_000);
  });

  it('leaves an inline data: URI untouched', async () => {
    const dataUri = 'data:image/jpeg;base64,AAAA';
    await expect(service.signIfOurs(dataUri)).resolves.toBe(dataUri);
  });

  it('leaves a URL from a different container untouched, without signing it', async () => {
    const otherUrl = 'https://fakeaccount.blob.core.windows.net/container-2/webcam-snapshots/a.jpg';
    await expect(service.signIfOurs(otherUrl)).resolves.toBe(otherUrl);
  });

  it.each([null, undefined, '', 42, { snapshot: 'x' }, ['a']])('leaves %p untouched', async (value) => {
    await expect(service.signIfOurs(value)).resolves.toBe(value);
  });

  it('returns the input unchanged when storage is not configured', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_CONTAINER;
    const url = `${CONTAINER_URL}/webcam-snapshots/a.jpg`;

    await expect(service.signIfOurs(url)).resolves.toBe(url);
  });

  it('does not sign a path-traversal URL that string-matches the prefix but resolves outside our container', async () => {
    const traversalUrl = `${CONTAINER_URL}/../other-container/x.jpg`;

    await expect(service.signIfOurs(traversalUrl)).resolves.toBe(traversalUrl);
  });

  it('warns (logging the blob path, never the URL or a token) and returns the input unchanged when signing itself fails', async () => {
    // A container client with no credential attached -- generateSasUrl genuinely throws
    // ("...requires a StorageSharedKeyCredential...") rather than being mocked to.
    const anonymousContainer = new ContainerClient(CONTAINER_URL);
    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue({
      getContainerClient: () => anonymousContainer,
    });
    const anonymousService = new BlobStorageService();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const url = `${CONTAINER_URL}/webcam-snapshots/a.jpg`;

    await expect(anonymousService.signIfOurs(url)).resolves.toBe(url);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0];
    expect(message).toContain('webcam-snapshots/a.jpg'); // blob path
    expect(message).not.toContain(CONTAINER_URL); // never the full URL
    warnSpy.mockRestore();
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
