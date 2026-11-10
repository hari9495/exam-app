import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { formatStamp, parseIso } from './settings-logic';
import { visitorSettingsPage, type VisitorSettingsData } from './visitors-live';

// Visitors walk-through (10 Nov 2026): a refused save is brought into view; an API time with a zone is shown in local time.
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('settings fixes from the visitors walk-through', () => {
  it('an API time with a zone is a moment (local time); the registry wall time is unchanged', () => {
    expect(parseIso('2026-11-10T16:20:00.000Z').getTime()).toBe(Date.parse('2026-11-10T16:20:00.000Z'));
    expect(parseIso('2026-11-10T21:50:00+05:30').getTime()).toBe(Date.parse('2026-11-10T16:20:00.000Z'));
    expect(parseIso('2026-09-14T11:05')).toEqual(new Date(2026, 8, 14, 11, 5));
    expect(formatStamp('2026-09-14T11:05')).toBe('14 Sep 2026, 11:05 am');
  });

  it('a refused save shows its reason and scrolls it into view; a good save does not', async () => {
    const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.12')!;
    const data: VisitorSettingsData = { canEdit: true, values: { 'visitors.kiosk': 'off' }, defaults: { 'visitors.kiosk': 'off' }, choices: {}, labels: {}, overrides: {}, lastChange: null };
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Visitors must be allowed until a time after they are allowed from.')).mockResolvedValue(undefined);
    render(<ToastProvider><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.12" live={{ page: visitorSettingsPage(design, data), canEdit: true, lastChange: null, onSave }} /></ToastProvider>);
    await ue.click(screen.getByRole('checkbox', { name: /visitor kiosk/ }));
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' }).at(-1)!);
    expect(await screen.findByText(/Visitors must be allowed until a time after they are allowed from\. Your edits are kept/)).toBeInTheDocument();
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'center' }));
    scroll.mockClear();
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' }).at(-1)!);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(scroll).not.toHaveBeenCalled();
  });
});
