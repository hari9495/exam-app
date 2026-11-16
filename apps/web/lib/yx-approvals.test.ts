import { PROFILE_CHANGE, profileRows } from './yx-approvals';

// Keka ideas (2026-11): identity and bank changes in the approvals inbox, under their own kind.
describe('profileRows', () => {
  const base = { employeeId: 'e1', employeeName: 'Anita Desai', kind: 'bank', label: 'Bank account', proposed: {}, current: null, reason: 'New salary account', requestedBy: 'Anita Desai', requestedAt: '2026-11-15T09:00:00.000Z', decidedBy: null, decidedAt: null, decisionNote: null, overrideReason: null, proofDocumentId: null, effectiveOn: null, usableFrom: null } as const;

  it('a pending change someone else raised waits under "Profile change" and opens its own page to decide', () => {
    const [row] = profileRows([{ ...base, id: 'p1', status: 'pending', mine: false }]);
    expect(row).toMatchObject({ id: 'profile:p1', type: PROFILE_CHANGE, requester: 'Anita Desai', summary: 'Bank account change', decideAt: '/yx/people/profile-requests', status: 'Waiting', lowRisk: false });
    expect(row!.context).toContain('Reason: New salary account');
  });

  it('negative: my own change, or one already decided, is not in my inbox', () => {
    expect(profileRows([{ ...base, id: 'p2', status: 'pending', mine: true }, { ...base, id: 'p3', status: 'approved', mine: false }])).toEqual([]);
  });
});
