import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssetAcknowledgePhone } from './assets';
import { WaitingDone } from './checklists';
import { ContactsDrawer } from './family';

// Founder rules (BUILD-STANDARD 2, 3): no greyed-out button, and "done" is a toast.
const ue = userEvent.setup();
const toastSays = async (text: string) => expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
const contact = (i: number) => ({ name: `Contact ${i}`, relation: 'Friend', phone: `98450${String(i).padStart(5, '0')}` });

describe('People: never a greyed-out button', () => {
  it('emergency contacts: a sixth contact is refused with the limit; below it a row is added', async () => {
    const { unmount } = render(<ContactsDrawer initial={[1, 2, 3, 4, 5].map(contact)} onSave={vi.fn()} onClose={vi.fn()} />);
    const add = screen.getByRole('button', { name: 'Add contact' });
    expect(add).toBeEnabled();
    await ue.click(add);
    await toastSays('You can keep at most 5 emergency contacts.');
    expect(screen.getAllByRole('textbox', { name: /Name/ })).toHaveLength(5);
    unmount();
    render(<ContactsDrawer initial={[contact(1)]} onSave={vi.fn()} onClose={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(screen.getAllByRole('textbox', { name: /Name/ })).toHaveLength(2);
  });

  it('a task waiting for an earlier step says so when pressed', async () => {
    render(<WaitingDone />);
    await ue.click(screen.getByRole('button', { name: 'Mark done' }));
    await toastSays('This task waits for an earlier step. Finish that first.');
  });
});

describe('People: done is a toast', () => {
  it('acknowledging an asset says so in a toast and leaves the date as a plain fact', async () => {
    render(<AssetAcknowledgePhone />);
    expect(screen.queryByText(/Acknowledged on/)).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Acknowledge receipt' }));
    await toastSays('Asset acknowledged');
    expect(screen.getByText(/Acknowledged on 29 Sep 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge receipt' })).toBeNull();
  });
});
