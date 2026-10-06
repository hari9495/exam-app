import { SamlCacheProvider } from './saml-cache.provider';

describe('SamlCacheProvider', () => {
  let redis: { set: jest.Mock; get: jest.Mock; getdel: jest.Mock };
  let provider: SamlCacheProvider;

  beforeEach(() => {
    redis = { set: jest.fn().mockResolvedValue('OK'), get: jest.fn(), getdel: jest.fn() };
    provider = new SamlCacheProvider(redis as any);
  });

  it('stores a request ID per provider, with a TTL and the device that started the sign-in', async () => {
    const result = await provider.forRequest('idp-1', 'device-hash').saveAsync('req-id-1', 'instant');

    expect(redis.set).toHaveBeenCalledWith('saml:inresponseto:idp-1:req-id-1', JSON.stringify({ v: 'instant', d: 'device-hash' }), 'EX', expect.any(Number));
    expect(result).toEqual(expect.objectContaining({ value: 'instant' }));
  });

  it('getAsync returns node-saml its own value, or null', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ v: 'instant', d: null })).mockResolvedValueOnce(null);
    const cache = provider.forRequest('idp-1');

    expect(await cache.getAsync('req-id-1')).toBe('instant');
    expect(await cache.getAsync('req-id-2')).toBeNull();
    expect(redis.get).toHaveBeenNthCalledWith(1, 'saml:inresponseto:idp-1:req-id-1');
  });

  it('a request ID of one provider means nothing to another (scoped keys)', async () => {
    redis.get.mockResolvedValue(null);
    await provider.forRequest('idp-2').getAsync('req-id-1');
    expect(redis.get).toHaveBeenCalledWith('saml:inresponseto:idp-2:req-id-1');
  });

  it('removeAsync consumes atomically (GETDEL) and hands over the device it was started from', async () => {
    redis.getdel.mockResolvedValue(JSON.stringify({ v: 'instant', d: 'device-hash' }));
    const onConsume = jest.fn();

    expect(await provider.forRequest('idp-1', null, onConsume).removeAsync('req-id-1')).toBe('instant');
    expect(redis.getdel).toHaveBeenCalledWith('saml:inresponseto:idp-1:req-id-1');
    expect(onConsume).toHaveBeenCalledWith('device-hash');
  });

  // Regression: GET-then-DEL let two concurrent POSTs of one captured response both pass. node-saml
  // ignores removeAsync's return value, so the loser must throw to be rejected.
  it('a second consumption of the same request ID throws (replay of a captured response)', async () => {
    redis.getdel.mockResolvedValueOnce(JSON.stringify({ v: 'instant', d: null })).mockResolvedValueOnce(null);
    const cache = provider.forRequest('idp-1');

    await expect(cache.removeAsync('req-id-1')).resolves.toBe('instant');
    await expect(cache.removeAsync('req-id-1')).rejects.toThrow('already used');
  });
});
