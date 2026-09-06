import { buildSoftDeleteQuery } from './soft-delete.extension';

// Fake `query` fn: records the args it received and echoes them back, exactly like the
// real Prisma-provided `query(args)` continuation the hooks receive.
const fakeQuery = jest.fn(async (args: any) => ({ received: args }));

describe('buildSoftDeleteQuery', () => {
  beforeEach(() => {
    fakeQuery.mockClear();
  });

  const query = buildSoftDeleteQuery();

  it('findMany merges deletedAt: null into where for a registered model', async () => {
    await query.findMany({ model: 'Candidate', operation: 'findMany', args: { where: { organizationId: 'o1' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { organizationId: 'o1', deletedAt: null } });
  });

  it('findFirst merges deletedAt: null for a registered model', async () => {
    await query.findFirst({ model: 'Candidate', operation: 'findFirst', args: { where: { id: 'c1' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { id: 'c1', deletedAt: null } });
  });

  it('findFirstOrThrow merges deletedAt: null for a registered model', async () => {
    await query.findFirstOrThrow({ model: 'Job', operation: 'findFirstOrThrow', args: { where: { id: 'j1' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { id: 'j1', deletedAt: null } });
  });

  it('count merges deletedAt: null for a registered model', async () => {
    await query.count({ model: 'Pipeline', operation: 'count', args: { where: { organizationId: 'o1' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { organizationId: 'o1', deletedAt: null } });
  });

  it('aggregate merges deletedAt: null for a registered model', async () => {
    await query.aggregate({ model: 'WalkInGroup', operation: 'aggregate', args: { where: { organizationId: 'o1' }, _count: true }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { organizationId: 'o1', deletedAt: null }, _count: true });
  });

  it('groupBy merges deletedAt: null for a registered model', async () => {
    await query.groupBy({ model: 'Candidate', operation: 'groupBy', args: { where: { organizationId: 'o1' }, by: ['status'] }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { organizationId: 'o1', deletedAt: null }, by: ['status'] });
  });

  it('update merges deletedAt: null into where for a registered model', async () => {
    await query.update({ model: 'Candidate', operation: 'update', args: { where: { id: 'c1' }, data: { name: 'x' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { id: 'c1', deletedAt: null }, data: { name: 'x' } });
  });

  it('updateMany merges deletedAt: null into where for a registered model', async () => {
    await query.updateMany({ model: 'Candidate', operation: 'updateMany', args: { where: { organizationId: 'o1' }, data: { name: 'x' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { organizationId: 'o1', deletedAt: null }, data: { name: 'x' } });
  });

  // No redirect to findFirst: Prisma has allowed combining a unique field with additional
  // non-unique filters in the same findUnique/findUniqueOrThrow `where` since 4.5 ("filter on
  // non-unique fields") -- verified against a real DB in soft-delete-for-tenant.e2e-spec.ts. So
  // findUnique just merges deletedAt: null and forwards to `query(args)`, exactly like every
  // other hook above -- no separate client reference, so nothing that can escape a transaction.
  it('findUnique on a registered model merges deletedAt: null into where and forwards to query(args) -- no redirect', async () => {
    const result = await query.findUnique({ model: 'Candidate', operation: 'findUnique', args: { where: { id: 'x' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { id: 'x', deletedAt: null } });
    expect(result).toEqual({ received: { where: { id: 'x', deletedAt: null } } });
  });

  it('findUniqueOrThrow on a registered model merges deletedAt: null into where and forwards to query(args) -- no redirect', async () => {
    await query.findUniqueOrThrow({ model: 'Candidate', operation: 'findUniqueOrThrow', args: { where: { id: 'x' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { id: 'x', deletedAt: null } });
  });

  it('a non-registered model passes args through unchanged for every op, including findUnique', async () => {
    await query.findMany({ model: 'Organization', operation: 'findMany', args: { where: { id: 'o1' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { id: 'o1' } });

    fakeQuery.mockClear();
    await query.findUnique({ model: 'Organization', operation: 'findUnique', args: { where: { id: 'o1' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { id: 'o1' } });
  });

  it('does not define hooks for create/delete/deleteMany/upsert -- they pass through untouched natively', () => {
    expect((query as any).create).toBeUndefined();
    expect((query as any).delete).toBeUndefined();
    expect((query as any).deleteMany).toBeUndefined();
    expect((query as any).upsert).toBeUndefined();
  });
});
