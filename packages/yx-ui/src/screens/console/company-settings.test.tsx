import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CompanySettingsScreen } from './company-settings';
import { COMPANY_SETTINGS } from './data';

// Careers answer 442: Console › Company settings. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Console › Company settings (442)', () => {
  it('turning white-label on asks for a reason, then sends it and toasts', async () => {
    const onChange = vi.fn(async () => undefined);
    show(<CompanySettingsScreen state="ready" company={COMPANY_SETTINGS} canManage onBack={() => {}} onChange={onChange} />);
    expect(screen.getByText('White-label')).toBeInTheDocument();
    await ue.click(screen.getByRole('switch', { name: /Powered by YukthiX/ }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    expect(onChange).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox'), 'Plan includes it; asked by the customer');
    await ue.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('brand.white_label', 'on', 'Plan includes it; asked by the customer'));
    expect((await screen.findAllByText('Turned on')).length).toBeGreaterThan(0);
  });

  it('not in the plan: no switch, says why; on from before can still be turned off; view-only staff see the value only', async () => {
    const onChange = vi.fn(async () => undefined);
    const notIn = { ...COMPANY_SETTINGS, features: [], settings: COMPANY_SETTINGS.settings.map((s) => ({ ...s, included: false })) };
    const { unmount } = show(<CompanySettingsScreen state="ready" company={notIn} canManage onBack={() => {}} onChange={onChange} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText(/not in this company's plan/)).toBeInTheDocument();
    expect(screen.getByText('Add a product whose plan includes it first.')).toBeInTheDocument();
    unmount();
    const onBefore = { ...notIn, settings: notIn.settings.map((s) => ({ ...s, value: 'on' })) };
    const second = show(<CompanySettingsScreen state="ready" company={onBefore} canManage onBack={() => {}} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    second.unmount();
    show(<CompanySettingsScreen state="ready" company={COMPANY_SETTINGS} canManage={false} onBack={() => {}} onChange={onChange} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('a refusal shows the server words; no access shows the no-access state', async () => {
    const onChange = vi.fn(async () => {
      throw new Error('This company’s plan does not include it. Add a product whose plan includes it first.');
    });
    const { unmount } = show(<CompanySettingsScreen state="ready" company={COMPANY_SETTINGS} canManage onBack={() => {}} onChange={onChange} />);
    await ue.click(screen.getByRole('switch', { name: /Powered by YukthiX/ }));
    await ue.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'Asked by the customer');
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText(/plan does not include it/)).toBeInTheDocument();
    unmount();
    show(<CompanySettingsScreen state="no-access" company={null} canManage onBack={() => {}} onChange={onChange} />);
    expect(screen.getByText(/a YukthiX console owner/)).toBeInTheDocument();
  });
});
