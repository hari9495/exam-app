import { liveRelated, screenHref } from './yx-screen-pages';

// T2-G 83: a settings page's Related shows only work pages with a live page in the person's menu.
describe('liveRelated', () => {
  const page = { related: [{ label: 'Muster grid', screenId: 'TIM-02' }, { label: 'Rule builder', screenId: 'PLT-32' }, { label: 'Roster', screenId: 'TIM-05' }, { label: 'Approvals', screenId: 'PLT-04' }] };
  it('keeps the links with a live page the person may open', () => {
    expect(liveRelated(page, (h) => h === '/yx/time/muster').related).toEqual([{ label: 'Muster grid', screenId: 'TIM-02' }]);
    expect(screenHref('TIM-05')).toBe('/yx/time/roster');
  });
  it('negative: no live page or not in the menu is never shown; a page override wins', () => {
    expect(liveRelated(page, () => false).related).toEqual([]);
    expect(screenHref('PLT-32')).toBeUndefined();
    expect(liveRelated(page, (h) => h === '/x', { 'PLT-04': '/x' }).related!.map((r) => r.screenId)).toEqual(['PLT-04']);
  });
});
