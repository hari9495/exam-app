import { inOrder, patternRegex, ruleFor, type MappingRuleRef } from './mapping-rules';

const at = (n: number) => new Date(Date.UTC(2026, 10, n));
const rule = (id: string, over: Partial<MappingRuleRef>): MappingRuleRef => ({ id, source: 'issues', pattern: '*', projectId: 'p1', taskId: null, priority: 1, enabled: true, createdAt: at(1), ...over });

describe('mapping rules (PRJ-08, answer 1410)', () => {
  it('a pattern is plain text with * for any text, capitals ignored, nothing else special', () => {
    expect(patternRegex('NRPWEB-*').test('nrpweb-412')).toBe(true);
    expect(patternRegex('NRPWEB-*').test('XNRPWEB-412')).toBe(false);
    expect(patternRegex('*Nilgiri*').test('Weekly review with Nilgiri Retail')).toBe(true);
    expect(patternRegex('a.b').test('axb')).toBe(false);
    expect(patternRegex('(x)+').test('(x)+')).toBe(true);
  });

  it('the lower priority wins between two matching rules; the older one on a tie; switched-off rules never apply', () => {
    const rules = inOrder([rule('late', { priority: 2, projectId: 'p2' }), rule('first', { priority: 1 }), rule('off', { priority: 0, enabled: false }), rule('tieNew', { priority: 1, createdAt: at(5) })]);
    expect(rules.map((r) => r.id)).toEqual(['first', 'tieNew', 'late']);
    expect(ruleFor(rules, 'issues', ['NRPWEB-1'], () => true)!.id).toBe('first');
  });

  it('a rule whose project is not allowed (closed, or the person not allocated) is skipped for the next one', () => {
    const rules = inOrder([rule('closed', { priority: 1, projectId: 'gone' }), rule('next', { priority: 2, projectId: 'p2' })]);
    expect(ruleFor(rules, 'issues', ['X'], (p) => p !== 'gone')!.id).toBe('next');
    expect(ruleFor(rules, 'issues', ['X'], () => false)).toBeNull();
  });

  it('only rules for the item’s tool; any of the item’s texts may match; no text, no rule', () => {
    const rules = inOrder([rule('cal', { source: 'calendar', pattern: '*stand-up*' })]);
    expect(ruleFor(rules, 'issues', ['Team stand-up'], () => true)).toBeNull();
    expect(ruleFor(rules, 'calendar', [null, 'Calendar: "Team stand-up"'], () => true)!.id).toBe('cal');
    expect(ruleFor(rules, 'calendar', [null, '  '], () => true)).toBeNull();
  });
});
