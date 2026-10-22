import { teamRows } from './yx-team';

// PPL-08 (founder, 22 Oct 2026): someone reminded to check in today shows "Reminded", after a reload too.
describe('teamRows', () => {
  it('marks a member reminded today from the muster', () => {
    const member = (id: string) => ({ id, name: id, relation: 'direct', designation: null, department: null, location: null, manager: null, joinedOn: '2024-07-01', status: 'confirmed', probationEndsOn: null });
    const muster = { month: '2026-10', from: '2026-10-01', to: '2026-10-31', scope: 'team', people: [{ id: 'a', remindedOn: ['2026-10-22'], days: [] }, { id: 'b', remindedOn: ['2026-10-21'], days: [] }] };
    const rows = teamRows([member('a'), member('b')] as never, [], '2026-10-22', muster as never);
    expect(rows.map((r) => [r.id, r.reminded])).toEqual([['a', true], ['b', false]]);
  });
});
