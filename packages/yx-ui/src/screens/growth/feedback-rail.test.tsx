import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { FeedbackRail, PrivateNotesDrawer, type LivePersonNotes } from './feedback-rail';

// Batch F item 32 (answer 2577): quick actions and private notes (the author alone).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const NOTES = [{ id: 'n1', text: 'Led the line 3 audit.', createdAt: '2026-09-21T05:00:00Z', updatedAt: '2026-09-21T05:00:00Z' }];
const live = (o: Partial<LivePersonNotes> = {}): LivePersonNotes => ({ people: [{ id: 'm', name: 'Meera Iyer' }], load: vi.fn(async () => NOTES), onAdd: vi.fn(async () => ({})), onEdit: vi.fn(async () => ({})), onDelete: vi.fn(async () => ({})), defaultPerson: 'm', ...o });

describe('FeedbackRail and PrivateNotesDrawer', () => {
  it('quick actions call their handlers; Plan a 1:1 is a link', async () => {
    const onPraise = vi.fn();
    const onNotes = vi.fn();
    render(<FeedbackRail onPraise={onPraise} onSuggest={vi.fn()} onNotes={onNotes} oneOnOneHref="/yx/performance/one-on-ones" />);
    await ue.click(screen.getByRole('button', { name: 'Give praise' }));
    await ue.click(screen.getByRole('button', { name: 'Private notes' }));
    expect(onPraise).toHaveBeenCalled();
    expect(onNotes).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Plan a 1:1' })).toHaveAttribute('href', '/yx/performance/one-on-ones');
  });

  it('loads my notes about the colleague; Add note pressed empty says so; then adds with a toast and reloads', async () => {
    const l = live();
    render(<ToastProvider><PrivateNotesDrawer open onClose={vi.fn()} live={l} /></ToastProvider>);
    expect(await screen.findByText('Led the line 3 audit.')).toBeInTheDocument();
    expect(l.load).toHaveBeenCalledWith('m');
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add note' }));
    expect(await within(d).findByText('Write the note first.')).toBeInTheDocument();
    expect(l.onAdd).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /New note/ }), 'Wants automation work.');
    await ue.click(within(d).getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(l.onAdd).toHaveBeenCalledWith('m', 'Wants automation work.'));
    expect((await screen.findAllByText('Note saved. Only you can see it.')).length).toBeGreaterThan(0);
    expect(l.load).toHaveBeenCalledTimes(2);
  });

  it('changes and deletes a note (delete asks first)', async () => {
    const l = live();
    render(<ToastProvider><PrivateNotesDrawer open onClose={vi.fn()} live={l} /></ToastProvider>);
    await screen.findByText('Led the line 3 audit.');
    await ue.click(screen.getByRole('button', { name: 'Change' }));
    const box = screen.getByRole('textbox', { name: /Change the note/ });
    await ue.clear(box);
    await ue.type(box, 'Led two audits.');
    await ue.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() => expect(l.onEdit).toHaveBeenCalledWith('n1', 'Led two audits.'));
    await ue.click(screen.getByRole('button', { name: 'Delete' }));
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Delete note' }));
    await waitFor(() => expect(l.onDelete).toHaveBeenCalledWith('n1'));
  });

  it('negative: with nobody chosen there is no Add note; a refusal shows why', async () => {
    const { unmount } = render(<ToastProvider><PrivateNotesDrawer open onClose={vi.fn()} live={live({ defaultPerson: undefined })} /></ToastProvider>);
    expect(screen.getByText('Choose a colleague')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    unmount();
    render(<ToastProvider><PrivateNotesDrawer open onClose={vi.fn()} live={live({ onAdd: vi.fn(async () => { throw new Error('Notes are about colleagues, not about yourself.'); }) })} /></ToastProvider>);
    await screen.findByText('Led the line 3 audit.');
    await ue.type(screen.getByRole('textbox', { name: /New note/ }), 'x');
    await ue.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Notes are about colleagues, not about yourself.')).toBeInTheDocument();
  });
});
