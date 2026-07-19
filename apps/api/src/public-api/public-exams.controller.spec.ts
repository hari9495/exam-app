import { PublicExamsController } from './public-exams.controller';

describe('PublicExamsController', () => {
  it('coerces string query.page/pageSize to numbers before calling the service', () => {
    const publicApiService = { listExams: jest.fn() };
    const controller = new PublicExamsController(publicApiService as any);
    const tenant = { organizationId: 'org-1', isSuperAdmin: false };

    // Query params arrive as strings when the global ValidationPipe isn't run with transform: true.
    controller.list(tenant as any, { page: '2', pageSize: '20' } as any);

    expect(publicApiService.listExams).toHaveBeenCalledWith(tenant, 2, 20);
  });
});
