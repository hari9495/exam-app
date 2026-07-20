export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResolvedPaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function resolvePaginationParams(page?: string, pageSize?: string): ResolvedPaginationParams {
  const parsedPage = page ? parseInt(page, 10) : NaN;
  const parsedPageSize = pageSize ? parseInt(pageSize, 10) : NaN;

  const resolvedPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const resolvedPageSize =
    Number.isInteger(parsedPageSize) && parsedPageSize > 0
      ? Math.min(parsedPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    skip: (resolvedPage - 1) * resolvedPageSize,
    take: resolvedPageSize,
  };
}

export function buildPaginatedResponse<T>(data: T[], total: number, page: number, pageSize: number): PaginatedResponse<T> {
  return { data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
