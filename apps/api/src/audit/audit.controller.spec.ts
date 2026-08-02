import { AuditController } from './audit.controller';

describe('AuditController', () => {
  let controller: AuditController;
  let auditQuery: { list: jest.Mock; count: jest.Mock; listForExport: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  // Plain instantiation, not Test.createTestingModule: this codebase's convention
  // is service-level unit tests, not controller-level ones through Nest's DI --
  // AuditController is a plain class with constructor injection, so `new` is
  // sufficient and avoids needing to satisfy the class-level @UseGuards(...)
  // guards' own dependencies (JwtAuthGuard/PermissionsGuard), which are only
  // resolved at real request time, not by this unit test.
  beforeEach(() => {
    auditQuery = { list: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), listForExport: jest.fn().mockResolvedValue([]) };
    controller = new AuditController(auditQuery as never);
  });

  it('returns data and total together, counting the whole filtered set (not just the current page)', async () => {
    const entries = [{ id: 'log-1' }];
    auditQuery.list.mockResolvedValue(entries);
    auditQuery.count.mockResolvedValue(340);

    const result = await controller.list(context, 'exam', 'exam-1', 'user-1', 'exam.published', '2026-01-01', '2026-01-31', '20', 'cursor-1', 'change');

    expect(result).toEqual({ data: entries, total: 340 });
    expect(auditQuery.list).toHaveBeenCalledWith(context, {
      entityType: 'exam', entityId: 'exam-1', actorUserId: 'user-1', action: 'exam.published',
      from: '2026-01-01', to: '2026-01-31', limit: 20, cursor: 'cursor-1', category: 'change',
    });
  });

  it('counts the full filtered set by dropping the cursor -- a "Load more" page must not shrink the total', async () => {
    await controller.list(context, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'cursor-1', undefined);

    expect(auditQuery.count).toHaveBeenCalledWith(context, expect.objectContaining({ cursor: undefined }));
  });

  it('streams a CSV attachment from export(), honoring the same filters as list()', async () => {
    auditQuery.listForExport.mockResolvedValue([
      {
        id: 'log-1', action: 'exam.published', entityType: 'exam', entityId: 'exam-1', entityName: 'Backend Round',
        actorUserId: 'user-1', actorEmail: 'a@b.test', actorName: 'A B', actorRole: 'recruiter',
        metadata: null, createdAt: new Date('2026-01-15T00:00:00.000Z'),
      },
    ]);
    const res = { set: jest.fn() };

    const file = await controller.export(context, res as never, 'exam', 'exam-1', undefined, undefined, undefined, undefined, 'change');

    expect(auditQuery.listForExport).toHaveBeenCalledWith(context, {
      entityType: 'exam', entityId: 'exam-1', actorUserId: undefined, action: undefined,
      from: undefined, to: undefined, category: 'change',
    });
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'text/csv' }));
    const buffer = await streamableFileBuffer(file);
    expect(buffer.toString('utf-8')).toContain('exam.published');
  });
});

async function streamableFileBuffer(file: { getStream(): NodeJS.ReadableStream }): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
