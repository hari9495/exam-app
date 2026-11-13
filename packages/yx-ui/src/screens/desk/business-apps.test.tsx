import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { BusinessAppsScreen, type BusinessApp } from './business-apps';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const APPS: BusinessApp[] = [
  { id: 'a1', name: 'Tally Prime', description: 'Accounts', ownerUserId: 'u1', owner: 'Meera Iyer', status: 'active', version: 2, canEdit: true },
  { id: 'a4', name: 'Old intranet', description: null, ownerUserId: 'u2', owner: 'Farah Khan', status: 'retired', version: 4, canEdit: true },
];
const people = async () => [{ id: 'u3', label: 'Arjun Kulkarni', detail: 'Sales' }];
const show = (over: Partial<React.ComponentProps<typeof BusinessAppsScreen>> = {}) =>
  render(
    <ToastProvider>
      <BusinessAppsScreen state="ready" apps={APPS} canEdit onSave={vi.fn().mockResolvedValue(undefined)} onPickPeople={people} {...over} />
    </ToastProvider>,
  );

describe('business applications (Helpdesk plan item 3)', () => {
  it('lists applications in use with their owners, and the retired ones apart', () => {
    show();
    expect(within(screen.getByRole('list', { name: 'Applications' })).getByText('Owner: Meera Iyer · Accounts')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Retired applications' })).getByText('Old intranet')).toBeInTheDocument();
  });

  it('1894: an owner who has left is flagged with what to do; others are not', () => {
    show({ apps: [{ ...APPS[0], ownerLeft: true }, { ...APPS[0], id: 'a2', name: 'Salesforce', owner: 'Arjun Kulkarni', ownerLeft: false }, APPS[1]] });
    const list = screen.getByRole('list', { name: 'Applications' });
    expect(within(list).getAllByText('Owner has left')).toHaveLength(1);
    expect(within(list).getByText(/Owner: Meera Iyer · choose a new owner; the IT desk admins decide requests until then/)).toBeInTheDocument();
    expect(within(list).getByText('Owner: Arjun Kulkarni · Accounts')).toBeInTheDocument();
  });

  it('1894 negative: a retired application is never flagged, even if its owner left', () => {
    show({ apps: [{ ...APPS[1], ownerLeft: true }] });
    expect(screen.queryByText('Owner has left')).toBeNull();
    expect(screen.queryByText(/choose a new owner/)).toBeNull();
  });

  it('a new application: nothing filled is stopped; with a name and an owner it is saved with a toast', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show({ onSave });
    await ue.click(screen.getByRole('button', { name: 'New application' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save application' }));
    expect(within(dialog).getByText('Name the application.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose its owner.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Salesforce');
    await ue.click(within(dialog).getByRole('combobox', { name: 'Owner' }));
    await ue.click(await screen.findByRole('option', { name: /Arjun Kulkarni/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Save application' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null, { name: 'Salesforce', description: null, ownerUserId: 'u3', status: 'active' }));
    expect((await screen.findAllByText('Application added.')).length).toBeGreaterThan(0);
  });

  it('retiring an application sends its version; without the right there is no New or Edit', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { unmount } = show({ onSave });
    await ue.click(screen.getByRole('button', { name: 'Edit Tally Prime' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('radio', { name: 'No, retired' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Save application' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('a1', expect.objectContaining({ status: 'retired', version: 2, ownerUserId: 'u1' })));
    unmount();
    show({ canEdit: false });
    expect(screen.queryByRole('button', { name: 'New application' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Tally Prime' })).toBeNull();
  });

  it('a refused save stays in the dialog with the reason', async () => {
    show({ onSave: vi.fn().mockRejectedValue(new Error('An application with that name is already on the list.')), start: { edit: 'a1' } });
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save application' }));
    expect(await within(dialog).findByText('An application with that name is already on the list.')).toBeInTheDocument();
  });
});
