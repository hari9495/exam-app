import { resolvePaginationParams, buildPaginatedResponse } from './paginated-response';

describe('resolvePaginationParams', () => {
  it('defaults to page 1, pageSize 20 when neither is provided', () => {
    expect(resolvePaginationParams(undefined, undefined)).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
  });

  it('computes skip from page and pageSize', () => {
    expect(resolvePaginationParams('3', '10')).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
  });

  it('caps pageSize at 100', () => {
    expect(resolvePaginationParams('1', '500')).toEqual({ page: 1, pageSize: 100, skip: 0, take: 100 });
  });

  it('falls back to defaults for invalid (non-positive, non-integer) values', () => {
    expect(resolvePaginationParams('0', '-5')).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(resolvePaginationParams('abc', 'xyz')).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
  });
});

describe('buildPaginatedResponse', () => {
  it('computes totalPages from total and pageSize, rounding up', () => {
    expect(buildPaginatedResponse(['a', 'b'], 45, 1, 20)).toEqual({
      data: ['a', 'b'],
      total: 45,
      page: 1,
      pageSize: 20,
      totalPages: 3,
    });
  });

  it('reports totalPages as at least 1 even when total is 0', () => {
    expect(buildPaginatedResponse([], 0, 1, 20).totalPages).toBe(1);
  });
});
