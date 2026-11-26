import { groupForSwitchOn, nextStatus, type SwitchOnPerson } from './position-rules';

describe('seat status moves (O2)', () => {
  it('proposed → active, active ↔ frozen, anything but eliminated → eliminated (positive)', () => {
    expect(nextStatus('proposed', 'activate')).toBe('active');
    expect(nextStatus('active', 'freeze')).toBe('frozen');
    expect(nextStatus('frozen', 'activate')).toBe('active');
    expect(nextStatus('frozen', 'eliminate')).toBe('eliminated');
    expect(nextStatus('active', 'change')).toBe('active');
  });
  it('never brings back an eliminated seat, freezes a proposed one or activates an active one (negative)', () => {
    expect(nextStatus('eliminated', 'activate')).toBeNull();
    expect(nextStatus('eliminated', 'change')).toBeNull();
    expect(nextStatus('proposed', 'freeze')).toBeNull();
    expect(nextStatus('active', 'activate')).toBeNull();
    expect(nextStatus('active', 'promote')).toBeNull();
  });
});

describe('switch-on grouping (answer 2642)', () => {
  const p = (id: string, o: Partial<SwitchOnPerson> = {}): SwitchOnPerson => ({ employmentId: `em-${id}`, employeeId: id, name: id, legalEntityId: 'E', departmentId: 'D', locationId: 'L', designationId: 'dev', gradeId: 'G1', managerEmployeeId: 'boss', costCentreId: 'CC', ...o });
  it('one seat per identical job, headcount = people, the shared cost centre and the managers seat as supervisor', () => {
    const g = groupForSwitchOn([p('boss', { designationId: 'lead', managerEmployeeId: null }), p('a'), p('b'), p('c', { costCentreId: 'CC2' })]);
    expect(g).toHaveLength(2);
    const devs = g.find((x) => x.designationId === 'dev')!;
    const lead = g.find((x) => x.designationId === 'lead')!;
    expect(devs.people.map((x) => x.employeeId)).toEqual(['a', 'b', 'c']);
    expect(devs.costCentreId).toBeNull();
    expect(lead.costCentreId).toBe('CC');
    expect(devs.supervisorKey).toBe(lead.key);
    expect(lead.supervisorKey).toBeNull();
  });
  it('no supervisor when managers sit in several groups, in no group, or the same group; never a loop (negative)', () => {
    const mixed = groupForSwitchOn([p('m1', { designationId: 'x', managerEmployeeId: null }), p('m2', { designationId: 'y', managerEmployeeId: null }), p('a', { managerEmployeeId: 'm1' }), p('b', { managerEmployeeId: 'm2' })]);
    expect(mixed.find((x) => x.designationId === 'dev')!.supervisorKey).toBeNull();
    const outside = groupForSwitchOn([p('a', { managerEmployeeId: 'gone' })]);
    expect(outside[0].supervisorKey).toBeNull();
    const peers = groupForSwitchOn([p('a', { managerEmployeeId: 'b' }), p('b', { managerEmployeeId: 'a' })]);
    expect(peers[0].supervisorKey).toBeNull();
    const loop = groupForSwitchOn([p('a', { designationId: 'x', managerEmployeeId: 'b' }), p('b', { designationId: 'y', managerEmployeeId: 'a' })]);
    expect(loop.filter((x) => x.supervisorKey).length).toBeLessThan(2);
  });
});
