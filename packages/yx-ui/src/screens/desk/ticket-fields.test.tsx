import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { FieldsTab, RequesterFields, TicketFieldsPanel, choiceValue, fieldFilterOf, fieldFilters } from './ticket-fields';
import { AGENT_TICKET_FIELDS, LEAD_TICKET_FIELDS, SAMPLE_FIELDS } from './ticket-fields-sample';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TYPES = [{ id: 'ty-1', name: 'Something is broken' }];

describe('desk fields (answers 1641, 1650)', () => {
  it('set-up lists the fields with kind, narrowing and who sees them; read-only set-up has no edit buttons', () => {
    const { unmount } = show(<FieldsTab fields={SAMPLE_FIELDS} types={TYPES} canSetUp onSave={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Ticket fields' });
    expect(within(list).getByText(/Drop-down · narrowed by Office · for every ticket · Everyone on the ticket/)).toBeInTheDocument();
    expect(within(list).getByText(/Number · for every ticket · Team leads only/)).toBeInTheDocument();
    expect(within(list).getByText(/Date · for every ticket · Desk staff only · off/)).toBeInTheDocument();
    unmount();
    show(<FieldsTab fields={SAMPLE_FIELDS} types={TYPES} canSetUp={false} />);
    expect(screen.queryByRole('button', { name: 'New field' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Office' })).toBeNull();
  });

  it('1843: Required before solving is saved with the field and shown in the list and on the ticket', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const fields = SAMPLE_FIELDS.map((f) => (f.key === 'vendor_ticket' ? { ...f, requiredToSolve: true } : f));
    const { unmount } = show(<FieldsTab fields={fields} types={TYPES} canSetUp onSave={onSave} />);
    expect(within(screen.getByRole('list', { name: 'Ticket fields' })).getByText(/Desk staff only · required before solving/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Edit Office' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('checkbox', { name: /Required before solving/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Save field' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('f1', expect.objectContaining({ requiredToSolve: true })));
    unmount();
    show(<TicketFieldsPanel fields={AGENT_TICKET_FIELDS.map((f) => (f.key === 'vendor_ticket' ? { ...f, requiredToSolve: true } : f))} canSet onSave={vi.fn()} />);
    expect(screen.getByText(/Not shown to the requester · Required before solving/)).toBeInTheDocument();
  });

  it('1843 negative: a team-lead-only field offers no Required before solving and never sends it on', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(<FieldsTab fields={SAMPLE_FIELDS.map((f) => (f.key === 'asset_cost' ? { ...f, requiredToSolve: true } : f))} types={TYPES} canSetUp onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Edit Asset cost (₹)' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('checkbox', { name: /Required before solving/ })).toBeNull();
    await ue.click(within(dialog).getByRole('button', { name: 'Save field' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('f4', expect.objectContaining({ requiredToSolve: false })));
  });

  it('a new drop-down: nothing filled is stopped; then saved with choice values from labels, narrowed by Office', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(<FieldsTab fields={SAMPLE_FIELDS} types={TYPES} canSetUp onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'New field' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save field' }));
    expect(within(dialog).getByText('Name the field.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Desk number');
    expect(within(dialog).getByRole('textbox', { name: /Key/ })).toHaveValue('desk_number');
    await ue.click(within(dialog).getByRole('radio', { name: 'Drop-down' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Save field' }));
    expect(within(dialog).getByText('Write at least one choice.')).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox', { name: /Choices/ }), 'Desk 12{Enter}Desk 40');
    await ue.click(within(dialog).getByRole('combobox', { name: /Narrowed by/ }));
    await ue.click(await screen.findByRole('option', { name: 'Office' }));
    await ue.click(within(dialog).getByRole('combobox', { name: /Choices when Office is Bengaluru/ }));
    await ue.click(await screen.findByRole('option', { name: 'Desk 12' }));
    await ue.keyboard('{Escape}');
    await ue.click(within(dialog).getByRole('button', { name: 'Save field' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null, expect.objectContaining({ key: 'desk_number', fieldType: 'choice', options: [{ label: 'Desk 12', value: 'desk_12' }, { label: 'Desk 40', value: 'desk_40' }], dependsOn: 'office', optionsBy: { blr: ['desk_12'], che: [] } })));
  });

  it('on a ticket: the floor offered follows the office (the dependent list), and only changed fields are saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(<TicketFieldsPanel fields={LEAD_TICKET_FIELDS} canSet onSave={onSave} />);
    await ue.click(screen.getByRole('combobox', { name: /Office/ }));
    await ue.click(await screen.findByRole('option', { name: 'Chennai' }));
    await ue.click(screen.getByRole('combobox', { name: /Floor/ }));
    expect(await screen.findByRole('option', { name: 'Chennai · ground floor' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bengaluru · 1st floor' })).toBeNull();
    await ue.click(screen.getByRole('option', { name: 'Chennai · ground floor' }));
    await ue.click(screen.getByRole('button', { name: 'Save fields' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ office: 'che', floor: 'che_g' }));
    expect((await screen.findAllByText('Fields saved.')).length).toBeGreaterThan(0);
    expect(screen.getByText('Team leads only')).toBeInTheDocument();
  });

  it('read only shows the values; a first-line agent is never sent the team-lead-only field (nothing to show)', () => {
    const { unmount } = show(<TicketFieldsPanel fields={AGENT_TICKET_FIELDS} canSet={false} />);
    expect(screen.getByText('Bengaluru · 2nd floor')).toBeInTheDocument();
    expect(screen.queryByText('Asset cost (₹)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save fields' })).toBeNull();
    unmount();
    const { container } = show(<RequesterFields fields={[]} />);
    expect(container.textContent).toBe('');
  });

  it('filters: a drop-down filters by its choices, others by text; one field at a time goes to the server', () => {
    const defs = fieldFilters(SAMPLE_FIELDS);
    expect(defs.map((d) => [d.key, d.type])).toEqual([['field:office', 'multi'], ['field:floor', 'multi'], ['field:vendor_ticket', 'text'], ['field:asset_cost', 'text']]);
    expect(fieldFilterOf([{ key: 'priority', type: 'multi', values: ['1'] }, { key: 'field:office', type: 'multi', values: ['blr', 'che'] }])).toEqual({ fieldKey: 'office', fieldValues: ['blr', 'che'] });
    expect(fieldFilterOf([{ key: 'field:vendor_ticket', type: 'text', contains: '  ' }])).toEqual({});
    expect(choiceValue('  Bengaluru — 2nd floor ')).toBe('bengaluru_2nd_floor');
  });
});
