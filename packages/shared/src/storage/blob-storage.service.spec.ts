import { BlobStorageService } from './blob-storage.service';

const deleteIfExists = jest.fn().mockResolvedValue(undefined);
const getBlockBlobClient = jest.fn().mockReturnValue({ deleteIfExists });
const getContainerClient = jest.fn().mockReturnValue({
  url: 'https://blob.test/container',
  getBlockBlobClient,
});
const fromConnectionString = jest.fn().mockReturnValue({ getContainerClient });

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: { fromConnectionString: (...args: unknown[]) => fromConnectionString(...args) },
}));

describe('BlobStorageService.deleteByUrl', () => {
  let service: BlobStorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    deleteIfExists.mockResolvedValue(undefined);
    getBlockBlobClient.mockReturnValue({ deleteIfExists });
    getContainerClient.mockReturnValue({ url: 'https://blob.test/container', getBlockBlobClient });
    fromConnectionString.mockReturnValue({ getContainerClient });
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.AZURE_STORAGE_CONTAINER = 'container';
    service = new BlobStorageService();
  });

  it('deletes the blob addressed by a URL that lives inside our own container', async () => {
    await service.deleteByUrl('https://blob.test/container/webcam-snapshots/a.jpg');

    expect(getBlockBlobClient).toHaveBeenCalledWith('webcam-snapshots/a.jpg');
    expect(deleteIfExists).toHaveBeenCalledTimes(1);
  });

  it('decodes a URL-encoded blob path before deleting', async () => {
    await service.deleteByUrl('https://blob.test/container/screen-captures/att%201-1.jpg');

    expect(getBlockBlobClient).toHaveBeenCalledWith('screen-captures/att 1-1.jpg');
  });

  it('rejects a URL from a different container that merely starts the same, without attempting a delete', async () => {
    // "container-2" is a different container that happens to share "container" as a string
    // prefix -- the safety property is that this must never be treated as ours.
    await service.deleteByUrl('https://blob.test/container-2/webcam-snapshots/a.jpg');

    expect(getBlockBlobClient).not.toHaveBeenCalled();
    expect(deleteIfExists).not.toHaveBeenCalled();
  });
});
