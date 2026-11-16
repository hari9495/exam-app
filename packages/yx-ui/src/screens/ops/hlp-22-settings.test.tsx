import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ItsmSettingsPanel, type ItsmSettingsValue } from './hlp-22-settings';

// ITSM answer 2071: with no other IT lead, the desk admins approve the IT lead step; a desk setting, on by default.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const VALUE: ItsmSettingsValue = {
  version: 3,
  routeLow: 'lead',
  routeMedium: 'lead_owner',
  routeHigh: 'board',
  board: [{ id: 'u1', name: 'Arjun Kulkarni' }],
  boardRule: 'majority',
  emergencyReviewDays: 2,
  bannerOn: true,
  bannerHours: 24,
  reviewDays: 5,
  repeatCount: 3,
  repeatDays: 7,
  riskQuestions: [{ id: 'undo', label: 'Can it be undone?', options: [{ value: '0', label: 'Yes' }, { value: '2', label: 'No' }] }],
  riskQuestionsAreDefault: false,
  window: { weekdayFrom: '20:00', weekdayTo: '06:00', weekends: true, freezeFirstDays: 7, freezeLastDays: 3, freezeDates: [7, 15, 20] },
  canEdit: true,
  canEditWindow: true,
};
const panel = (value: ItsmSettingsValue, onSave = vi.fn().mockResolvedValue(undefined)) => {
  render(<ItsmSettingsPanel value={value} onSearchPeople={async () => []} onSave={onSave} onSaveWindow={async () => undefined} />);
  return onSave;
};
const LABEL = /the desk admins approve it instead/;

describe('ITSM settings: the one-lead fallback (2071)', () => {
  it('is on by default (no value yet) and saves off when switched off', async () => {
    const onSave = panel(VALUE);
    const sw = screen.getByRole('switch', { name: LABEL });
    expect(sw).toBeChecked();
    await ue.click(sw);
    await ue.click(screen.getAllByRole('button', { name: /^Save/ })[0]!);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ version: 3, leadFallbackAdmin: false }));
  });

  it('negative: someone who cannot edit cannot switch it', () => {
    panel({ ...VALUE, leadFallbackAdmin: false, canEdit: false });
    const sw = screen.getByRole('switch', { name: LABEL });
    expect(sw).not.toBeChecked();
    expect(sw).toBeDisabled();
  });
});
