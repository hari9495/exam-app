import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { hiringSettingsPage, nycHint, type HiringSettingsData } from '../settings/hiring-live';
import { ApplicationDrawer } from './candidate-application';
import { sampleApplication } from './hir-05-candidate.stories';
import { CareersJobScreen } from '../portals/t9-candidate';
import { JOB_DETAIL } from '../portals/t9-cand-data';

// Answers 473 and 474 (New York City): the 6.1 hint, the candidate notice on the job page and apply form, and the
// request for another process on the recruiter's Application drawer. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.1')!;
const base = (values: Record<string, string>, nycLocations: string[]): HiringSettingsData => ({
  canEdit: true,
  people: [],
  values: { 'hiring.bias_audit.nyc': 'off', 'hiring.rediscovery.ai': 'off', 'hiring.notetaker.enabled': 'off', 'hiring.notetaker.ai_draft': 'off', ...values },
  defaults: { 'hiring.bias_audit.nyc': 'off' },
  choices: {},
  lastChange: null,
  pipelines: [],
  scorecards: [],
  nycLocations,
});

describe('6.1 hint when an AI tool is on with a New York City location (473)', () => {
  it('AI notes on and a NYC office with the switch off: the hint names both; shown on the field', () => {
    const data = base({ 'hiring.rediscovery.ai': 'on' }, ['New York office']);
    expect(nycHint(data)).toMatch(/^AI notes on past candidates is on and New York office is in New York City/);
    const f = hiringSettingsPage(design, data).sections.flatMap((s) => s.settings).find((d) => d.key === 'hire.bias_audit_nyc')!;
    expect(f.warning).toMatch(/turn this on/);
    expect(f.starter).toBe(false);
  });

  it('the AI draft counts only with the notetaker on; two places are listed', () => {
    expect(nycHint(base({ 'hiring.notetaker.ai_draft': 'on' }, ['New York office']))).toBeUndefined();
    expect(nycHint(base({ 'hiring.notetaker.enabled': 'on', 'hiring.notetaker.ai_draft': 'on' }, ['Brooklyn studio', 'Manhattan office']))).toMatch(/the AI draft scorecard is on and Brooklyn studio and Manhattan office are in New York City/i);
  });

  it('no hint: no AI tool, no NYC location, or the switch already on', () => {
    expect(nycHint(base({}, ['New York office']))).toBeUndefined();
    expect(nycHint(base({ 'hiring.rediscovery.ai': 'on' }, []))).toBeUndefined();
    expect(nycHint(base({ 'hiring.rediscovery.ai': 'on', 'hiring.bias_audit.nyc': 'on' }, ['New York office']))).toBeUndefined();
  });
});

describe('New York City candidate notice (474)', () => {
  const pdf = () => new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' });
  const live = (onSubmit: (a: unknown) => Promise<void>, toolNotice: { assesses: string[]; businessDays: number } | null) => ({
    allJobsHref: '/yx/careers/kaveri',
    apply: { upload: async () => undefined, onSubmit, resumeAccept: ['.pdf'], internationalPhone: true, toolNotice, notices: [{ purpose: 'application', text: 'We use your details for this job.', required: true }] },
  });
  const fill = async () => {
    await ue.type(screen.getByLabelText(/Full name/), 'Asha Rao');
    await ue.type(screen.getByLabelText(/^Email/), 'asha@example.com');
    await ue.type(screen.getByLabelText(/Mobile number/), '+1 212 555 0123');
    await ue.upload(document.querySelector('input[type="file"]') as HTMLInputElement, pdf());
    await ue.click(screen.getByRole('checkbox', { name: 'I have read this and agree.' }));
  };

  it('the job page says a tool is used, what it assesses and how to ask; asking sends the request', async () => {
    const onSubmit = vi.fn(async () => undefined);
    show(<CareersJobScreen tenant="Kaveri Foods" detail={{ ...JOB_DETAIL, closesOn: null }} today={new Date(2026, 10, 10)} live={live(onSubmit, { assesses: ['An AI draft of the interview scorecard'], businessDays: 10 })} />);
    const notice = screen.getByRole('region', { name: 'Automated tool notice' });
    expect(notice).toHaveTextContent('Kaveri Foods uses an automated tool for this job');
    expect(notice).toHaveTextContent('at least 10 business days before');
    expect(notice).toHaveTextContent('An AI draft of the interview scorecard');
    await fill();
    await ue.click(screen.getByRole('checkbox', { name: 'Assess me another way (no automated tool)' }));
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ alternativeProcess: true })));
  });

  it('not asked: no request is sent; a job with no notice shows neither the notice nor the choice', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const { unmount } = show(<CareersJobScreen tenant="Kaveri Foods" detail={{ ...JOB_DETAIL, closesOn: null }} today={new Date(2026, 10, 10)} live={live(onSubmit, { assesses: [], businessDays: 10 })} />);
    expect(screen.getByText('It helps us assess how your skills and experience match this job.')).toBeInTheDocument();
    await fill();
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ alternativeProcess: undefined })));
    unmount();
    show(<CareersJobScreen tenant="Kaveri Foods" detail={{ ...JOB_DETAIL, closesOn: null }} today={new Date(2026, 10, 10)} live={live(onSubmit, null)} />);
    expect(screen.queryByRole('region', { name: 'Automated tool notice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Assess me another way/ })).not.toBeInTheDocument();
  });

  it('the recruiter sees the request on the Application drawer; none when not asked', () => {
    const { unmount } = show(<ApplicationDrawer {...sampleApplication} app={{ ...sampleApplication.app!, alternativeRequestedAt: '2026-11-12T10:30:00+05:30' }} />);
    expect(screen.getByText('Asked for another process')).toBeInTheDocument();
    expect(screen.getByText(/12 Nov 2026/)).toBeInTheDocument();
    unmount();
    show(<ApplicationDrawer {...sampleApplication} />);
    expect(screen.queryByText('Asked for another process')).not.toBeInTheDocument();
  });
});
