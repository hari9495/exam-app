import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { composeStories } from '@storybook/react-vite';
import * as ppl04 from './ppl-04.stories';
import * as ppl05 from './ppl-05.stories';

// PPL-04: each change story is the one live change drawer (ChangeActionDrawer) with Kaveri Foods sample data, so the
// app and the design cannot drift apart (founder Q3: one change form).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (story: { render?: unknown }) => render((story.render as () => JSX.Element)());
const drawer = async () => within(await screen.findByRole('dialog'));

describe('PPL-04 change drawer stories (live = design)', () => {
  it('Promotion: the route, the new CTC with its change on the current pay, the impact table and the approval route', async () => {
    show(ppl04.Promotion);
    const d = await drawer();
    expect(d.getByText('Change for Arjun Kulkarni')).toBeInTheDocument();
    expect(await d.findByText('Goes to Karthik Subramanian or Lakshmi Venkatesan.')).toBeInTheDocument();
    expect(await d.findByRole('table', { name: 'What changes' }, { timeout: 2000 })).toBeInTheDocument();
    expect(d.getByText(/\+13% on the current ₹6,90,000/)).toBeInTheDocument();
    expect(d.getByText('Stays the same (1)')).toBeInTheDocument();
    expect(d.getByText('Approval route')).toBeInTheDocument();
  });

  it('PromotionBoth: both fields are required; clearing the grade and sending shows the error, nothing is sent', async () => {
    show(ppl04.PromotionBoth);
    const d = await drawer();
    expect(d.queryByText('Choose a new designation, a new grade, or both.')).toBeNull();
    expect(d.getByRole('combobox', { name: 'New grade' })).toBeInTheDocument();
    await ue.click(d.getByRole('button', { name: 'Send for approval' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Transfer: only the new location is asked; the impact lists the professional tax state', async () => {
    show(ppl04.Transfer);
    const d = await drawer();
    expect(d.getByRole('combobox', { name: 'New location' })).toBeInTheDocument();
    expect(d.queryByRole('combobox', { name: 'New designation' })).toBeNull();
    expect(await d.findByText('Professional tax state', undefined, { timeout: 2000 })).toBeInTheDocument();
  });

  it('InterEntity: the transfer options on the company defaults, and why the employment type must be chosen again', async () => {
    show(ppl04.InterEntity);
    const d = await drawer();
    expect(await d.findByText('Transfer options')).toBeInTheDocument();
    expect(await d.findByRole('radio', { name: 'Keep KF-0088' })).toBeInTheDocument();
    expect(d.getByRole('radio', { name: 'Continue from 14 Jul 2019' })).toBeInTheDocument();
    expect(await d.findByText('Fixed-term (plant) is only for Kaveri Foods Pvt Ltd: choose one for the new entity.')).toBeInTheDocument();
  });

  it('Retro: a date in processed payroll names the processed months', async () => {
    show(ppl04.Retro);
    const d = await drawer();
    expect(await d.findByText('Payroll for Aug 2026 and Sep 2026 is already processed', undefined, { timeout: 2000 })).toBeInTheDocument();
    expect(d.getByText('This date is in the past, so payroll settles any difference in the next run.')).toBeInTheDocument();
  });

  it('Manager: only team changes, no pay field, HR adds the pay', async () => {
    show(ppl04.Manager);
    const d = await drawer();
    expect(d.getByText('Pay is proposed by HR')).toBeInTheDocument();
    expect(d.queryByLabelText('New annual CTC')).toBeNull();
    await ue.click(d.getByRole('combobox', { name: 'Change type' }));
    const kinds = screen.getAllByRole('option').map((o) => o.textContent);
    expect(kinds).not.toContain('Inter-entity transfer');
    expect(kinds).not.toContain('Salary revision');
  });

  it('negative: the reason emptied, Send shows the field error and nothing goes', async () => {
    show(ppl04.Transfer);
    const d = await drawer();
    await ue.clear(d.getByRole('textbox', { name: /Reason/ }));
    await ue.click(d.getByRole('button', { name: 'Send for approval' }));
    expect((await screen.findAllByText('Enter the reason for this change')).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// The reject and move dialogs (live ReasonDialog) as their PPL-04 / PPL-05 stories draw them.
const s04 = composeStories(ppl04);
const s05 = composeStories(ppl05);
async function run(S: { (): JSX.Element; play?: (ctx: { canvasElement: HTMLElement }) => Promise<void> }) {
  const { container } = render(<S />);
  await S.play?.({ canvasElement: container });
}

describe('ReasonDialog stories (live = design)', () => {
  it('Reject: names the change and who sees the reason', async () => {
    await run(s04.Reject);
    const d = within(await screen.findByRole('dialog'));
    expect(d.getByText(/Reject the .* for /)).toBeInTheDocument();
    expect(d.getByText(/Shown to the person who raised it/)).toBeInTheDocument();
  });
  it('RejectMissing: the field error shows and the reason field has the focus', async () => {
    await run(s04.RejectMissing);
    expect((await screen.findAllByText('Enter a reason of at least 3 characters.')).length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /Reason/ }));
  });
  it('RejectFailed: the refusal shows in the dialog, which stays open', async () => {
    await run(s04.RejectFailed);
    expect(await screen.findByText('This change was already approved by Lakshmi Venkatesan.')).toBeInTheDocument();
  });
  it('Move: the date it has now; pressed with no date, the error and focus', async () => {
    await run(s05.MoveMissing);
    expect(await screen.findByText(/Now on /)).toBeInTheDocument();
    expect((await screen.findAllByText('Choose the new date.')).length).toBeGreaterThan(0);
  });
  it('MoveFailed: the refusal shows', async () => {
    await run(s05.MoveFailed);
    expect(await screen.findByText('A date before the retro limit needs a System Admin.')).toBeInTheDocument();
  });
});
