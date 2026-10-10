import { addDays, checkTemplateTasks, contentConfig, daysBetween, dueOn, firstThirtyBuckets, openable, progress, surveyAnswers, type TaskLike } from './journey-rules';

const t = (key: string, o: Partial<TaskLike> = {}): TaskLike => ({ key, dueOffsetDays: 0, dependsOn: [], required: true, status: 'open', ...o });

describe('journey rules (YX-LC-02 / 13)', () => {
  it('due dates come from the anchor, before day one allowed (U49)', () => {
    expect(dueOn('2026-10-15', -7)).toBe('2026-10-08');
    expect(dueOn('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('postponing 1 Oct → 15 Oct moves a −7 task from 24 Sep to 8 Oct', () => {
    const delta = daysBetween('2026-10-01', '2026-10-15');
    expect(addDays(dueOn('2026-10-01', -7), delta)).toBe('2026-10-08');
  });

  it('a task waits until what it depends on is finished', () => {
    const s = openable([t('a', { status: 'open' }), t('b', { status: 'waiting', dependsOn: ['a'] })]);
    expect(s.get('b')).toBe('waiting');
    expect(openable([t('a', { status: 'done' }), t('b', { status: 'waiting', dependsOn: ['a'] })]).get('b')).toBe('open');
    expect(openable([t('a', { status: 'skipped' }), t('b', { status: 'waiting', dependsOn: ['a'] })]).get('b')).toBe('open');
  });

  it('progress counts required tasks only', () => {
    expect(progress([t('a', { status: 'done' }), t('b'), t('c', { required: false, status: 'open' })])).toBe(50);
    expect(progress([])).toBe(100);
  });

  it('template checks: unique keys, earlier dependencies only, offsets in range', () => {
    expect(checkTemplateTasks([t('a'), t('a')])).toMatch(/Two tasks/);
    expect(checkTemplateTasks([t('a', { dependsOn: ['b'] }), t('b')])).toMatch(/listed above/);
    expect(checkTemplateTasks([t('a', { dueOffsetDays: -91 })])).toMatch(/90 days/);
    expect(checkTemplateTasks([t('Bad')])).toMatch(/lower-case/);
    expect(checkTemplateTasks([t('a'), t('b', { dependsOn: ['a'] })])).toBeNull();
  });
});

describe('6f content steps (§5.7) and the first 30 days (§7.6)', () => {
  it('read needs text or an https link; watch needs an https link and a sane length', () => {
    expect(contentConfig('read', { text: ' Read me ' })).toEqual({ config: { text: 'Read me' } });
    expect(contentConfig('read', {})).toEqual({ problem: 'needs the text to read or a link to it' });
    expect(contentConfig('read', { url: 'http://x.test/p' })).toEqual({ problem: 'needs a link that starts with https://' });
    expect(contentConfig('read', { text: 'x'.repeat(4001) })).toEqual({ problem: 'can have at most 4,000 characters of text' });
    expect(contentConfig('watch', { url: 'javascript:alert(1)' })).toEqual({ problem: 'needs a link to the video that starts with https://' });
    expect(contentConfig('watch', { url: 'https://v.test/a', minutes: 0 })).toEqual({ problem: 'must last between 1 and 180 minutes' });
    expect(contentConfig('watch', { url: 'https://v.test/a', minutes: 12 })).toEqual({ config: { url: 'https://v.test/a', minutes: 12 } });
  });

  it('a survey has 1 to 5 statements, each rated 1 to 5', () => {
    expect(contentConfig('survey', { questions: [] })).toEqual({ problem: 'needs 1 to 5 statements to rate' });
    expect(contentConfig('survey', { questions: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual({ problem: 'needs 1 to 5 statements to rate' });
    expect(contentConfig('survey', { questions: [' Clear? ', ''] })).toEqual({ config: { questions: ['Clear?'] } });
    expect(surveyAnswers(['a', 'b'], { ratings: [5, 1], comment: ' ok ' })).toEqual({ ratings: [5, 1], comment: 'ok' });
    expect(surveyAnswers(['a', 'b'], { ratings: [5] })).toBeNull();
    expect(surveyAnswers(['a'], { ratings: [6] })).toBeNull();
    expect(surveyAnswers(['a'], { ratings: [2.5] })).toBeNull();
  });

  it('splits own steps into today (and late), this week and this month up to day 30', () => {
    const t = (dueOn: string) => ({ dueOn });
    const b = firstThirtyBuckets([t('2026-10-01'), t('2026-10-10'), t('2026-10-12'), t('2026-10-17'), t('2026-10-18'), t('2026-10-31'), t('2026-11-05')], '2026-10-10', '2026-10-01');
    expect(b.today.map((x) => x.dueOn)).toEqual(['2026-10-01', '2026-10-10']);
    expect(b.week.map((x) => x.dueOn)).toEqual(['2026-10-12', '2026-10-17']);
    expect(b.month.map((x) => x.dueOn)).toEqual(['2026-10-18', '2026-10-31']);
  });
});
