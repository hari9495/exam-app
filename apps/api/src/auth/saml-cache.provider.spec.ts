import { SamlCacheProvider } from './saml-cache.provider';

describe('SamlCacheProvider', () => {
  let redis: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let provider: SamlCacheProvider;

  beforeEach(() => {
    redis = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
    provider = new SamlCacheProvider(redis as any);
  });

  it('saveAsync stores the value with a TTL and returns a CacheItem shape', async () => {
    redis.set.mockResolvedValue('OK');

    const result = await provider.saveAsync('req-id-1', 'some-value');

    expect(redis.set).toHaveBeenCalledWith('saml:inresponseto:req-id-1', 'some-value', 'EX', expect.any(Number));
    expect(result).toEqual(expect.objectContaining({ value: 'some-value' }));
  });

  it('getAsync returns the stored value or null', async () => {
    redis.get.mockResolvedValueOnce('some-value').mockResolvedValueOnce(null);

    expect(await provider.getAsync('req-id-1')).toBe('some-value');
    expect(await provider.getAsync('req-id-2')).toBeNull();
    expect(redis.get).toHaveBeenNthCalledWith(1, 'saml:inresponseto:req-id-1');
  });

  it('removeAsync deletes the key and returns the removed value', async () => {
    redis.get.mockResolvedValue('some-value');
    redis.del.mockResolvedValue(1);

    const result = await provider.removeAsync('req-id-1');

    expect(redis.del).toHaveBeenCalledWith('saml:inresponseto:req-id-1');
    expect(result).toBe('some-value');
  });
});
