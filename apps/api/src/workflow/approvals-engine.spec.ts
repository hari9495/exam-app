import { RuleError } from '../rules-engine/conditions';
import { needOf, parseSteps, verdict } from './approvals-engine.service';

describe('P03 quorum (US-G-044)', () => {
  it('any one, all, at least N and a percentage', () => {
    expect(needOf({ mode: 'any' }, 3)).toBe(1);
    expect(needOf({ mode: 'all' }, 3)).toBe(3);
    expect(needOf({ mode: 'count', count: 2 }, 3)).toBe(2);
    expect(needOf({ mode: 'count', count: 5 }, 3)).toBe(3);
    expect(needOf({ mode: 'percent', percent: 50 }, 3)).toBe(2);
    expect(needOf({ mode: 'percent', percent: 1 }, 3)).toBe(1);
  });

  it('one reject stops the step by default; "quorum lost" waits until the quorum cannot be reached', () => {
    expect(verdict({ need: 2 }, 3, 1, 1)).toBe('rejected');
    expect(verdict({ need: 2, rejectOn: 'quorum_lost' }, 3, 1, 1)).toBe('open');
    expect(verdict({ need: 2, rejectOn: 'quorum_lost' }, 3, 0, 2)).toBe('rejected');
    expect(verdict({ need: 2, rejectOn: 'quorum_lost' }, 3, 2, 1)).toBe('approved');
    expect(verdict({ need: 3 }, 3, 2, 0)).toBe('open');
  });
});

describe('P03 steps are data, checked at save', () => {
  const fields = [{ key: 'cc', label: 'Cost centre', type: 'choice' as const }, { key: 'total_cost', label: 'Total', type: 'money' as const }];
  it('accepts managers, cost-centre owners, people and groups with quorum, reminders, timeouts and a skip rule', () => {
    const s = parseSteps(
      [
        { name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate' },
        { name: 'Finance', approvers: [{ kind: 'cost_centre_owner', field: 'cc' }], mode: 'percent', percent: 60, skipIf: { id: 'g', join: 'and', items: [{ id: 'c', field: 'total_cost', operator: 'lt', value: 5000 }] } },
      ],
      fields,
    );
    expect(s[0].approvers).toEqual([{ kind: 'manager', level: 1 }]);
    expect(s[1].skipIf?.items).toHaveLength(1);
  });

  it.each([
    ['no approvers', [{ name: 'X', approvers: [], mode: 'any' }]],
    ['a manager six levels up', [{ name: 'X', approvers: [{ kind: 'manager', level: 6 }], mode: 'any' }]],
    ['a cost centre from a missing field', [{ name: 'X', approvers: [{ kind: 'cost_centre_owner', field: 'nope' }], mode: 'any' }]],
    ['a timeout action without hours', [{ name: 'X', approvers: [{ kind: 'manager' }], mode: 'any', onTimeout: 'approve' }]],
    ['an unknown part', [{ name: 'X', approvers: [{ kind: 'manager' }], mode: 'any', run: 'code' }]],
    ['seven steps', Array.from({ length: 7 }, (_, i) => ({ name: `S${i}`, approvers: [{ kind: 'manager' }], mode: 'any' }))],
  ])('refuses %s', (_w, input) => {
    expect(() => parseSteps(input, fields)).toThrow(RuleError);
  });
});
