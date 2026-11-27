import { MODULE_IDS, moduleOfPath, moduleOrder, SWITCHABLE_IDS } from './modules';

describe('modules (T2-G 41)', () => {
  it('maps each module its own API paths', () => {
    expect(moduleOfPath('/time/me/attendance')).toBe('time');
    expect(moduleOfPath('/kiosk/punch')).toBe('time');
    expect(moduleOfPath('/hiring/offers')).toBe('hire');
    expect(moduleOfPath('/candidate-sms-templates')).toBe('hire');
    expect(moduleOfPath('/performance/goals')).toBe('performance');
    expect(moduleOfPath('/learning/courses')).toBe('learning');
    expect(moduleOfPath('/desk/tickets')).toBe('helpdesk');
    expect(moduleOfPath('/desk/my/desks')).toBe('helpdesk');
    expect(moduleOfPath('/engage/announcements')).toBe('engage');
    expect(moduleOfPath('/projects/status')).toBe('projects');
    expect(moduleOfPath('/contract-labour/workers')).toBe('contract');
    expect(moduleOfPath('/visitors/log')).toBe('visitors');
    expect(moduleOfPath('/library/reports')).toBe('analytics');
  });

  it('never gates People, Payroll, settings or the legal duties under /desk', () => {
    for (const p of ['/people/directory', '/payroll/runs', '/expenses/claims', '/org/modules', '/org/settings', '/workspace/counts', '/timesheets', '/hiringx', '/desk/speakup/ic', '/desk/cases', '/desk/my/cases', '/desk/policies', '/desk/accidents', '/desk/ethics'])
      expect([p, moduleOfPath(p)]).toEqual([p, null]);
  });

  it('People, Payroll and Compliance cannot be switched off', () => {
    expect(SWITCHABLE_IDS).not.toContain('people');
    expect(SWITCHABLE_IDS).not.toContain('pay');
    expect(SWITCHABLE_IDS).not.toContain('compliance');
    expect(SWITCHABLE_IDS).toContain('hire');
  });

  it('the order is the saved one, then the rest in the designed order; unknown ids are dropped', () => {
    expect(moduleOrder('')).toEqual(MODULE_IDS);
    const o = moduleOrder('learning,hire,nonsense,time');
    expect(o.slice(0, 3)).toEqual(['learning', 'hire', 'time']);
    expect([...o].sort()).toEqual([...MODULE_IDS].sort());
  });
});
