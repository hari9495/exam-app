import { coachNudges, coachWeekOf, escalateBy, evidenceHash, spreadFlags, stableJson, suggestedAgenda, wordingFlags, type CoachSignals } from './b3-rules';
import { withoutNames } from './review-draft.client';

describe('PRF-17 wording check', () => {
  it('flags loaded, personality, age and vague words with the words as written', () => {
    const f = wordingFlags('She was Emotional in reviews, has an attitude, is young for the role. Good job overall.', 3);
    expect(f.map((x) => [x.kind, x.match])).toEqual([
      ['Gendered or loaded word', 'Emotional'],
      ['Personality, not behaviour', 'attitude'],
      ['Age reference', 'young'],
      ['Vague, no example', 'Good job'],
    ]);
  });

  it('matches whole words only ("late" is not inside "translate")', () => {
    expect(wordingFlags('Translated the manual and escalated the plant issue.', 5)).toEqual([]);
  });

  it('nothing to flag in a factual summary', () => {
    expect(wordingFlags('Automated 310 of 400 cases, cutting line stops for testing to zero in August.', 4)).toEqual([]);
  });

  it('rating and text disagree: a top rating with two or more misses; not below the top two levels', () => {
    const text = 'Missed the March release and was late on two audits.';
    expect(wordingFlags(text, 4, 5).map((x) => x.kind)).toEqual(['Rating and text disagree']);
    expect(wordingFlags(text, 3, 5)).toEqual([]);
    expect(wordingFlags(text, null, 5)).toEqual([]);
    expect(wordingFlags('Missed one deadline.', 5, 5)).toEqual([]);
  });
});

describe('PRF-17 rating spread against peers', () => {
  it('all the same, from three ratings', () => {
    expect(spreadFlags([3, 3], [])).toEqual([]);
    expect(spreadFlags([3, 3, 3], []).map((x) => x.match)).toEqual(['All 3 of your ratings this cycle are 3.00']);
  });

  it('average far from the company, only with five or more on both sides', () => {
    const company = [3, 3, 3.2, 2.8, 3, 3, 3.1];
    expect(spreadFlags([4, 4.5, 4, 4.2], company)).toEqual([]);
    const f = spreadFlags([4, 4.5, 4, 4.2, 4.1], company);
    expect(f).toHaveLength(1);
    expect(f[0].match).toBe('Your average 4.16; company average 3.01');
    expect(f[0].suggestion).toMatch(/above/);
    // 0.74 below the gap: no flag.
    expect(spreadFlags([3.75, 3.75, 3.75, 3.74, 3.76], [3, 3, 3, 3, 3])).toHaveLength(1);
    expect(spreadFlags([3.7, 3.74, 3.74, 3.74, 3.78], [3, 3, 3, 3, 3])).toEqual([]);
  });
});

describe('PRF-16 coach', () => {
  const base: CoachSignals = { employeeId: 'e1', name: 'Meera Iyer', feedbackDays: 10, lastOneOnOneDays: 10, plannedOverdueDays: 0, goalsOff: [] };

  it('no nudge when feedback, 1:1s and goals are up to date', () => {
    expect(coachNudges([base])).toEqual([]);
  });

  it('6 weeks without feedback is the limit; one nudge per person names every signal', () => {
    expect(coachNudges([{ ...base, feedbackDays: 41 }])).toEqual([]);
    const [n] = coachNudges([{ ...base, feedbackDays: 56, plannedOverdueDays: 21 }]);
    expect(n).toMatchObject({ person: 'Meera Iyer', signal: 'No feedback from you in 8 weeks. 1:1 overdue by 21 days.', action: 'Give feedback', key: 'e1:fb+1on1' });
  });

  it('a 1:1 more than 35 days ago, or never held', () => {
    expect(coachNudges([{ ...base, lastOneOnOneDays: 35 }])).toEqual([]);
    expect(coachNudges([{ ...base, lastOneOnOneDays: 36 }])[0].signal).toBe('Last 1:1 was 36 days ago.');
    expect(coachNudges([{ ...base, lastOneOnOneDays: null }])[0]).toMatchObject({ signal: 'No 1:1 held yet.', action: 'Book 1:1' });
  });

  it('goals off track or at risk link to the goal', () => {
    const [n] = coachNudges([{ ...base, goalsOff: [{ id: 'g1', title: 'Mentor two new QA engineers', confidence: 'at_risk' }, { id: 'g2', title: 'B', confidence: 'off_track' }] }]);
    expect(n).toMatchObject({ signal: 'Goal “Mentor two new QA engineers” is at risk (and 1 more).', action: 'View goal', link: '/yx/performance/goals/g1' });
  });

  it('week of: Monday; fortnightly from Monday 1 Jan 2024', () => {
    expect(coachWeekOf('2026-11-03', 'weekly')).toBe('2026-11-02');
    expect(coachWeekOf('2026-11-08', 'weekly')).toBe('2026-11-02');
    expect(coachWeekOf('2026-11-09', 'weekly')).toBe('2026-11-09');
    expect(coachWeekOf('2024-01-08', 'fortnightly')).toBe('2024-01-01');
    expect(coachWeekOf('2024-01-15', 'fortnightly')).toBe('2024-01-15');
  });

  it('suggested agenda: goals, open actions, praise from two colleagues', () => {
    const s = suggestedAgenda({ goalsOff: [{ id: 'g', title: 'Reduce rejects', confidence: 'off_track', since: '2026-09-12' }], openActions: [{ id: 'a', text: 'August reject data by batch', dueOn: '2026-09-30' }], praiseCount: 1 });
    expect(s.map((x) => x.id)).toEqual(['goal:g', 'action:a']);
    expect(s[0].why).toBe('Goal is off track since 2026-09-12');
    expect(suggestedAgenda({ goalsOff: [], openActions: [], praiseCount: 2 }).map((x) => x.id)).toEqual(['praise']);
  });
});

describe('PRF-15 disputes', () => {
  it('escalation window is inclusive of the last day', () => {
    expect(escalateBy('2026-10-21', 15)).toBe('2026-11-05');
    expect(escalateBy('2028-02-20', 15)).toBe('2028-03-06');
  });

  it('the same evidence always has the same hash, whatever the key order', () => {
    expect(stableJson({ b: 1, a: [2, { d: null, c: 'x' }] })).toBe('{"a":[2,{"c":"x","d":null}],"b":1}');
    expect(evidenceHash({ a: 1, b: 2 })).toBe(evidenceHash({ b: 2, a: 1 }));
    expect(evidenceHash({ a: 1 })).not.toBe(evidenceHash({ a: 2 }));
    expect(evidenceHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('PRF-17 names never go to the AI model', () => {
  it('replaces the person’s names, whole words, any case', () => {
    expect(withoutNames('Divya led it; divya’s team and Raghunathan agreed. Divyansh helped.', ['Divya', 'Raghunathan'])).toBe('the employee led it; the employee’s team and the employee agreed. Divyansh helped.');
  });
});
