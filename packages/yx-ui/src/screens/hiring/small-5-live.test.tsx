import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ApplicationDrawer } from './candidate-application';
import { sampleApplication } from './hir-05-candidate.stories';
import { ApplicationStatusScreen } from '../portals/t9-09-candidate-pages';
import { APP_STATUS, CAND_BRAND } from '../portals/t9-cand-pages-data';

// Answer 502: a New York City candidate added by a recruiter is emailed the notice; they ask for another process from
// their status page, or the recruiter records it. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const NOTICE = { assesses: ['An AI draft of the interview scorecard'], businessDays: 10 };

describe('Status page: the notice and "Assess me another way" (502)', () => {
  it('shows the notice; asking sends it and toasts; once asked, it says when', async () => {
    const onAsk = vi.fn(async () => undefined);
    const { unmount } = show(<ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, toolNotice: { ...NOTICE, requestedAt: null } }} onAskAlternative={onAsk} />);
    expect(screen.getByRole('region', { name: 'Automated tool notice' })).toHaveTextContent('at least 10 business days');
    await ue.click(screen.getByRole('button', { name: 'Assess me another way' }));
    expect(onAsk).toHaveBeenCalled();
    expect((await screen.findAllByText('Request sent')).length).toBeGreaterThan(0);
    unmount();
    show(<ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, toolNotice: { ...NOTICE, requestedAt: new Date(2026, 10, 12) } }} onAskAlternative={onAsk} />);
    expect(screen.getByText('You asked for another process')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assess me another way' })).not.toBeInTheDocument();
  });

  it('a refusal shows its words; no notice: neither the notice nor the button', async () => {
    const onAsk = vi.fn(async () => {
      throw new Error('No automated tool is used for this job, so there is nothing to ask for.');
    });
    const { unmount } = show(<ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, toolNotice: { ...NOTICE, requestedAt: null } }} onAskAlternative={onAsk} />);
    await ue.click(screen.getByRole('button', { name: 'Assess me another way' }));
    expect(await screen.findByText(/nothing to ask for/)).toBeInTheDocument();
    unmount();
    show(<ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={APP_STATUS} onAskAlternative={onAsk} />);
    expect(screen.queryByRole('region', { name: 'Automated tool notice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assess me another way' })).not.toBeInTheDocument();
  });
});

describe('Application drawer: record a request for another process (502)', () => {
  it('the recruiter records it where the notice applies; read-only, no notice or already asked: no button', async () => {
    const onRecord = vi.fn(async () => undefined);
    const app = { ...sampleApplication.app!, toolNotice: true };
    const { unmount } = show(<ApplicationDrawer {...sampleApplication} app={app} onRecordAlternative={onRecord} />);
    await ue.click(screen.getByRole('button', { name: 'Record: asked for another process' }));
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
    expect((await screen.findAllByText('Request recorded')).length).toBeGreaterThan(0);
    unmount();
    for (const props of [{ canManage: false, app }, { app: { ...app, toolNotice: false } }, { app: { ...app, alternativeRequestedAt: '2026-11-12T10:30:00+05:30' } }]) {
      const r = show(<ApplicationDrawer {...sampleApplication} {...props} onRecordAlternative={onRecord} />);
      expect(screen.queryByRole('button', { name: 'Record: asked for another process' })).not.toBeInTheDocument();
      r.unmount();
    }
  });
});

describe('Application drawer: send the New York City notice (531)', () => {
  it('shows for a hand-added candidate never told; sending toasts; refusal shows its words; no button otherwise', async () => {
    const onSend = vi.fn(async () => undefined);
    const app = { ...sampleApplication.app!, toolNotice: true, toolNoticeNeeded: true };
    const { unmount } = show(<ApplicationDrawer {...sampleApplication} app={app} onRecordAlternative={async () => {}} onSendToolNotice={onSend} />);
    expect(screen.getByText('Not told yet')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send the New York City notice' }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect((await screen.findAllByText('Notice sent')).length).toBeGreaterThan(0);
    unmount();
    const refused = vi.fn(async () => {
      throw new Error('This candidate was already sent the New York City notice.');
    });
    const second = show(<ApplicationDrawer {...sampleApplication} app={app} onRecordAlternative={async () => {}} onSendToolNotice={refused} />);
    await ue.click(screen.getByRole('button', { name: 'Send the New York City notice' }));
    await waitFor(() => expect(refused).toHaveBeenCalled());
    expect(await screen.findByText(/already sent the New York City notice/)).toBeInTheDocument();
    second.unmount();
    for (const props of [{ canManage: false, app }, { app: { ...app, toolNoticeNeeded: false } }, { app: { ...app, toolNotice: false } }]) {
      const r = show(<ApplicationDrawer {...sampleApplication} {...props} onRecordAlternative={async () => {}} onSendToolNotice={onSend} />);
      expect(screen.queryByRole('button', { name: 'Send the New York City notice' })).not.toBeInTheDocument();
      r.unmount();
    }
  });
});
