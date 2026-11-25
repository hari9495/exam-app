import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TalentCrmScreen, type LiveCrm, type LiveTalentCrm } from './hiring-offers';
import { CandidateRecordScreen, type LiveCandidateRecord } from './hiring-pipeline';
import type { CandidateProfileView } from './live/types';

// HIR-20 campaigns, the sequence builder, the engagement timeline and sourced profiles; HIR-05 under 18. The designed
// screens with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const lastDialog = async () => (await screen.findAllByRole('dialog')).at(-1)!;
const toasted = async (t: string | RegExp) => expect((await screen.findAllByText(t)).length).toBeGreaterThan(0);

const crmPart = (over: Partial<LiveCrm> = {}): LiveCrm => ({
  today: new Date('2026-11-10T06:00:00Z'),
  campaigns: {
    state: 'ready',
    onRetry: vi.fn(),
    campaigns: [
      { id: 'k1', name: 'Java 2027 nurture', channel: 'email', audience: 'QA silver medallists', status: 'running', stopOnReply: true, steps: [{ id: 's0', kind: 'message', channel: 'email', template: 'Hello again' }, { id: 's1', kind: 'wait', days: 7 }], counts: { enrolled: 3, replied: 1, applied: 0, optedOut: 1 } },
      { id: 'k2', name: 'Draft one', channel: 'email', audience: 'QA silver medallists', status: 'draft', stopOnReply: false, steps: [], counts: { enrolled: 0, replied: 0, applied: 0, optedOut: 0 } },
    ],
    selectedId: 'k1',
    onSelect: vi.fn(),
    people: { state: 'ready', rows: [{ id: 'c1', name: 'Priya Raman', status: 'active', reason: null }, { id: 'c2', name: 'Manoj Patil', status: 'stopped', reason: 'opted_out' }] },
    personId: 'c1',
    onPerson: vi.fn(),
    engagement: { state: 'ready', view: { name: 'Priya Raman', email: 'opted-in', whatsapp: 'none', items: [{ id: 'e1', actor: { name: 'Automatic' }, action: 'sent email step 1 of Java 2027 nurture', at: new Date('2026-11-09T06:00:00Z') }] } },
    onStart: vi.fn(async () => ({})),
    onStop: vi.fn(async () => ({})),
    onReplied: vi.fn(async () => ({})),
  },
  builder: {
    pools: [{ value: 'l1', label: 'QA silver medallists' }],
    templates: { email: [{ value: 't1', label: 'Hello again' }], whatsapp: [] },
    whatsappConnected: false,
    sendRule: 'from 9 am to 9 pm IST, at most 200 messages a day',
    audience: vi.fn(async () => ({ total: 4, enrolled: 2, skipped: { noConsent: 1, optedOut: 1, minor: 0 } })),
    onSave: vi.fn(async () => ({ enrolled: 2 })),
  },
  sourced: {
    state: 'ready',
    onRetry: vi.fn(),
    rows: [
      { id: 'sp1', name: 'Rohit Das', headline: 'Data Engineer', site: 'LinkedIn', note: 'Public profile, open to work', status: 'pending', daysLeft: 4, capturedBy: 'Neha Joshi', capturedAt: new Date('2026-11-01T05:00:00Z'), candidateId: null },
      { id: 'sp2', name: 'Mohammed Asif', headline: null, site: 'Event', note: 'Met at the Pune fair', status: 'given', daysLeft: null, capturedBy: 'Neha Joshi', capturedAt: new Date('2026-11-02T05:00:00Z'), candidateId: 'c9' },
    ],
    keepDays: 30,
    onAdd: vi.fn(async () => ({})),
    onResend: vi.fn(async () => ({})),
    onErase: vi.fn(async () => ({})),
    onOpenCandidate: vi.fn(),
  },
  ...over,
});

const crm = (over: Partial<LiveTalentCrm> = {}): LiveTalentCrm => ({
  state: 'ready',
  onRetry: vi.fn(),
  pools: [{ id: 'l1', name: 'QA silver medallists', kind: 'pool', description: null, members: 4, consented: 3, ownerName: 'Neha Joshi', updatedAt: '2026-11-01T05:00:00.000Z' }],
  canManage: true,
  selectedId: null,
  onSelect: vi.fn(),
  members: { state: 'ready', rows: [] },
  onCreate: vi.fn(async () => ({})),
  onArchive: vi.fn(async () => ({})),
  onRemove: vi.fn(async () => ({})),
  onOpenCandidate: vi.fn(),
  postings: { state: 'ready', jobs: [] },
  canPost: true,
  onPosting: vi.fn(async () => ({})),
  crm: crmPart(),
  ...over,
});

describe('HIR-20 campaigns (live)', () => {
  it('shows the campaign: steps, results, people and the engagement timeline with consent', () => {
    show(<TalentCrmScreen live={crm({ defaultTab: 'campaigns' })} />);
    expect(screen.getByText('Java 2027 nurture · sequence')).toBeInTheDocument();
    expect(screen.getByText('Email: Hello again')).toBeInTheDocument();
    expect(screen.getByText('Wait 7 days')).toBeInTheDocument();
    expect(within(screen.getByText('Manoj Patil').closest('tr')!).getByText('Opted out')).toBeInTheDocument();
    expect(screen.getByText('Engagement · Priya Raman')).toBeInTheDocument();
    expect(screen.getByText(/sent email step 1/)).toBeInTheDocument();
  });

  it('marks a reply (toast) and stops a campaign after a confirm', async () => {
    const live = crm({ defaultTab: 'campaigns' });
    show(<TalentCrmScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Mark as replied' }));
    expect(live.crm!.campaigns.onReplied).toHaveBeenCalledWith(live.crm!.campaigns.campaigns[0], 'c1');
    await toasted('Priya Raman marked as replied');
    await ue.click(screen.getByRole('button', { name: 'Stop' }));
    await ue.click(within(await lastDialog()).getByRole('button', { name: 'Stop campaign' }));
    await waitFor(() => expect(live.crm!.campaigns.onStop).toHaveBeenCalled());
    await toasted('Java 2027 nurture stopped');
  });

  it('without the manage key: no start, stop, reply or new sequence; without crm no campaign tabs', () => {
    const { unmount } = show(<TalentCrmScreen live={crm({ defaultTab: 'campaigns', canManage: false })} />);
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as replied' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New sequence' })).not.toBeInTheDocument();
    unmount();
    show(<TalentCrmScreen live={crm({ crm: undefined })} />);
    expect(screen.queryByRole('tab', { name: /Campaigns/ })).not.toBeInTheDocument();
  });

  it('builder: name, audience and a template are required (field error, focus); then starts (toast)', async () => {
    const live = crm({ defaultTab: 'campaigns' });
    show(<TalentCrmScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'New sequence' }));
    const d = await lastDialog();
    await ue.click(within(d).getByRole('button', { name: /Start for/ }));
    expect(within(d).getByText('Enter the name.')).toBeInTheDocument();
    expect(within(d).getByText('Choose the talent pool it goes to.')).toBeInTheDocument();
    await waitFor(() => expect(within(d).getByLabelText(/^Name/)).toHaveFocus());
    expect(live.crm!.builder.onSave).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Name/), 'Winter nurture');
    await ue.click(within(d).getByRole('combobox', { name: 'Audience' }));
    await ue.click(await screen.findByRole('option', { name: /QA silver medallists/ }));
    await waitFor(() => expect(within(d).getByText('2 of 4 enrolled')).toBeInTheDocument());
    await ue.click(within(d).getByRole('combobox', { name: 'Step 1 template' }));
    await ue.click(await screen.findByRole('option', { name: /Hello again/ }));
    await ue.click(within(d).getByRole('button', { name: 'Start for 2 people' }));
    await waitFor(() => expect(live.crm!.builder.onSave).toHaveBeenCalledWith({ name: 'Winter nurture', channel: 'email', poolId: 'l1', steps: [{ kind: 'message', templateId: 't1' }], stopOnReply: true, stopOnApply: true }, true));
    await toasted('Winter nurture started for 2 people');
  });

  it('builder: WhatsApp without a provider says not connected and will not start', async () => {
    const live = crm({ defaultTab: 'campaigns' });
    show(<TalentCrmScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'New sequence' }));
    const d = await lastDialog();
    await ue.click(within(d).getByRole('radio', { name: 'WhatsApp (not connected)' }));
    expect(within(d).getByText('WhatsApp is not connected')).toBeInTheDocument();
  });

  it('builder: an API refusal shows in the drawer', async () => {
    const live = crm({ defaultTab: 'campaigns', crm: crmPart({ builder: { ...crmPart().builder, onSave: vi.fn(async () => Promise.reject(new Error('Nobody in this pool can get it'))) } }) });
    show(<TalentCrmScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'New sequence' }));
    const d = await lastDialog();
    await ue.type(within(d).getByLabelText(/^Name/), 'X');
    await ue.click(within(d).getByRole('combobox', { name: 'Audience' }));
    await ue.click(await screen.findByRole('option', { name: /QA silver medallists/ }));
    await ue.click(within(d).getByRole('combobox', { name: 'Step 1 template' }));
    await ue.click(await screen.findByRole('option', { name: /Hello again/ }));
    await ue.click(within(d).getByRole('button', { name: 'Save draft' }));
    expect(await within(d).findByText('Nobody in this pool can get it')).toBeInTheDocument();
  });
});

describe('HIR-20 sourced profiles (live)', () => {
  it('lists pending (days left) and given; resend (toast); open the candidate', async () => {
    const live = crm({ defaultTab: 'sourced' });
    show(<TalentCrmScreen live={live} />);
    expect(screen.getByText('Pending consent · erased in 4 days')).toBeInTheDocument();
    expect(screen.getByText('Consent given')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send again' }));
    expect(live.crm!.sourced.onResend).toHaveBeenCalledWith(live.crm!.sourced.rows[0]);
    await toasted('Consent email sent again to Rohit Das');
    await ue.click(screen.getByRole('button', { name: 'Open candidate' }));
    expect(live.crm!.sourced.onOpenCandidate).toHaveBeenCalledWith('c9');
  });

  it('add: name, email and a lawful source are required (field error, focus); then adds (toast)', async () => {
    const live = crm({ defaultTab: 'sourced' });
    show(<TalentCrmScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Add sourced profile' }));
    const d = await lastDialog();
    await ue.click(within(d).getByRole('button', { name: 'Add and send consent email' }));
    expect(within(d).getByText('Enter the name.')).toBeInTheDocument();
    expect(within(d).getByText(/Say where you found them/)).toBeInTheDocument();
    await waitFor(() => expect(within(d).getByLabelText(/^Name/)).toHaveFocus());
    await ue.type(within(d).getByLabelText(/^Name/), 'Swathi K');
    await ue.type(within(d).getByLabelText(/^Email/), 'swathi@example.com');
    await ue.type(within(d).getByLabelText(/^Lawful source/), 'Naukri résumé search, looking for a change');
    await ue.click(within(d).getByRole('button', { name: 'Add and send consent email' }));
    await waitFor(() => expect(live.crm!.sourced.onAdd).toHaveBeenCalledWith({ name: 'Swathi K', email: 'swathi@example.com', headline: null, site: 'LinkedIn', sourceNote: 'Naukri résumé search, looking for a change' }));
    await toasted('Swathi K added');
  });

  it('erase now after a confirm; no buttons without the manage key', async () => {
    const live = crm({ defaultTab: 'sourced' });
    const { unmount } = show(<TalentCrmScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Erase now' }));
    await ue.click(within(await lastDialog()).getByRole('button', { name: 'Erase' }));
    await waitFor(() => expect(live.crm!.sourced.onErase).toHaveBeenCalledWith(live.crm!.sourced.rows[0]));
    unmount();
    show(<TalentCrmScreen live={crm({ defaultTab: 'sourced', canManage: false })} />);
    expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add sourced profile' })).not.toBeInTheDocument();
  });
});

const profile = (over: Partial<CandidateProfileView> = {}): CandidateProfileView => ({
  candidate: { id: 'c1', name: 'Rohan Das', email: 'rohan@example.com', phone: null, phoneE164: null, status: 'active', globalStage: 'new', createdAt: '2026-11-01T05:00:00.000Z', erasedAt: null, emailOptedOut: false },
  legalHold: null,
  retention: null,
  resume: null,
  applications: [],
  assessments: [],
  interviews: [],
  messages: { emails: [], sms: 0, whatsapp: 0 },
  consents: [],
  lists: [],
  merges: [],
  ...over,
});
const record = (over: Partial<LiveCandidateRecord> = {}): LiveCandidateRecord => ({
  state: 'ready',
  onRetry: vi.fn(),
  profile: profile(),
  can: { manage: true, dataRights: false, resume: false },
  now: new Date('2026-11-10T06:00:00Z'),
  duplicates: [],
  pools: [],
  templates: [],
  senders: [],
  mergeOptions: [],
  onMergeSearch: vi.fn(),
  loadOther: vi.fn(),
  onBack: vi.fn(),
  onOpenJob: vi.fn(),
  onResume: vi.fn(),
  onEmail: vi.fn(),
  onAddToPool: vi.fn(),
  onMerge: vi.fn(),
  onHold: vi.fn(),
  onWithdrawPool: vi.fn(),
  onExport: vi.fn(),
  onErase: vi.fn(),
  onClearRehire: vi.fn(),
  onDob: vi.fn(async () => {}),
  onResendGuardian: vi.fn(async () => {}),
  ...over,
});

describe('HIR-05 under 18 (live record)', () => {
  it('shows the drawn hold with the date of birth to key holders, and resends the guardian email (toast)', async () => {
    const live = record({ profile: profile({ minor: { dob: '2009-02-14', guardian: 'pending', minAge: 18 } }) });
    show(<CandidateRecordScreen live={live} />);
    expect(screen.getByText('Under 18: guardian consent needed')).toBeInTheDocument();
    expect(screen.getByText(/Date of birth 14 Feb 2009/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send again' }));
    expect(live.onResendGuardian).toHaveBeenCalled();
    await toasted('Guardian consent email sent again');
  });

  it('a hiring manager sees the hold but not the date of birth, and cannot resend', () => {
    show(<CandidateRecordScreen live={record({ can: { manage: false, dataRights: false, resume: false }, profile: profile({ minor: { dob: null, guardian: 'pending', minAge: 18 } }) })} />);
    expect(screen.getByText('Under 18: guardian consent needed')).toBeInTheDocument();
    expect(screen.queryByText(/Date of birth/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument();
  });

  it('no hold for an adult or once the guardian consented', () => {
    const { unmount } = show(<CandidateRecordScreen live={record()} />);
    expect(screen.queryByText(/guardian consent needed/)).not.toBeInTheDocument();
    unmount();
    show(<CandidateRecordScreen live={record({ profile: profile({ minor: { dob: '2009-02-14', guardian: 'given', minAge: 18 } }) })} />);
    expect(screen.getByText(/Guardian consent verified/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument();
  });
  it('record date of birth: required (field error); under 18 needs the guardian, then saves (toast)', async () => {
    const live = record();
    show(<CandidateRecordScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: /more actions/i }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Record date of birth' }));
    const d = await lastDialog();
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(within(d).getByText('Enter the date of birth.')).toBeInTheDocument();
    expect(live.onDob).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Date of birth/), '14 Feb 2009{Enter}');
    await ue.click(within(d).getByRole('button', { name: 'Save and email the guardian' }));
    expect(within(d).getByText('Enter the parent or guardian name.')).toBeInTheDocument();
    await ue.type(within(d).getByLabelText(/^Parent or guardian name/), 'Sunita Das');
    await ue.type(within(d).getByLabelText(/^Parent or guardian email/), 'sunita@example.com');
    await ue.click(within(d).getByRole('button', { name: 'Save and email the guardian' }));
    await waitFor(() => expect(live.onDob).toHaveBeenCalledWith({ dob: '2009-02-14', guardianName: 'Sunita Das', guardianEmail: 'sunita@example.com' }));
    await toasted('Date of birth saved');
  });
});
