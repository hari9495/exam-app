import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SETTINGS_GROUPS } from './settings-groups';
import { EventEmailSheet, SenderAddressSheet, hiringEmailsPage } from './hiring-emails';

// Settings 5.4 › Hiring emails (answer 2429): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '5.4')!;
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('hiringEmailsPage', () => {
  it('fills the designed lists with the company rows, before Digests; a list the viewer may not read is left out', () => {
    const live = { ...design, sections: design.sections.filter((s) => s.title !== 'Hiring emails') };
    const page = hiringEmailsPage(live, design, {
      senders: [{ id: 's1', label: 'Careers', address: 'careers@x.in', isDefault: true }],
      interview: [{ eventType: 'invite', subject: null, body: null, enabled: true, defaultSubject: 'Interview invitation', defaultBody: 'Hi' }, { eventType: 'cancellation', subject: 'Cancelled', body: 'Sorry', enabled: false }],
    });
    const sec = page.sections.find((s) => s.title === 'Hiring emails')!;
    expect(sec.settings.map((d) => d.key)).toEqual(['ntf.sender_addresses', 'ntf.interview_emails']);
    expect(sec.settings[0]!.rows).toEqual([['Careers', 'careers@x.in', 'Yes']]);
    expect(sec.settings[1]!.rows).toEqual([['Invitation to the candidate', 'Interview invitation', 'Standard'], ['Interview cancelled', 'Cancelled', 'Yours, turned off']]);
    expect(page.sections.findIndex((s) => s.title === 'Hiring emails')).toBe(page.sections.findIndex((s) => s.title === 'Digests and quiet hours') - 1);
    expect(hiringEmailsPage(live, design, {}).sections.some((s) => s.title === 'Hiring emails')).toBe(false);
  });
});

describe('SenderAddressSheet', () => {
  it('adds an address with a toast; a missing name or a bad address saves nothing and focuses the field', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    const onClose = vi.fn();
    wrap(<SenderAddressSheet sender={null} canEdit onSave={onSave} onClose={onClose} />);
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save address' }));
    expect(within(d).getByText('Enter the name candidates see.')).toBeInTheDocument();
    await waitFor(() => expect(within(d).getByLabelText(/^Name/)).toHaveFocus());
    await ue.type(within(d).getByLabelText(/^Name/), 'Careers');
    await ue.type(within(d).getByLabelText(/^Address/), 'not-an-email');
    await ue.click(within(d).getByRole('button', { name: 'Save address' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(d).getByText('Enter an email address, like careers@yourcompany.in.')).toBeInTheDocument();
    await ue.clear(within(d).getByLabelText(/^Address/));
    await ue.type(within(d).getByLabelText(/^Address/), 'careers@kaveri.in');
    await ue.click(within(d).getByRole('checkbox', { name: /Use when the recruiter/ }));
    await ue.click(within(d).getByRole('button', { name: 'Save address' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null, { label: 'Careers', address: 'careers@kaveri.in', isDefault: true }));
    expect((await screen.findAllByText('Sender address saved')).length).toBeGreaterThan(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('a refused save stays open with the reason; view only has Close only', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('That address is already listed.'));
    const { unmount } = wrap(<SenderAddressSheet sender={{ id: 's1', label: 'Careers', address: 'careers@x.in', isDefault: false }} canEdit onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save address' }));
    expect(await screen.findByText('That address is already listed.')).toBeInTheDocument();
    unmount();
    wrap(<SenderAddressSheet sender={{ id: 's1', label: 'Careers', address: 'careers@x.in', isDefault: false }} canEdit={false} onClose={vi.fn()} />);
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByRole('button', { name: 'Save address' })).toBeNull();
    expect(within(d).queryByRole('button', { name: 'Delete address' })).toBeNull();
  });
});

describe('EventEmailSheet', () => {
  it('starts from the standard wording and saves the company copy; an emptied subject is refused', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    wrap(<EventEmailSheet kind="interview" email={{ eventType: 'invite', subject: null, body: null, enabled: true, defaultSubject: 'Invitation', defaultBody: 'Hi {{candidateName}}' }} canEdit onSave={onSave} onClose={vi.fn()} />);
    const d = await screen.findByRole('dialog', { name: /Invitation to the candidate/ });
    expect(within(d).getByLabelText(/^Subject/)).toHaveValue('Invitation');
    await ue.clear(within(d).getByLabelText(/^Subject/));
    await ue.click(within(d).getByRole('button', { name: 'Save wording' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(within(d).getByText('Enter the subject.')).toBeInTheDocument();
    await ue.type(within(d).getByLabelText(/^Subject/), 'You are invited');
    await ue.click(within(d).getByRole('button', { name: 'Save wording' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('invite', { subject: 'You are invited', body: 'Hi {{candidateName}}', enabled: true }));
    expect((await screen.findAllByText('Email wording saved')).length).toBeGreaterThan(0);
  });

  it('an approval email with no standard text starts empty and says the standard email is sent until then', async () => {
    wrap(<EventEmailSheet kind="approval" email={{ eventType: 'approval.approved', subject: null, body: null, enabled: true }} canEdit onSave={vi.fn()} onClose={vi.fn()} />);
    const d = await screen.findByRole('dialog', { name: /Approved/ });
    expect(within(d).getByText('The standard email is sent until you write your own.')).toBeInTheDocument();
    expect(within(d).getByLabelText(/^Message/)).toHaveValue('');
  });
});
