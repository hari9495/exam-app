import { customRows } from './yx-record';

describe('customRows (PPL-03 Additional details)', () => {
  it('shows what the API sent: label, class, value in words or null ("Not set"); only Personal is the person\'s to change', () => {
    const base = { options: null, required: false, canEdit: false };
    expect(
      customRows([
        { ...base, id: 'a', label: 'Forklift licence number', fieldType: 'text', dataClass: 'internal', value: 'TN70 2019 0004412' },
        { ...base, id: 'b', label: 'Blood group', fieldType: 'select', dataClass: 'personal', value: null },
        { ...base, id: 'c', label: 'Licence expiry', fieldType: 'date', dataClass: 'public', value: '2027-03-31' },
      ]),
    ).toEqual([
      { label: 'Forklift licence number', value: 'TN70 2019 0004412', cls: 'Internal', selfEdit: false },
      { label: 'Blood group', value: null, cls: 'Personal', selfEdit: true },
      { label: 'Licence expiry', value: '31 Mar 2027', cls: 'Public', selfEdit: false },
    ]);
  });
});
