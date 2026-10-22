import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomFieldsDrawer, EmployeeFieldsScreen, customValueText, type RecordCustomField } from './custom-fields';
import { EMPLOYEE_FIELDS } from './people-data';

const field = (o: Partial<RecordCustomField>): RecordCustomField => ({ id: 'f1', label: 'Forklift licence number', fieldType: 'text', options: null, required: false, dataClass: 'internal', value: null, canEdit: true, ...o });

describe('Additional details drawer', () => {
  it('sends only the fields changed, each with its own input; read-only fields are not offered', async () => {
    const ue = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(
      <CustomFieldsDrawer
        fields={[field({ value: 'TN70 2019 0004412' }), field({ id: 'f2', label: 'Shoe size', fieldType: 'number', value: 9 }), field({ id: 'f3', label: 'T-shirt size', canEdit: false, value: 'L' })]}
        onSave={onSave}
        onClose={onClose}
      />,
    );
    expect(screen.queryByText('T-shirt size')).toBeNull();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    const box = screen.getByDisplayValue('TN70 2019 0004412');
    await ue.clear(box);
    await ue.type(box, 'TN70 2020 1');
    await ue.click(save);
    expect(onSave).toHaveBeenCalledWith({ f1: 'TN70 2020 1' });
    expect(onClose).toHaveBeenCalled();
  });

  it('a Confidential value comes masked, so its box starts empty', () => {
    render(<CustomFieldsDrawer fields={[field({ dataClass: 'confidential', value: '•••• 8899' })]} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByDisplayValue('•••• 8899')).toBeNull();
    expect(screen.getByText(/last four characters/)).toBeInTheDocument();
  });

  it('values read in words; empty is null ("Not set")', () => {
    expect(customValueText({ fieldType: 'date', value: '2026-10-22' })).toBe('22 Oct 2026');
    expect(customValueText({ fieldType: 'text', value: '' })).toBeNull();
    expect(customValueText({ fieldType: 'number', value: 9 })).toBe('9');
  });
});

describe('Settings › Custom fields', () => {
  it('lists each field with its sensitivity; HR adds a pick-list with its class and choices', async () => {
    const ue = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    render(<EmployeeFieldsScreen state="ready" fields={EMPLOYEE_FIELDS} canManage onCreate={onCreate} onUpdate={vi.fn()} onArchive={vi.fn()} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Blood group')).toBeInTheDocument();
    expect(within(table).getByText('Personal')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add custom field' }));
    await ue.click(screen.getByRole('button', { name: 'Add field' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getAllByText('Give the field a name.').length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: /Name/ }), 'Shoe size');
    await ue.click(screen.getByRole('radio', { name: 'Public' }));
    await ue.click(screen.getByRole('button', { name: 'Add field' }));
    expect(onCreate).toHaveBeenCalledWith({ label: 'Shoe size', fieldType: 'text', dataClass: 'public', options: null });
  });

  it('without org.settings.manage the list is read-only', () => {
    render(<EmployeeFieldsScreen state="ready" fields={EMPLOYEE_FIELDS} canManage={false} onCreate={vi.fn()} onUpdate={vi.fn()} onArchive={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Add custom field' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
  });
});
