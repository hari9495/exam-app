import { PublicCandidatesController } from './public-candidates.controller';

describe('PublicCandidatesController', () => {
  it('coerces string query.page/pageSize to numbers before calling the service', () => {
    const publicApiService = { listCandidates: jest.fn() };
    const controller = new PublicCandidatesController(publicApiService as any);
    const tenant = { organizationId: 'org-1', isSuperAdmin: false };

    // Query params arrive as strings when the global ValidationPipe isn't run with transform: true.
    controller.list(tenant as any, { page: '2', pageSize: '20' } as any);

    expect(publicApiService.listCandidates).toHaveBeenCalledWith(tenant, 2, 20);
  });
});
