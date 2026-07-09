import { resolveInternalBindHost } from './bootstrap-config';

describe('resolveInternalBindHost', () => {
  it('defaults to 127.0.0.1 when EXAM_RUNTIME_INTERNAL_HOST is unset', () => {
    expect(resolveInternalBindHost({})).toBe('127.0.0.1');
  });

  it('uses EXAM_RUNTIME_INTERNAL_HOST when set', () => {
    expect(resolveInternalBindHost({ EXAM_RUNTIME_INTERNAL_HOST: '10.0.0.5' })).toBe('10.0.0.5');
  });
});
