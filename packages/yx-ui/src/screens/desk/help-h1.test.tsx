import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { HelpDrawer, type HelpDrawerProps } from './help';
import { MY_ROWS, RAISE_DESKS } from './data';
import { pagesOf, pagesProblem } from '../ops/helpdesk-kb-live';

// Help and onboarding H-1 (answers 941, 942): one Help drawer with This page, Ask, What's new and Tours. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ARTICLES = [
  { id: 'k1', number: 41, title: 'How leave is counted', summary: 'Half days and weekly offs.' },
  { id: 'k2', number: 44, title: 'Apply leave in 90 seconds', summary: null },
];
const drawer = (over: Partial<HelpDrawerProps> = {}) =>
  render(
    <ToastProvider>
      <HelpDrawer open onOpenChange={() => {}} desks={[RAISE_DESKS[0]!]} tickets={MY_ROWS} banners={[]} onMeToo={vi.fn()} onRaise={vi.fn().mockResolvedValue({ id: 'n', number: 'IT-1' })} ticketHref={(id) => `/yx/desk/help/${id}`} articleHref={(a) => `/yx/desk/help?article=${a.number}`} {...over} />
    </ToastProvider>,
  );

describe('H-1: one Help drawer', () => {
  it('opens on This page with the articles for the page; Ask has the ticket form and its button', async () => {
    drawer({ pageHelp: { state: 'ready', articles: ARTICLES } });
    expect(screen.getByRole('tab', { name: 'This page', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How leave is counted' })).toHaveAttribute('href', '/yx/desk/help?article=41');
    expect(screen.getByText('Half days and weekly offs.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Raise ticket' })).toBeNull();
    await ue.click(screen.getByRole('tab', { name: 'Ask' }));
    expect(screen.getByRole('textbox', { name: /Subject/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raise ticket' })).toBeInTheDocument();
  });

  it('no help written for the page: it says so and "Ask a team" opens Ask', async () => {
    drawer({ pageHelp: { state: 'ready', articles: [] } });
    // Nothing to read: it opens on Ask; This page still says so.
    expect(screen.getByRole('tab', { name: 'Ask', selected: true })).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'This page' }));
    expect(screen.getByText('No help is written for this page yet.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Ask a team' }));
    expect(screen.getByRole('tab', { name: 'Ask', selected: true })).toBeInTheDocument();
  });

  it('negative: page help off (or not given) hides This page; What’s new and Tours hide until they have content', () => {
    drawer({ pageHelp: null });
    expect(screen.queryByRole('tab', { name: 'This page' })).toBeNull();
    expect(screen.queryByRole('tab', { name: "What's new" })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Tours' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Ask', selected: true })).toBeInTheDocument();
  });

  it('What’s new and Tours show their content when given (H-4, H-5)', async () => {
    drawer({ whatsNew: <p>Fix a missed punch</p>, tours: <p>Employee tour</p> });
    await ue.click(screen.getByRole('tab', { name: "What's new" }));
    expect(screen.getByText('Fix a missed punch')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Tours' }));
    expect(screen.getByText('Employee tour')).toBeInTheDocument();
  });

  it('negative: page help that failed to load says so', () => {
    drawer({ pageHelp: { state: 'error', articles: [] }, defaultTab: 'page' });
    expect(screen.getByText('Help for this page could not be loaded.')).toBeInTheDocument();
  });
});
// The Show page help switch moved to the knowledge base Settings tab (answer 1841): helpdesk-kb-live.test.tsx.
