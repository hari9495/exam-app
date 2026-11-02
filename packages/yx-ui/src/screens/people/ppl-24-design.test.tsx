import { composeStories } from '@storybook/react-vite';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as ppl24 from './ppl-24.stories';

// PPL-24 start and dispatch-proof dialogs: the stories are the live dialogs with sample data.
const s = composeStories(ppl24);
type Story = { (): JSX.Element; play?: (ctx: { canvasElement: HTMLElement }) => Promise<void> };
async function show(S: Story) {
  const { container } = render(<S />);
  await S.play?.({ canvasElement: container });
}

describe('PPL-24 dialog stories (live = design)', () => {
  it('Start: says what the timeline does', async () => {
    await show(s.Start as Story);
    expect(await screen.findByText(/the salary hold, two notices, then deemed abandonment/)).toBeInTheDocument();
  });
  it('StartMissing: both fields say what is missing; the person field has the focus', async () => {
    await show(s.StartMissing as Story);
    expect((await screen.findAllByText('Choose the person.')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Choose the last day present.')).length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Person' }));
  });
  it('StartFailed: the refusal stays in the dialog', async () => {
    await show(s.StartFailed as Story);
    expect(await screen.findByText('A timeline is already running for this person.')).toBeInTheDocument();
  });
  it('DispatchProofMissing and Failed', async () => {
    await show(s.DispatchProofMissing as Story);
    expect((await screen.findAllByText(/Enter the article number/)).length).toBeGreaterThan(0);
  });
  it('DispatchProofFailed', async () => {
    await show(s.DispatchProofFailed as Story);
    expect(await screen.findByText('This timeline changed meanwhile. Reload it.')).toBeInTheDocument();
  });
  it('StopDialog: the live stop dialog with the reason filled', async () => {
    await show(s.StopDialog as Story);
    expect(await screen.findByRole('button', { name: 'Stop timeline' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Reason/ })).toHaveValue('Returned on 1 Oct with a hospital discharge summary.');
  });
});
