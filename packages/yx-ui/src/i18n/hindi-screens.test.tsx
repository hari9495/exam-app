import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { YxI18nProvider } from './index';
import { RoleHomeScreen } from '../screens/platform-a/shell-home';
import { ApprovalsInboxScreen } from '../screens/platform-a/inbox';
import { APPROVALS, SENT_BY_ME } from '../screens/platform-a/platform-data';
import { PayslipViewerScreen } from '../screens/pay/employee-pay';
import { DETAIL, MY_PAYSLIPS, PREVIOUS } from '../screens/pay/live/fixtures-5j';
import { HelpCentreScreen } from '../screens/ops/helpdesk';
import { liveHelp } from '../screens/ops/helpdesk-live-samples';
import { NotificationCentre } from '../components/notify';

// T2-G 84b (answer 2743): the self-service pages in Hindi for a Hindi reader; English without the provider (English
// readers, and every page not yet in Hindi). Positive and negative per page.
const hi = (ui: ReactElement) => render(<YxI18nProvider locale="hi">{ui}</YxI18nProvider>);

describe('Home', () => {
  const live = { firstName: 'Arjun', company: 'Kaveri Foods', today: new Date(2026, 8, 29, 9, 0), approvalsHref: '/yx/approvals', off: [], tasks: [] } as never;
  it('a Hindi reader: greeting, cards, empty texts and the action list in Hindi', () => {
    hi(<RoleHomeScreen persona="employee" data={{ actions: [] }} live={live} />);
    expect(screen.getByRole('heading', { name: 'सुप्रभात, Arjun' })).toBeInTheDocument();
    expect(screen.getByText('इस हफ़्ते कौन छुट्टी पर है')).toBeInTheDocument();
    expect(screen.getByText('इस हफ़्ते आपकी टीम में कोई छुट्टी पर नहीं है।')).toBeInTheDocument();
    expect(screen.getAllByText('अभी आपके लिए कोई काम नहीं है।').length).toBeGreaterThan(0);
  });
  it('negative: English without the provider', () => {
    render(<RoleHomeScreen persona="employee" data={{ actions: [] }} live={live} />);
    expect(screen.getByRole('heading', { name: 'Good morning, Arjun' })).toBeInTheDocument();
    expect(screen.getByText("Who's off this week")).toBeInTheDocument();
    expect(screen.getByText('Nothing needs your action.')).toBeInTheDocument();
  });
});

describe('Approvals', () => {
  it('a Hindi reader: title, tabs and column headers in Hindi', () => {
    hi(<ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={[]} />);
    expect(screen.getByRole('heading', { name: 'अनुमोदन', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /मेरे लिए रुके/ })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader', { name: /अनुरोध करने वाले/ }).length).toBeGreaterThan(0);
  });
  it('negative: English without the provider', () => {
    render(<ApprovalsInboxScreen waiting={APPROVALS} sent={SENT_BY_ME} history={[]} />);
    expect(screen.getByRole('heading', { name: 'Approvals', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Waiting for me/ })).toBeInTheDocument();
  });
});

describe('My payslips', () => {
  const live = { state: 'ready' as const, payslips: MY_PAYSLIPS, onOpen: async (id: string) => (id === 's0' ? PREVIOUS : DETAIL), onPdf: vi.fn(), onQuery: vi.fn() };
  it('a Hindi reader: buttons and cards in Hindi; amounts stay in Indian figures', async () => {
    hi(<PayslipViewerScreen live={live} />);
    expect(screen.getByRole('button', { name: /सवाल पूछें/ })).toBeInTheDocument();
    expect(await screen.findByText('साल में अब तक')).toBeInTheDocument();
    expect(screen.getAllByText(/₹/).length).toBeGreaterThan(0);
  });
  it('negative: English without the provider', async () => {
    render(<PayslipViewerScreen live={live} />);
    expect(screen.getByRole('button', { name: /Raise a query/ })).toBeInTheDocument();
    expect(await screen.findByText('Year to date')).toBeInTheDocument();
  });
});

describe('Help centre (my tickets)', () => {
  it('a Hindi reader: title, cards and the ticket lines in Hindi', () => {
    hi(<HelpCentreScreen live={liveHelp()} />);
    expect(screen.getByRole('heading', { name: 'सहायता केंद्र', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'मेरे टिकट' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /टिकट दर्ज करें/ }).length).toBeGreaterThan(0);
  });
  it('negative: English without the provider', () => {
    render(<HelpCentreScreen live={liveHelp()} />);
    expect(screen.getByRole('heading', { name: 'Help centre', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'My tickets' })).toBeInTheDocument();
  });
});

describe('The bell', () => {
  const items = [{ id: 'n1', actor: { name: 'Divya' }, text: 'Leave approved', at: new Date(), read: false }];
  it('a Hindi reader: the bell and its panel in Hindi', async () => {
    hi(<NotificationCentre items={items} onMarkAllRead={() => undefined} />);
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'सूचनाएँ, 1 बिना पढ़ी' }));
    expect(screen.getByRole('button', { name: 'सब पढ़ी हुई मानें' })).toBeInTheDocument();
    expect(screen.getByText('आज')).toBeInTheDocument();
  });
  it('negative: English without the provider', () => {
    render(<NotificationCentre items={items} onMarkAllRead={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
  });
});
