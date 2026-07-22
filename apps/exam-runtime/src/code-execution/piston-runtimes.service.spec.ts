import { Test } from '@nestjs/testing';
import { PistonRuntimesService } from './piston-runtimes.service';
import { PistonClient } from './piston-client';

describe('PistonRuntimesService', () => {
  let service: PistonRuntimesService;
  let pistonClient: { listRuntimes: jest.Mock };

  beforeEach(async () => {
    pistonClient = { listRuntimes: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [PistonRuntimesService, { provide: PistonClient, useValue: pistonClient }],
    }).compile();
    service = moduleRef.get(PistonRuntimesService);
  });

  it('fetches and dedupes to the newest version per language on first call', async () => {
    pistonClient.listRuntimes.mockResolvedValue([
      { language: 'python', version: '2.7.16', aliases: [] },
      { language: 'python', version: '3.10.0', aliases: [] },
      { language: 'javascript', version: '18.15.0', aliases: ['node'] },
    ]);

    const result = await service.getAvailableLanguages();

    expect(result).toEqual(
      expect.arrayContaining([
        { language: 'python', version: '3.10.0' },
        { language: 'javascript', version: '18.15.0' },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('serves the cached result on a second call within the TTL without refetching', async () => {
    pistonClient.listRuntimes.mockResolvedValue([{ language: 'python', version: '3.10.0', aliases: [] }]);

    await service.getAvailableLanguages();
    await service.getAvailableLanguages();

    expect(pistonClient.listRuntimes).toHaveBeenCalledTimes(1);
  });

  it('serves a stale cache instead of throwing if a refresh fails after the cache already has data', async () => {
    pistonClient.listRuntimes.mockResolvedValueOnce([{ language: 'python', version: '3.10.0', aliases: [] }]);
    await service.getAvailableLanguages();

    pistonClient.listRuntimes.mockRejectedValueOnce(new Error('Piston unreachable'));
    // Force a refresh by resetting the internal clock — simplest way without a fake timer here
    // is to call the private cache-buster the class exposes for tests via a short TTL override.
    (service as unknown as { ttlMs: number }).ttlMs = 0;

    const result = await service.getAvailableLanguages();

    expect(result).toEqual([{ language: 'python', version: '3.10.0' }]);
  });

  it('throws if the very first fetch fails with no cache to fall back on', async () => {
    pistonClient.listRuntimes.mockRejectedValue(new Error('Piston unreachable'));

    await expect(service.getAvailableLanguages()).rejects.toThrow('Piston unreachable');
  });

  it('resolveLanguage returns the matching entry for a known language', async () => {
    pistonClient.listRuntimes.mockResolvedValue([{ language: 'python', version: '3.10.0', aliases: [] }]);

    const result = await service.resolveLanguage('python');

    expect(result).toEqual({ language: 'python', version: '3.10.0' });
  });

  it('resolveLanguage returns null for an unknown language', async () => {
    pistonClient.listRuntimes.mockResolvedValue([{ language: 'python', version: '3.10.0', aliases: [] }]);

    const result = await service.resolveLanguage('cobol');

    expect(result).toBeNull();
  });
});
