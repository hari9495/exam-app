import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_BY_KEY } from './notification-types';

describe('notification catalog', () => {
  it('is exactly the set of types emitted by notify() call sites', () => {
    const keys = NOTIFICATION_TYPES.map((t) => t.type);
    const expected = [
      'mention',
      'assigned',
      'approval.requested',
      'approval.approved',
      'approval.rejected',
      'approval.step_skipped',
      'approval.cancelled',
    ];
    for (const k of expected) expect(keys).toContain(k);
    expect(NOTIFICATION_TYPES.length).toBe(expected.length);
  });
  it('has no duplicate types and only valid groups', () => {
    const keys = NOTIFICATION_TYPES.map((t) => t.type);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of NOTIFICATION_TYPES) expect(['mentions', 'assignments', 'approvals']).toContain(t.group);
  });
  it('indexes by key', () => {
    expect(NOTIFICATION_TYPE_BY_KEY.get('mention')?.group).toBe('mentions');
  });
});
