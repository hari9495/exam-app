import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ModulesScreen, type ModuleRow } from './modules';

// T2-G 41 (answer 2746): Settings › Modules.
const ROWS: ModuleRow[] = [
  { id: 'people', label: 'People', on: true, locked: true },
  { id: 'time', label: 'Time & Leave', on: true, locked: false },
  { id: 'pay', label: 'Payroll', on: true, locked: true },
  { id: 'learning', label: 'Learning', on: false, locked: false },
];
const live = (onSave = vi.fn(async () => {})) => ({ state: 'ready' as const, onRetry: vi.fn(), onSave });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Modules (T2-G 41)', () => {
  it('People and Payroll are always on: their switches cannot be used', () => {
    show(<ModulesScreen modules={ROWS} live={live()} />);
    expect(screen.getByRole('switch', { name: 'People' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Payroll' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Time & Leave' })).toBeEnabled();
    expect(screen.getAllByText('Always on').length).toBeGreaterThan(0);
  });

  it('switching off asks first, then saves the whole page and says so in a toast', async () => {
    const onSave = vi.fn(async () => {});
    show(<ModulesScreen modules={ROWS} live={live(onSave)} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Time & Leave' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Nothing is deleted/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ off: ['time', 'learning'], order: ['people', 'time', 'pay', 'learning'] }));
    expect((await screen.findAllByText('Time & Leave switched off')).length).toBeGreaterThan(0);
  });

  it('cancelling the question changes nothing', async () => {
    const onSave = vi.fn(async () => {});
    show(<ModulesScreen modules={ROWS} live={live(onSave)} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Time & Leave' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('switching on saves at once; moving changes the order; the first cannot go up', async () => {
    const onSave = vi.fn(async () => {});
    show(<ModulesScreen modules={ROWS} live={live(onSave)} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Learning' }));
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ off: [], order: ['people', 'time', 'pay', 'learning'] }));
    expect(screen.getByRole('button', { name: 'Move People up' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Learning up' }));
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ off: ['learning'], order: ['people', 'time', 'learning', 'pay'] }));
  });

  it("the server's reason shows when a save is refused", async () => {
    show(<ModulesScreen modules={ROWS} live={live(vi.fn(async () => Promise.reject(new Error('People, Payroll and Compliance cannot be switched off.'))))} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Learning' }));
    expect((await screen.findAllByText(/cannot be switched off/)).length).toBeGreaterThan(0);
  });

  it('read-only without the settings key: no switches to use, no move buttons', () => {
    show(<ModulesScreen modules={ROWS} canEdit={false} live={live()} />);
    expect(screen.getByRole('switch', { name: 'Time & Leave' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Move/ })).toBeNull();
  });

  it('loading, error and no access', () => {
    const { rerender } = show(<ModulesScreen modules={[]} live={{ ...live(), state: 'error' }} />);
    expect(screen.getByText("We couldn't load the modules.")).toBeInTheDocument();
    rerender(<ToastProvider><ModulesScreen modules={[]} live={{ ...live(), state: 'no-access' }} /></ToastProvider>);
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
