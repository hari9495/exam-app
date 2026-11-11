import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PlatformSettingsScreen } from './platform-settings';
import { settingRows as ROWS } from './platform-settings.stories';
import { PublishSchedulerScreen } from '../portals/console-rules';
import * as L from '../portals/console-rules-samples';

// Console follow-ups (answers 1065, 1125): Platform settings and the rule notice after publishing.
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Platform settings (1125)', () => {
  it('lists each value; the DPDP timing is marked to verify with counsel', () => {
    wrap(<PlatformSettingsScreen state="ready" rows={ROWS} canChange onChange={vi.fn()} />);
    const dpdp = screen.getByText(/Data Protection Board/).closest('tr') as HTMLElement;
    expect(within(dpdp).getByText('Verify with counsel')).toBeInTheDocument();
    expect(within(dpdp).getByText('72')).toBeInTheDocument();
  });

  it('a change needs a reason (field error, focus); the API refusal stays in the dialog', async () => {
    const onChange = vi.fn().mockRejectedValueOnce(new Error('CERT-In: give a whole number from 1 to 24.')).mockResolvedValueOnce([]);
    wrap(<PlatformSettingsScreen state="ready" rows={ROWS} canChange onChange={onChange} />);
    const row = screen.getByText(/CERT-In/).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Change' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText(/Give a reason of at least 5 characters/)).toBeInTheDocument();
    expect(document.activeElement?.id).toBe('ps-reason');
    expect(onChange).not.toHaveBeenCalled();
    const value = within(dialog).getByRole('textbox', { name: /Value/ });
    await userEvent.clear(value);
    await userEvent.type(value, '30');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Counsel asked');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('CERT-In: give a whole number from 1 to 24.')).toBeInTheDocument();
    await userEvent.clear(value);
    await userEvent.type(value, '8');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('breach.certin_hours', '8', 'Counsel asked'));
  });

  it('without the key there is no Change button', () => {
    wrap(<PlatformSettingsScreen state="ready" rows={ROWS} canChange={false} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });
});

describe('Rule notice after publishing (1065)', () => {
  it('sends the notice and says it waits for a second staff member', async () => {
    const onNotice = vi.fn().mockResolvedValue({ companies: 3, waiting: true });
    wrap(<PublishSchedulerScreen live={{ state: 'ready', choices: [], chosen: null, onChoose: () => {}, detail: null, impact: null, onPublish: async () => {}, published: L.LIVE_ROWS[0]!, onNotice }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send notice' }));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(L.LIVE_ROWS[0]!.id, expect.objectContaining({ subject: expect.stringContaining(L.LIVE_ROWS[0]!.statute) })));
    expect(await screen.findByText('Notice to 3 companies is waiting for a second staff member')).toBeInTheDocument();
  });
});
