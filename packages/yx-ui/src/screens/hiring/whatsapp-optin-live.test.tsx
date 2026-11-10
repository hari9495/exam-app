import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CareersJobScreen } from '../portals/t9-candidate';
import { JOB_DETAIL } from '../portals/t9-cand-data';
import { ApplicationStatusScreen } from '../portals/t9-09-candidate-pages';
import { APP_STATUS, CAND_BRAND } from '../portals/t9-cand-pages-data';

// Answer 561: "Message me on WhatsApp about jobs" on the apply form (off by default) and the status page (tick and
// untick). Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const pdf = () => new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' });
const job = (onSubmit: (a: unknown) => Promise<void>, whatsappTick = true) => (
  <CareersJobScreen
    tenant="Kaveri Foods"
    detail={{ ...JOB_DETAIL, closesOn: null }}
    today={new Date(2026, 10, 10)}
    live={{ allJobsHref: '/yx/careers/kaveri', apply: { upload: async () => undefined, onSubmit, resumeAccept: ['.pdf'], whatsappTick, notices: [{ purpose: 'application', text: 'We use your details for this job.', required: true }] } }}
  />
);
const fill = async () => {
  await ue.type(screen.getByLabelText(/Full name/), 'Asha Rao');
  await ue.type(screen.getByLabelText(/^Email/), 'asha@example.com');
  await ue.type(screen.getByLabelText(/Mobile number/), '9876543210');
  await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, pdf());
  await ue.click(screen.getByRole('checkbox', { name: 'I have read this and agree.' }));
};

describe('Apply form: the WhatsApp tick (561)', () => {
  it('is off by default: an unticked application asks for nothing', async () => {
    const onSubmit = vi.fn(async () => undefined);
    show(job(onSubmit));
    expect(screen.getByRole('checkbox', { name: /Message me on WhatsApp about jobs/ })).not.toBeChecked();
    await fill();
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ whatsappOptIn: undefined })));
  });

  it('ticked: the application carries the opt-in', async () => {
    const onSubmit = vi.fn(async () => undefined);
    show(job(onSubmit));
    await fill();
    await ue.click(screen.getByRole('checkbox', { name: /Message me on WhatsApp about jobs/ }));
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ whatsappOptIn: true })));
  });

  it('not offered: no tick', () => {
    show(job(vi.fn(async () => undefined), false));
    expect(screen.queryByRole('checkbox', { name: /WhatsApp/ })).not.toBeInTheDocument();
  });
});

describe('Status page: the WhatsApp tick (561)', () => {
  it('unticks to stop and ticks to start, with a toast each time', async () => {
    const onWhatsapp = vi.fn(async () => undefined);
    const { unmount } = show(<ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, whatsapp: { optedIn: true, hasPhone: true } }} onWhatsapp={onWhatsapp} />);
    await ue.click(screen.getByRole('checkbox', { name: 'Message me on WhatsApp about jobs' }));
    expect(onWhatsapp).toHaveBeenCalledWith(false);
    expect(await screen.findByText('WhatsApp messages off')).toBeInTheDocument();
    unmount();
    show(<ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, whatsapp: { optedIn: false, hasPhone: true } }} onWhatsapp={onWhatsapp} />);
    await ue.click(screen.getByRole('checkbox', { name: 'Message me on WhatsApp about jobs' }));
    expect(onWhatsapp).toHaveBeenLastCalledWith(true);
    expect(await screen.findByText('WhatsApp messages on')).toBeInTheDocument();
  });

  it('a refusal shows on the page; no mobile number: no tick, it says why', async () => {
    const { unmount } = show(<ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, whatsapp: { optedIn: false, hasPhone: true } }} onWhatsapp={vi.fn(async () => Promise.reject(new Error('Too many tries in a short time.')))} />);
    await ue.click(screen.getByRole('checkbox', { name: 'Message me on WhatsApp about jobs' }));
    expect(await screen.findByText('Too many tries in a short time.')).toBeInTheDocument();
    unmount();
    show(<ApplicationStatusScreen brand={CAND_BRAND} state="ready" status={{ ...APP_STATUS, whatsapp: { optedIn: false, hasPhone: false } }} onWhatsapp={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByText(/no mobile number for you/)).toBeInTheDocument();
  });
});
