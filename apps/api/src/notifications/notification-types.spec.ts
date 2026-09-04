import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_BY_KEY } from './notification-types';

describe('notification catalog', () => {
  it('covers every type emitted by notify() call sites', () => {
    const keys = NOTIFICATION_TYPES.map((t) => t.type);
    for (const k of ['mention', 'assigned', 'approval.requested', 'approval.approved', 'approval.rejected', 'approval.step_skipped']) {
      expect(keys).toContain(k);
    }
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
