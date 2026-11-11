import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { staffingEntityChanges, staffingSettingsPage, type StaffingSettingsData } from './staffing-live';

// Answer 495: e-invoicing per legal entity on Settings 6.2, as drawn ("Different for" a legal entity). Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.2')!;
const values = { 'staffing.einvoice.applies': 'off', 'staffing.payment_terms_days': '30' };
const DATA: StaffingSettingsData = {
  canEdit: true,
  values,
  defaults: values,
  choices: { 'staffing.payment_terms_days': ['15', '30', '45'] },
  lastChange: null,
  financialYear: '2026-27',
  entities: [
    { id: 'e1', name: 'Kaveri Staffing Pvt Ltd', gstins: [] },
    { id: 'e2', name: 'Kaveri Foods Pvt Ltd', gstins: [] },
  ],
  series: [],
  einvoiceByEntity: [{ legalEntityId: 'e2', value: 'on' }],
};
const show = (onSave = vi.fn(async () => undefined)) => {
  render(
    <ToastProvider>
      <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.2" live={{ page: staffingSettingsPage(design, DATA), canEdit: true, lastChange: null, onSave }} />
    </ToastProvider>,
  );
  return onSave;
};

describe('Settings 6.2 e-invoicing per legal entity (answer 495)', () => {
  it('an entity takes its own value; it is saved for that entity only', async () => {
    const onSave = show();
    await ue.click(screen.getByRole('combobox', { name: /Apply changes to/i }));
    await ue.click(screen.getByRole('option', { name: 'Kaveri Staffing Pvt Ltd' }));
    const toggle = screen.getByRole('checkbox', { name: /E-invoicing/ });
    expect(toggle).not.toBeChecked(); // follows the company (off)
    await ue.click(toggle);
    await ue.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const overrides = (onSave.mock.calls[0] as unknown[])[2] as Parameters<typeof staffingEntityChanges>[0];
    expect(overrides).toEqual([{ key: 'staff.einvoice', scope: 'Kaveri Staffing Pvt Ltd', value: true }]);
    expect(staffingEntityChanges(overrides, DATA.entities)).toEqual([{ key: 'staffing.einvoice.applies', value: 'on', legalEntityId: 'e1' }]);
  });

  it('an entity with its own value shows it; company-only settings cannot be changed for an entity', async () => {
    show();
    await ue.click(screen.getByRole('combobox', { name: /Apply changes to/i }));
    await ue.click(screen.getByRole('option', { name: 'Kaveri Foods Pvt Ltd' }));
    expect(screen.getByRole('checkbox', { name: /E-invoicing/ })).toBeChecked();
    // Payment terms are one value for the company: read-only while an entity is chosen.
    // Only the scope picker can be changed: the company's other settings are read-only for an entity.
    expect(screen.getAllByRole('combobox').filter((c) => !(c as HTMLButtonElement).disabled)).toHaveLength(1);
  });

  it('negative: an unknown entity name or another setting is not sent', () => {
    expect(staffingEntityChanges([{ key: 'staff.einvoice', scope: 'Nobody Ltd', value: true }, { key: 'staff.payment_terms', scope: 'Kaveri Foods Pvt Ltd', value: '45' }], DATA.entities)).toEqual([]);
  });
});
