import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TestBuilderScreen } from './bank-tests';
import { BUILDER_TEST, liveBuilder } from './tests-live-samples';

// Answer 2307: while a fairness finding on the test is open, Restore asks why (at least 10 letters).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const ARCHIVED = { ...BUILDER_TEST, status: 'archived', editable: false };

describe('PRC-04 restore with an open fairness finding', () => {
  it('negative: no reason or a short one is a field error and nothing is sent', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined);
    wrap(<TestBuilderScreen live={liveBuilder({ onRestore, test: { ...ARCHIVED, restoreNeedsReason: true } })} />);
    await ue.click(screen.getByRole('button', { name: 'Restore' }));
    const d = screen.getByRole('dialog', { name: /Restore/ });
    await ue.click(within(d).getByRole('button', { name: 'Restore' }));
    expect(within(d).getByText('Say why in a sentence (at least 10 letters).')).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /Why restore it now/ }), 'too short');
    await ue.click(within(d).getByRole('button', { name: 'Restore' }));
    expect(onRestore).not.toHaveBeenCalled();
  });
  it('a reason of 10 letters or more is sent with the restore', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined);
    wrap(<TestBuilderScreen live={liveBuilder({ onRestore, test: { ...ARCHIVED, restoreNeedsReason: true } })} />);
    await ue.click(screen.getByRole('button', { name: 'Restore' }));
    const d = screen.getByRole('dialog', { name: /Restore/ });
    await ue.type(within(d).getByRole('textbox', { name: /Why restore it now/ }), 'Questions fixed and re-checked');
    await ue.click(within(d).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('Questions fixed and re-checked'));
  });
  it('with no open finding there is no reason field and none is sent', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined);
    wrap(<TestBuilderScreen live={liveBuilder({ onRestore, test: ARCHIVED })} />);
    await ue.click(screen.getByRole('button', { name: 'Restore' }));
    const d = screen.getByRole('dialog', { name: /Restore/ });
    expect(within(d).queryByRole('textbox')).toBeNull();
    await ue.click(within(d).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(undefined));
  });
});
