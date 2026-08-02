import {
  friendlyAction,
  isAccessEvent,
  ACCESS_ACTIONS,
  formatRelativeTime,
  AUDIT_ACTION_OPTIONS,
  AUDIT_ENTITY_TYPE_OPTIONS,
} from './audit-display';

describe('isAccessEvent', () => {
  it('is true for view/session events', () => {
    expect(isAccessEvent('super_admin.org_switch_in')).toBe(true);
    expect(isAccessEvent('login.success')).toBe(true);
    expect(isAccessEvent('user.impersonate_start')).toBe(true);
  });

  it('is false for data-changing events', () => {
    expect(isAccessEvent('exam.published')).toBe(false);
    expect(isAccessEvent('candidate.erased')).toBe(false);
  });
});

describe('AUDIT_ACTION_OPTIONS', () => {
  it('includes every action from ACCESS_ACTIONS grouped under a real group name (not "Other")', () => {
    for (const action of ACCESS_ACTIONS) {
      const option = AUDIT_ACTION_OPTIONS.find((o) => o.value === action);
      expect(option).toBeDefined();
      expect(option!.group).not.toBe('Other');
    }
  });

  it('sorts by group then label, so related actions cluster together', () => {
    const groups = AUDIT_ACTION_OPTIONS.map((o) => o.group);
    const sortedGroups = [...groups].sort((a, b) => a.localeCompare(b));
    // Not a strict equality (ties within a group can appear in either order),
    // but the group sequence itself must already be sorted.
    const firstOfEachGroup: string[] = [];
    let last: string | null = null;
    for (const g of groups) {
      if (g !== last) firstOfEachGroup.push(g);
      last = g;
    }
    expect(firstOfEachGroup).toEqual([...new Set(firstOfEachGroup)].sort((a, b) => a.localeCompare(b)));
    expect(sortedGroups[0]).toBe(firstOfEachGroup[0]);
  });
});

describe('AUDIT_ENTITY_TYPE_OPTIONS', () => {
  it('covers every entity type the app actually audits against', () => {
    const values = AUDIT_ENTITY_TYPE_OPTIONS.map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['exam', 'question', 'candidate', 'invitation', 'user', 'organization']));
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-02T12:00:00.000Z');

  it('says "just now" for a timestamp within the last few seconds', () => {
    expect(formatRelativeTime('2026-08-02T11:59:58.000Z', now)).toBe('just now');
  });

  it('reports seconds for under a minute', () => {
    expect(formatRelativeTime('2026-08-02T11:59:30.000Z', now)).toBe('30s ago');
  });

  it('reports minutes, hours, and days ago as they cross each threshold', () => {
    expect(formatRelativeTime('2026-08-02T11:45:00.000Z', now)).toBe('15 minutes ago');
    expect(formatRelativeTime('2026-08-02T09:00:00.000Z', now)).toBe('3 hours ago');
    expect(formatRelativeTime('2026-07-30T12:00:00.000Z', now)).toBe('3 days ago');
  });
});

describe('friendlyAction (regression: unaffected by the Slice 6 additions)', () => {
  it('still prettifies an unknown action key as words', () => {
    expect(friendlyAction('widget.frobnicated')).toBe('Widget — frobnicated');
  });
});
