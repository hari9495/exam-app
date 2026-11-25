import { closedWhy, isEvidence, ruleOf, weekCompliance, type ComplianceDay, type DayFacts } from './hybrid-rules';
import { DevFakeWorkTools, matchProject } from './providers/work-tools';

// TIM-41 / TIM-43 pure rules: the plannable day, the week's compliance, evidence, and suggestion → project mapping.
const day = (on: string, p: Partial<DayFacts> = {}): DayFacts => ({ on, employed: true, weeklyOff: false, holiday: null, leave: null, ...p });
const cday = (on: string, p: Partial<ComplianceDay> = {}): ComplianceDay => ({ ...day(on), place: null, anchor: false, evidence: false, ...p });
// Mon 2 Nov – Fri 6 Nov 2026.
const WEEK = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];

describe('ruleOf', () => {
  it('reads the three settings; 0 is no rule; unknown parts are ignored', () => {
    expect(ruleOf('3', 'tue,thu', 'geofence,kiosk')).toEqual({ officeDays: 3, anchors: [1, 3], evidence: ['geofence', 'kiosk'] });
    expect(ruleOf('0', '', '')).toEqual({ officeDays: 0, anchors: [], evidence: [] });
    expect(ruleOf('9', 'sat,fri,mon', 'badge,network')).toEqual({ officeDays: 5, anchors: [0, 4], evidence: ['network'] });
  });
});

describe('closedWhy (plannable day)', () => {
  const today = '2026-11-03';
  it('tomorrow and later are open; today has started; earlier is over', () => {
    expect(closedWhy(day('2026-11-04'), today)).toBeNull();
    expect(closedWhy(day('2026-11-03'), today)).toBe('started');
    expect(closedWhy(day('2026-11-02'), today)).toBe('past');
  });
  it('weekly offs, full holidays, full leave and days outside employment are closed; half-day leave stays open', () => {
    expect(closedWhy(day('2026-11-05', { weeklyOff: true }), today)).toBe('weekly_off');
    expect(closedWhy(day('2026-11-05', { holiday: 'Diwali' }), today)).toBe('holiday');
    expect(closedWhy(day('2026-11-05', { leave: 'full' }), today)).toBe('leave');
    expect(closedWhy(day('2026-11-05', { leave: 'first' }), today)).toBeNull();
    expect(closedWhy(day('2026-11-05', { employed: false }), today)).toBe('not_employed');
  });
});

describe('isEvidence', () => {
  const all = ['geofence', 'network', 'kiosk'] as const;
  it('inside a geofence, on the office network, or at a kiosk, as the policy allows', () => {
    expect(isEvidence({ source: 'web', verdict: 'inside' }, all)).toBe(true);
    expect(isEvidence({ source: 'web', verdict: 'network' }, all)).toBe(true);
    expect(isEvidence({ source: 'kiosk', verdict: 'inside' }, all)).toBe(true);
    expect(isEvidence({ source: 'web', verdict: 'field' }, all)).toBe(false);
    expect(isEvidence({ source: 'mobile', verdict: 'coarse' }, all)).toBe(false);
    // A kiosk punch counts only through "kiosk", not as a geofence punch.
    expect(isEvidence({ source: 'kiosk', verdict: 'inside' }, ['geofence'])).toBe(false);
    expect(isEvidence({ source: 'web', verdict: 'network' }, ['geofence', 'kiosk'])).toBe(false);
  });
});

describe('weekCompliance', () => {
  const rule = ruleOf('3', 'tue', 'geofence,network,kiosk');
  const today = '2026-11-09';
  it('met at the target exactly; one short below it', () => {
    const met = weekCompliance(rule, WEEK.map((on, k) => cday(on, { anchor: k === 1, place: k === 0 || k === 3 ? 'office' : 'home', evidence: k === 0 || k === 1 || k === 3 })), today);
    expect(met).toMatchObject({ target: 3, planned: 3, office: 3, counted: 3, met: true, short: 0, missed: [] });
    const short = weekCompliance(rule, WEEK.map((on, k) => cday(on, { anchor: k === 1, place: k === 0 || k === 3 ? 'office' : 'home', evidence: k === 1 || k === 3 })), today);
    expect(short).toMatchObject({ office: 2, met: false, short: 1, missed: ['2026-11-02'] });
  });
  it('full leave counts toward the target; a holiday lowers it to the working days left', () => {
    const r = weekCompliance(ruleOf('5', '', 'geofence'), WEEK.map((on, k) => cday(on, { holiday: k === 4 ? 'Diwali' : null, leave: k === 0 ? 'full' : null, evidence: k > 0 && k < 4, place: 'office' })), today);
    expect(r).toMatchObject({ target: 4, office: 3, leave: 1, counted: 4, met: true, missed: [] });
  });
  it('no rule: never met, never short', () => {
    expect(weekCompliance(ruleOf('0', '', ''), WEEK.map((on) => cday(on)), today)).toMatchObject({ noRule: true, target: 0, met: false, short: 0 });
  });
  it('planned office days still to come are not missed yet', () => {
    expect(weekCompliance(rule, WEEK.map((on) => cday(on, { place: 'office' })), '2026-11-04').missed).toEqual(['2026-11-02', '2026-11-03']);
  });
});

describe('matchProject (suggestion → project)', () => {
  const projects = [
    { id: 'p1', code: 'FSSAI-AUDIT', name: 'FSSAI audit readiness', activities: ['Documentation', 'Line checks'] },
    { id: 'p2', code: 'INT', name: 'Internal', activities: [] },
  ];
  it('code, name, or a code inside the text; activity only when the project has it', () => {
    expect(matchProject('fssai-audit', 'line checks', projects)).toEqual({ projectId: 'p1', activity: 'Line checks' });
    expect(matchProject('Internal', 'Meetings', projects)).toEqual({ projectId: 'p2', activity: null });
    expect(matchProject('FSSAI-AUDIT line checks', null, projects)).toEqual({ projectId: 'p1', activity: null });
    expect(matchProject('Weekly sync with INT team', null, projects)).toEqual({ projectId: 'p2', activity: null });
  });
  it('unknown or empty hints mean "choose a project"; a code inside a word does not match', () => {
    expect(matchProject('Client workshop', null, projects)).toEqual({ projectId: null, activity: null });
    expect(matchProject(null, 'Documentation', projects)).toEqual({ projectId: null, activity: null });
    expect(matchProject('INTERVIEWS', null, projects)).toEqual({ projectId: null, activity: null });
  });
});

describe('DevFakeWorkTools', () => {
  it('is the same every time and never suggests days after `upTo`', async () => {
    const t = new DevFakeWorkTools();
    const a = await t.suggestions('u1', 'calendar', '2026-11-02', '2026-11-03');
    expect(a.map((l) => l.date)).toEqual(['2026-11-02']);
    expect(await t.suggestions('u2', 'calendar', '2026-11-02', '2026-11-03')).toEqual(a);
    expect((await t.connect('u1', 'issues')).accountLabel).toMatch(/Issue tracker/);
  });
});
