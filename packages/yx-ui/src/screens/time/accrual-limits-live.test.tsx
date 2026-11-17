import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { LeaveTypeEditorScreen } from './leave-admin';
import { TIME_SETUP } from './live/fixtures';

// Answer 2342 (Oracle O11): "No credit for the first (months after joining)" on the leave type, default 0.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('TIM-27 no credit for the first months', () => {
  it('shows 0 by default and saves the months typed', async () => {
    const live = { state: 'ready' as const, data: TIME_SETUP, typeId: 'el', policiesHref: '/yx/time/setup', onSaveType: vi.fn(async () => ({ id: 'el' })), onAdded: vi.fn() };
    wrap(<LeaveTypeEditorScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: 'Rules' }));
    const f = screen.getByLabelText(/^No credit for the first/);
    expect(f).toHaveValue('0');
    await ue.clear(f);
    await ue.type(f, '3');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(live.onSaveType).toHaveBeenCalledWith('el', expect.objectContaining({ rules: expect.objectContaining({ accrualWaitMonths: 3 }) })));
  });
  it('the design story has the field on the Rules section', () => {
    wrap(<LeaveTypeEditorScreen section="rules" />);
    expect(screen.getByText(/No credit for the first/)).toBeInTheDocument();
  });
});
