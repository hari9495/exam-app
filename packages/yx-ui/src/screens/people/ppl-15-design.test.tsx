import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import * as letters from './ppl-28.stories';
import * as journey from './ppl-13.stories';

// The design stories for the PPL-15 letter and checklist states show what the live app shows (live = design).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (story: { render?: unknown }) => render((story.render as () => JSX.Element)());

describe('PPL-28 / PPL-13 design stories for PPL-15', () => {
  it('the register shows a draft, a discarded draft, and a letter that couldn’t be made with its banner', async () => {
    show(letters.LiveDrafts);
    expect(within(screen.getByRole('row', { name: /Tarun Sample/ })).getByText('Draft')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Ilango Sample/ })).getByText('Discarded')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Malar Sample/ })).getByText("Couldn't be made")).toBeInTheDocument();
    expect(screen.getByText(/A letter couldn't be made/)).toBeInTheDocument();
    await ue.click(within(screen.getByRole('row', { name: /Tarun Sample/ })).getByRole('button', { name: /More actions/ }));
    expect(await screen.findByRole('menuitem', { name: 'Review and issue' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Discard draft' })).toBeInTheDocument();
  });

  it('the cancelled and not-joined checklist headers', () => {
    const { unmount } = show(journey.Cancelled);
    expect(screen.getByText('Cancelled: reneged')).toBeInTheDocument();
    unmount();
    show(journey.WasDue);
    expect(screen.getByText(/was due to join 25 Oct 2026 \(2 days ago\)/)).toBeInTheDocument();
  });
});
