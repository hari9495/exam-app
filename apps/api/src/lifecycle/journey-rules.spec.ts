import { addDays, checkTemplateTasks, daysBetween, dueOn, openable, progress, type TaskLike } from './journey-rules';

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
