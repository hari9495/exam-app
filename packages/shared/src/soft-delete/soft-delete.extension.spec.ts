import { buildSoftDeleteQuery } from './soft-delete.extension';

// Fake `query` fn: records the args it received and echoes them back, exactly like the
// real Prisma-provided `query(args)` continuation the hooks receive.
const fakeQuery = jest.fn(async (args: any) => ({ received: args }));

describe('buildSoftDeleteQuery', () => {
  const client = {
    candidate: { findFirst: jest.fn(async (args: any) => ({ redirected: args })), findFirstOrThrow: jest.fn(async (args: any) => ({ redirected: args })) },
  };

  beforeEach(() => {
    fakeQuery.mockClear();
    client.candidate.findFirst.mockClear();
    client.candidate.findFirstOrThrow.mockClear();
  });

  const query = buildSoftDeleteQuery(client as any);

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

  it('findUnique on a registered model is redirected to findFirst on the model delegate, with deletedAt: null merged in', async () => {
    const result = await query.findUnique({ model: 'Candidate', operation: 'findUnique', args: { where: { id: 'x' } }, query: fakeQuery });
    expect(fakeQuery).not.toHaveBeenCalled();
    expect(client.candidate.findFirst).toHaveBeenCalledWith({ where: { id: 'x', deletedAt: null } });
    expect(result).toEqual({ redirected: { where: { id: 'x', deletedAt: null } } });
  });

  it('findUniqueOrThrow on a registered model is redirected to findFirstOrThrow on the model delegate, with deletedAt: null merged in', async () => {
    await query.findUniqueOrThrow({ model: 'Candidate', operation: 'findUniqueOrThrow', args: { where: { id: 'x' } }, query: fakeQuery });
    expect(fakeQuery).not.toHaveBeenCalled();
    expect(client.candidate.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: 'x', deletedAt: null } });
  });

  it('a non-registered model passes args through unchanged for every op, including findUnique (no redirect)', async () => {
    await query.findMany({ model: 'Organization', operation: 'findMany', args: { where: { id: 'o1' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { id: 'o1' } });

    fakeQuery.mockClear();
    await query.findUnique({ model: 'Organization', operation: 'findUnique', args: { where: { id: 'o1' } }, query: fakeQuery });
    expect(fakeQuery).toHaveBeenCalledWith({ where: { id: 'o1' } });
    expect(client.candidate.findFirst).not.toHaveBeenCalled();
  });

  it('does not define hooks for create/delete/deleteMany/upsert -- they pass through untouched natively', () => {
    expect((query as any).create).toBeUndefined();
    expect((query as any).delete).toBeUndefined();
    expect((query as any).deleteMany).toBeUndefined();
    expect((query as any).upsert).toBeUndefined();
  });
});
