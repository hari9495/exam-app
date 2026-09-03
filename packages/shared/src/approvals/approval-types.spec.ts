import { APPROVAL_GATES, APPROVER_TYPES } from './approval-types';

describe('approval-types', () => {
  it('defines the two gates and three approver types', () => {
    expect(APPROVAL_GATES).toEqual(['requisition', 'offer']);
    expect(APPROVER_TYPES).toEqual(['users', 'reporting_manager', 'hiring_manager']);
  });
});
