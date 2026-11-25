import { FieldRow, applyFieldChange, checkFieldSet, sees, shownFields } from './ticket-fields';

const field = (over: Partial<FieldRow>): FieldRow =>
  ({ id: over.key, organizationId: 'o', deskId: 'd', ticketTypeId: null, label: over.key, fieldType: 'text', options: [], dependsOn: null, optionsBy: null, visibility: 'all', sortOrder: 0, active: true, version: 1, createdBy: null, createdAt: new Date(), updatedAt: new Date(), ...over }) as FieldRow;

const site = field({ key: 'site', fieldType: 'choice', options: [{ value: 'blr', label: 'Bengaluru' }, { value: 'che', label: 'Chennai' }] });
const floor = field({ key: 'floor', fieldType: 'choice', options: [{ value: 'b1', label: 'BLR 1st floor' }, { value: 'c1', label: 'CHE 1st floor' }], dependsOn: 'site', optionsBy: { blr: ['b1'], che: ['c1'] } });
const cost = field({ key: 'cost', fieldType: 'number', visibility: 'leads' });
const note = field({ key: 'note', visibility: 'agents' });
const FIELDS = [site, floor, cost, note];

describe('ticket fields (answers 1641, 1650)', () => {
  it('who sees what: all, agents (not the requester), leads only', () => {
    expect(['requester', 'agent', 'lead'].map((w) => sees(note, w as never))).toEqual([false, true, true]);
    expect(['requester', 'agent', 'lead'].map((w) => sees(cost, w as never))).toEqual([false, false, true]);
    expect(shownFields(FIELDS, { site: 'blr', cost: 9, note: 'x' }, 'requester', true).map((f) => [f.key, f.display])).toEqual([['site', 'Bengaluru']]);
    expect(shownFields(FIELDS, { cost: 9 }, 'agent').map((f) => f.key)).toEqual(['site', 'floor', 'note']);
  });

  it('a dependent drop-down takes only a value under its parent; a changed parent clears a child no longer allowed', () => {
    expect(applyFieldChange(FIELDS, {}, { site: 'blr', floor: 'b1' }, 'agent')).toMatchObject({ values: { site: 'blr', floor: 'b1' }, errors: {} });
    expect(applyFieldChange(FIELDS, {}, { site: 'blr', floor: 'c1' }, 'agent').errors).toEqual({ floor: 'Choose one of the options offered.' });
    expect(applyFieldChange(FIELDS, { site: 'blr', floor: 'b1' }, { site: 'che' }, 'agent')).toMatchObject({ values: { site: 'che' }, errors: {} });
  });

  it('a field the viewer may not see, or that is not on the desk, is reported; a lead-only value survives a first-line edit', () => {
    const r = applyFieldChange(FIELDS, { cost: 5 }, { cost: 7, nope: 'x', note: 'hi' }, 'agent');
    expect(r.forbidden).toEqual(['cost']);
    expect(r.unknown).toEqual(['nope']);
    expect(applyFieldChange(FIELDS, { cost: 5 }, { note: 'hi' }, 'agent').values).toEqual({ cost: 5, note: 'hi' });
  });

  it('an admin set is checked: a dependent list must point at a pick-list and list only its own values', () => {
    expect(() => checkFieldSet([site, floor])).not.toThrow();
    expect(() => checkFieldSet([floor])).toThrow(/depend only on a pick-list/);
    expect(() => checkFieldSet([site, { ...floor, optionsBy: { blr: ['zz'] } }])).toThrow(/only its own values/);
    expect(() => checkFieldSet([site, { ...floor, optionsBy: { mum: ['b1'] } }])).toThrow(/not a value of/);
  });
});
