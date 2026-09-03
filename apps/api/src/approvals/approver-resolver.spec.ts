import { resolveSteps, ChainStepInput } from './approver-resolver';

function makeTx(overrides: {
  users?: Record<string, { managerId?: string | null; status?: string }>;
  jobs?: Record<string, { hiringManagerId?: string | null }>;
  offers?: Record<string, { pipelineEntry: { jobId: string } | null }>;
} = {}) {
  const users = overrides.users ?? {};
  const jobs = overrides.jobs ?? {};
  const offers = overrides.offers ?? {};

  return {
    user: {
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const u = users[id];
        if (!u) return null;
        return { managerId: u.managerId ?? null };
      }),
      findMany: jest.fn(async ({ where: { id: { in: ids }, status } }: { where: { id: { in: string[] }; status: string } }) => {
        return ids
          .filter((id) => users[id] && (users[id].status ?? 'active') === status)
          .map((id) => ({ id }));
      }),
    },
    job: {
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const j = jobs[id];
        if (!j) return null;
        return { hiringManagerId: j.hiringManagerId ?? null };
      }),
    },
    offer: {
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const o = offers[id];
        if (!o) return null;
        return { pipelineEntry: o.pipelineEntry };
      }),
    },
  };
}

function usersStep(overrides: Partial<ChainStepInput> = {}): ChainStepInput {
  return {
    position: 0,
    name: 'Users step',
    approverType: 'users',
    approverUserIds: [],
    managerLevel: null,
    ...overrides,
  };
}

describe('resolveSteps', () => {
  it("passes users steps through, dropping deactivated users", async () => {
    const tx = makeTx({
      users: {
        u1: { status: 'active' },
        u2: { status: 'deactivated' },
        u3: { status: 'active' },
      },
    });
    const step = usersStep({ approverUserIds: ['u1', 'u2', 'u3'] });

    const { resolved, skipped } = await resolveSteps(tx, {
      steps: [step],
      submitterUserId: 'submitter',
      gate: 'requisition',
      subjectId: 'job-1',
    });

    expect(skipped).toEqual([]);
    expect(resolved).toEqual([
      { position: 0, name: 'Users step', approverType: 'users', approverUserIds: ['u1', 'u3'] },
    ]);
  });

  it("resolves reporting_manager level 1 to the submitter's manager", async () => {
    const tx = makeTx({
      users: {
        submitter: { managerId: 'mgr1' },
        mgr1: { managerId: 'mgr2', status: 'active' },
      },
    });
    const step: ChainStepInput = {
      position: 0,
      name: 'Manager approval',
      approverType: 'reporting_manager',
      approverUserIds: [],
      managerLevel: 1,
    };

    const { resolved, skipped } = await resolveSteps(tx, {
      steps: [step],
      submitterUserId: 'submitter',
      gate: 'requisition',
      subjectId: 'job-1',
    });

    expect(skipped).toEqual([]);
    expect(resolved).toEqual([
      { position: 0, name: 'Manager approval', approverType: 'reporting_manager', approverUserIds: ['mgr1'] },
    ]);
  });

  it('resolves reporting_manager level 2 up two hops', async () => {
    const tx = makeTx({
      users: {
        submitter: { managerId: 'mgr1' },
        mgr1: { managerId: 'mgr2' },
        mgr2: { managerId: 'mgr3', status: 'active' },
      },
    });
    const step: ChainStepInput = {
      position: 0,
      name: 'Skip-level approval',
      approverType: 'reporting_manager',
      approverUserIds: [],
      managerLevel: 2,
    };

    const { resolved, skipped } = await resolveSteps(tx, {
      steps: [step],
      submitterUserId: 'submitter',
      gate: 'requisition',
      subjectId: 'job-1',
    });

    expect(skipped).toEqual([]);
    expect(resolved).toEqual([
      { position: 0, name: 'Skip-level approval', approverType: 'reporting_manager', approverUserIds: ['mgr2'] },
    ]);
  });

  it('resolves hiring_manager for the requisition gate from job.hiringManagerId', async () => {
    const tx = makeTx({
      users: { hm1: { status: 'active' } },
      jobs: { 'job-1': { hiringManagerId: 'hm1' } },
    });
    const step: ChainStepInput = {
      position: 0,
      name: 'Hiring manager approval',
      approverType: 'hiring_manager',
      approverUserIds: [],
      managerLevel: null,
    };

    const { resolved, skipped } = await resolveSteps(tx, {
      steps: [step],
      submitterUserId: 'submitter',
      gate: 'requisition',
      subjectId: 'job-1',
    });

    expect(skipped).toEqual([]);
    expect(resolved).toEqual([
      { position: 0, name: 'Hiring manager approval', approverType: 'hiring_manager', approverUserIds: ['hm1'] },
    ]);
    expect(tx.job.findUnique).toHaveBeenCalledWith({ where: { id: 'job-1' }, select: { hiringManagerId: true } });
  });

  it('resolves hiring_manager for the offer gate via offer -> entry -> job', async () => {
    const tx = makeTx({
      users: { hm2: { status: 'active' } },
      jobs: { 'job-2': { hiringManagerId: 'hm2' } },
      offers: { 'offer-1': { pipelineEntry: { jobId: 'job-2' } } },
    });
    const step: ChainStepInput = {
      position: 0,
      name: 'Hiring manager approval',
      approverType: 'hiring_manager',
      approverUserIds: [],
      managerLevel: null,
    };

    const { resolved, skipped } = await resolveSteps(tx, {
      steps: [step],
      submitterUserId: 'submitter',
      gate: 'offer',
      subjectId: 'offer-1',
    });

    expect(skipped).toEqual([]);
    expect(resolved).toEqual([
      { position: 0, name: 'Hiring manager approval', approverType: 'hiring_manager', approverUserIds: ['hm2'] },
    ]);
    expect(tx.offer.findUnique).toHaveBeenCalledWith({
      where: { id: 'offer-1' },
      select: { pipelineEntry: { select: { jobId: true } } },
    });
    expect(tx.job.findUnique).toHaveBeenCalledWith({ where: { id: 'job-2' }, select: { hiringManagerId: true } });
  });

  it('skips a step (with reason) when a manager is not set', async () => {
    const tx = makeTx({
      users: {
        submitter: { managerId: null },
      },
    });
    const step: ChainStepInput = {
      position: 0,
      name: 'Manager approval',
      approverType: 'reporting_manager',
      approverUserIds: [],
      managerLevel: 1,
    };

    const { resolved, skipped } = await resolveSteps(tx, {
      steps: [step],
      submitterUserId: 'submitter',
      gate: 'requisition',
      subjectId: 'job-1',
    });

    expect(resolved).toEqual([]);
    expect(skipped).toEqual([
      { position: 0, reason: 'No approver resolved for step "Manager approval" (reporting_manager)' },
    ]);
  });
});
