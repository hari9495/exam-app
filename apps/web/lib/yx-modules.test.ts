import { inCompanyOrder, moduleOfHref, pageOff } from './yx-modules';

describe('yx-modules (T2-G 41)', () => {
  it('maps pages to modules; shared pages to none', () => {
    expect(moduleOfHref('/yx/time/leave')).toBe('time');
    expect(moduleOfHref('/yx/hiring/jobs')).toBe('hire');
    expect(moduleOfHref('/yx/desk/tickets')).toBe('helpdesk');
    expect(moduleOfHref('/yx/desk')).toBe('helpdesk');
    for (const p of ['/yx/home', '/yx/people', '/yx/payroll/runs', '/yx/settings/modules', '/yx/desk/speakup', '/yx/desk/ic', '/yx/desk/policies', '/yx/desk/my-cases', '/yx/timesheet']) expect([p, moduleOfHref(p)]).toEqual([p, null]);
  });
  it('a page is off only when its module is', () => {
    expect(pageOff('/yx/learning/courses', ['learning'])).toBe(true);
    expect(pageOff('/yx/learning/courses', ['time'])).toBe(false);
    expect(pageOff('/yx/people', ['learning'])).toBe(false);
  });
  it('orders Home first, then the company order, then the rest as drawn', () => {
    const items = [{ id: 'home' }, { id: 'people' }, { id: 'time' }, { id: 'hire' }, { id: 'settings' }];
    expect(inCompanyOrder(items, ['hire', 'people', 'time']).map((i) => i.id)).toEqual(['home', 'hire', 'people', 'time', 'settings']);
    expect(inCompanyOrder(items, undefined).map((i) => i.id)).toEqual(items.map((i) => i.id));
  });
});
