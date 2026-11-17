import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppealsScreen, IncidentWorkspaceScreen, IntegrityQueueScreen, IntegrityReportsScreen } from './integrity';
import type { LiveIntegrityReportData } from './integrity-live';
import { PrivacyCentreScreen, ResultAppealScreen, type LivePrivacy } from './candidate';
import type { LiveIncidentWorkspace } from './integrity-live';
import { LIVE_APPEAL_ROWS, LIVE_DECISION, LIVE_INCIDENT, LIVE_INCIDENT_ROWS, LIVE_REVIEWERS, ME } from './integrity-live-samples';

// AS-5 part 1 (answers 2006, 2008, 2012): the designed queue, incident workspace, appeals and result with real data.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const REASON = 'Frames at 23:15 show a second person reading the screen.';
const workspace = (over: Partial<LiveIncidentWorkspace> = {}): LiveIncidentWorkspace => ({
  state: 'ready',
  onRetry: vi.fn(),
  incident: LIVE_INCIDENT,
  me: ME,
  reviewers: LIVE_REVIEWERS,
  onTake: vi.fn().mockResolvedValue(undefined),
  onVerdict: vi.fn().mockResolvedValue(undefined),
  onInvalidate: vi.fn().mockResolvedValue(undefined),
  onSecondReview: vi.fn().mockResolvedValue(undefined),
  onBack: vi.fn(),
  ...over,
});
const pickOption = async (label: string, option: string) => {
  await ue.click(screen.getByRole('combobox', { name: new RegExp(`^${label}`) }));
  await ue.click(await screen.findByRole('option', { name: option }));
};

describe('PRC-16 live queue', () => {
  it('lists incidents with concern, flags and status, and opens one', async () => {
    const onOpen = vi.fn();
    render(<IntegrityQueueScreen live={{ state: 'ready', onRetry: vi.fn(), rows: LIVE_INCIDENT_ROWS, onOpen }} />);
    expect(screen.getByText(/2 waiting/)).toBeInTheDocument();
    const row = screen.getByText('Sneha Iyer').closest('tr')!;
    expect(within(row).getByText('High concern')).toBeInTheDocument();
    expect(within(row).getByText('Similar to another candidate, Camera flags')).toBeInTheDocument();
    await ue.click(screen.getByText('Sneha Iyer'));
    expect(onOpen).toHaveBeenCalledWith('i-1');
  });

  it('negative: an error offers a retry; an empty queue says when incidents appear', async () => {
    const onRetry = vi.fn();
    const { unmount } = render(<IntegrityQueueScreen live={{ state: 'error', onRetry, rows: [], onOpen: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(onRetry).toHaveBeenCalled();
    unmount();
    render(<IntegrityQueueScreen live={{ state: 'ready', onRetry, rows: [], onOpen: vi.fn() }} />);
    expect(screen.getByText('Nothing to review.')).toBeInTheDocument();
  });
});

describe('PRC-17 live incident', () => {
  it('shows the flags and events; a warning is saved with its reason', async () => {
    const live = workspace();
    render(<IncidentWorkspaceScreen live={live} />);
    expect(screen.getByText('Similar to another candidate')).toBeInTheDocument();
    expect(screen.getByText(/webcam multiple faces/)).toBeInTheDocument();
    await ue.click(screen.getByLabelText(/Warning noted/));
    await ue.type(screen.getByLabelText(/Reason and evidence/), REASON);
    await ue.click(screen.getByRole('button', { name: 'Save verdict' }));
    expect(live.onVerdict).toHaveBeenCalledWith({ verdict: 'warning', reason: REASON });
  });

  it('section: needs the section; invalidation needs a second reviewer', async () => {
    const live = workspace();
    render(<IncidentWorkspaceScreen live={live} />);
    await ue.click(screen.getByLabelText(/Section invalidated/));
    await ue.type(screen.getByLabelText(/Reason and evidence/), REASON);
    await ue.click(screen.getByRole('button', { name: 'Save verdict' }));
    expect(screen.getByText('Choose the section.')).toBeInTheDocument();
    expect(live.onVerdict).not.toHaveBeenCalled();
    await pickOption('Section', 'Java');
    await ue.click(screen.getByRole('button', { name: 'Save verdict' }));
    expect(live.onVerdict).toHaveBeenCalledWith({ verdict: 'section', reason: REASON, sectionTitle: 'Java' });
    await ue.click(screen.getByLabelText(/Attempt invalidated/));
    await ue.click(screen.getByRole('button', { name: 'Send for second review' }));
    expect(screen.getByText('Choose the second reviewer.')).toBeInTheDocument();
    await pickOption('Second reviewer', 'Gopal Menon');
    await ue.click(screen.getByRole('button', { name: 'Send for second review' }));
    expect(live.onInvalidate).toHaveBeenCalledWith({ reason: REASON, secondReviewerId: 'u-gopal' });
  });

  it('negative: a short reason is refused before anything is sent; a failed save says so', async () => {
    const live = workspace({ onVerdict: vi.fn().mockRejectedValue(new Error('This incident is decided.')) });
    render(<IncidentWorkspaceScreen live={live} />);
    await ue.click(screen.getByLabelText(/Cleared/));
    await ue.type(screen.getByLabelText(/Reason and evidence/), 'short');
    await ue.click(screen.getByRole('button', { name: 'Save verdict' }));
    expect(screen.getByText('Enter a reason of at least 10 characters.')).toBeInTheDocument();
    expect(live.onVerdict).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/Reason and evidence/), ' and more words');
    await ue.click(screen.getByRole('button', { name: 'Save verdict' }));
    expect(await screen.findByText('This incident is decided.')).toBeInTheDocument();
  });

  it('only the chosen second reviewer may confirm or send back; others see who will', async () => {
    const waiting = { ...LIVE_INCIDENT, status: 'second_review' as const, verdict: 'attempt' as const, reason: REASON, decidedBy: { id: 'u-gopal', name: 'Gopal Menon' }, decidedAt: '2026-11-15T10:00:00.000Z', secondReviewer: { id: ME, name: 'Farah Siddiqui' } };
    const live = workspace({ incident: waiting });
    const { unmount } = render(<IncidentWorkspaceScreen live={live} />);
    await ue.type(screen.getByLabelText(/Your reason/), 'I agree: the frames show it clearly.');
    await ue.click(screen.getByRole('button', { name: 'Confirm invalidation' }));
    expect(live.onSecondReview).toHaveBeenCalledWith({ confirm: true, reason: 'I agree: the frames show it clearly.' });
    unmount();
    render(<IncidentWorkspaceScreen live={workspace({ incident: { ...waiting, secondReviewer: { id: 'u-arvind', name: 'Arvind Swamy' } } })} />);
    expect(screen.getByText(/Arvind Swamy confirms or sends it back/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm invalidation' })).not.toBeInTheDocument();
  });
});

describe('PRC-18 live appeals', () => {
  it('a reviewer who did not give the verdict upholds or overturns with a reason', async () => {
    const onOverturn = vi.fn().mockResolvedValue(undefined);
    render(<AppealsScreen live={{ state: 'ready', onRetry: vi.fn(), rows: LIVE_APPEAL_ROWS, me: 'u-lakshmi', onUphold: vi.fn(), onOverturn }} />);
    expect(screen.getByText(/I wrote this solution/)).toBeInTheDocument();
    await ue.click(screen.getByLabelText(/Overturn it/));
    await ue.type(screen.getByLabelText(/Reason sent to the candidate/), 'The git history shows the code was written in March.');
    await ue.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(onOverturn).toHaveBeenCalledWith('a-1', 'The git history shows the code was written in March.');
  });

  it('negative: the reviewer who gave the verdict cannot decide; a decided appeal shows its outcome', async () => {
    render(<AppealsScreen live={{ state: 'ready', onRetry: vi.fn(), rows: LIVE_APPEAL_ROWS, me: ME, onUphold: vi.fn(), onOverturn: vi.fn() }} />);
    expect(screen.getByText('You gave this verdict, so someone else decides the appeal.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save decision' })).not.toBeInTheDocument();
    await ue.click(screen.getByText('Sanjay Chatterjee'));
    expect(screen.getByText(/The ID shown on camera does not match/)).toBeInTheDocument();
  });
});

describe('PRC-18 live appeal file (answer 2264)', () => {
  it('shows the file sent with the appeal and opens it', async () => {
    const onEvidence = vi.fn().mockResolvedValue(undefined);
    const rows = [{ ...LIVE_APPEAL_ROWS[0]!, evidenceName: 'git-log-march.pdf' }];
    render(<AppealsScreen live={{ state: 'ready', onRetry: vi.fn(), rows, me: 'u-lakshmi', onUphold: vi.fn(), onOverturn: vi.fn(), onEvidence }} />);
    expect(screen.getByText('1 file: git-log-march.pdf')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'View' }));
    expect(onEvidence).toHaveBeenCalledWith('a-1');
  });

  it('negative: no file, no file line', () => {
    render(<AppealsScreen live={{ state: 'ready', onRetry: vi.fn(), rows: LIVE_APPEAL_ROWS, me: 'u-lakshmi', onUphold: vi.fn(), onOverturn: vi.fn(), onEvidence: vi.fn() }} />);
    expect(screen.queryByText(/^1 file:/)).not.toBeInTheDocument();
  });
});

describe('PRC-27 live decision and appeal', () => {
  it('shows why and the window; the candidate appeals in their own words', async () => {
    const onAppeal = vi.fn().mockResolvedValue(undefined);
    render(<ResultAppealScreen live={{ testName: 'Java Backend Developer · L2', state: 'released', passed: true, integrity: LIVE_DECISION, onAppeal, companyName: 'Kaveri Foods' }} />);
    expect(screen.getByText('Part of your test was not counted: Java')).toBeInTheDocument();
    expect(screen.getByText(/91 % similar/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Appeal this decision' }));
    await ue.click(screen.getByRole('button', { name: 'Send appeal' }));
    expect(screen.getByText('Write at least 10 characters.')).toBeInTheDocument();
    expect(onAppeal).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/Why should we look again/), 'I wrote this in my college project last year.');
    await ue.click(screen.getByRole('button', { name: 'Send appeal' }));
    expect(onAppeal).toHaveBeenCalledWith('I wrote this in my college project last year.', null);
  });

  it('negative: after the window, or once appealed, there is no appeal button; an invalidated test shows no score', () => {
    const { rerender } = render(<ResultAppealScreen live={{ testName: 'T', state: 'released', integrity: { ...LIVE_DECISION, canAppeal: false }, onAppeal: vi.fn() }} />);
    expect(screen.getByText('The appeal window for this decision closed on 22 Nov 2026.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Appeal this decision' })).not.toBeInTheDocument();
    rerender(<ResultAppealScreen live={{ testName: 'T', state: 'held', integrity: { ...LIVE_DECISION, canAppeal: false, appeal: { status: 'open', sentOn: '16 Nov 2026', decidedOn: null, reason: null } } }} />);
    expect(screen.getByText('Appeal received on 16 Nov 2026')).toBeInTheDocument();
    rerender(<ResultAppealScreen live={{ testName: 'T', state: 'invalidated', percentage: 72, integrity: { ...LIVE_DECISION, verdict: 'attempt', sectionTitle: null } }} />);
    expect(screen.getByText('Your test was not counted')).toBeInTheDocument();
    expect(screen.queryByText('72 %')).not.toBeInTheDocument();
  });
});

describe('evidence frames and the candidate summary (answer 2262)', () => {
  const frames = [
    { eventId: 'e1', kind: 'camera' as const, at: '2026-11-17T05:00:00.000Z', what: 'webcam multiple faces', flagged: true },
    { eventId: 'e1', kind: 'screen' as const, at: '2026-11-17T05:00:00.000Z', what: 'webcam multiple faces', flagged: true },
  ];

  it('the incident lists each frame kept; View opens one (the API audits it)', async () => {
    const onFrame = vi.fn().mockResolvedValue(undefined);
    render(<IncidentWorkspaceScreen live={workspace({ incident: { ...LIVE_INCIDENT, frames }, onFrame })} />);
    expect(screen.getByText('Your views are audited.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'View the screen frame: webcam multiple faces' }));
    expect(onFrame).toHaveBeenCalledWith('e1', 'screen');
  });

  it('negative: no frames kept says so; an incident without the list shows no card', () => {
    const { unmount } = render(<IncidentWorkspaceScreen live={workspace({ incident: { ...LIVE_INCIDENT, frames: [] }, onFrame: vi.fn() })} />);
    expect(screen.getByText('No camera or screen frames were kept for this attempt.')).toBeInTheDocument();
    unmount();
    render(<IncidentWorkspaceScreen live={workspace()} />);
    expect(screen.queryByText('Evidence frames')).not.toBeInTheDocument();
  });

  it('the candidate sees the flagged moments and how many frames are kept, never a frame', () => {
    render(<ResultAppealScreen live={{ testName: 'T', state: 'released', integrity: { ...LIVE_DECISION, evidence: { moments: [{ at: '10:32:05 am', what: 'webcam multiple faces' }], cameraFrames: 3, screenFrames: 1 } }, onAppeal: vi.fn() }} />);
    expect(screen.getByRole('list', { name: 'Flagged moments' })).toHaveTextContent('10:32:05 am webcam multiple faces');
    expect(screen.getByText(/3 camera frames and 1 screen capture are kept as evidence/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /frame/i })).not.toBeInTheDocument();
  });
});

describe('PRC-20 live integrity reports', () => {
  const DATA: LiveIntegrityReportData = {
    test: { id: 't1', title: 'Campus aptitude 2026' },
    attempts: 3,
    minSame: 5,
    clusters: [{ id: 'CL-01', who: ['Rahul Deshpande', 'Harish Gowda'], same: 5, timing: 'Started within 4 min', incident: 'Not raised' }],
    sizes: [{ size: '2', clusters: 1 }, { size: '3', clusters: 0 }, { size: '4', clusters: 0 }, { size: '5+', clusters: 0 }],
    pairs: [{ pair: 'Rahul Deshpande · Harish Gowda', question: 'Reverse a list', similarity: 91 }],
    agreement: { weeks: [{ week: 'W47', kappa: 0.74 }], target: 0.7, markers: [{ pair: 'Arvind Swamy · Farah Siddiqui', moderated: 1, of: 3 }], doubleMarked: 3 },
  };
  const reports = (over = {}) => ({ state: 'ready' as const, onRetry: vi.fn(), tests: [{ id: 't1', title: 'Campus aptitude 2026' }], onTest: vi.fn(), data: DATA, onExport: vi.fn().mockResolvedValue(undefined), ...over });

  it('shows the clusters, the similar code and the marker pairs; Export asks for the workbook', async () => {
    const live = reports();
    render(<IntegrityReportsScreen live={live} />);
    expect(screen.getByText('Rahul Deshpande, Harish Gowda')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Plagiarism and code similarity' }));
    expect(screen.getByText('91 %')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Inter-rater agreement' }));
    expect(screen.getByText('1 of 3 moderated')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Export XLSX' }));
    expect(live.onExport).toHaveBeenCalled();
  });

  it('negative: nothing found says what was checked; a failed export says why', async () => {
    const live = reports({ data: { ...DATA, clusters: [], pairs: [], agreement: { ...DATA.agreement, weeks: [], markers: [], doubleMarked: 0 } }, onExport: vi.fn().mockRejectedValue(new Error('You do not have access to this test.')) });
    render(<IntegrityReportsScreen live={live} />);
    expect(screen.getByText('No collusion clusters found.')).toBeInTheDocument();
    expect(screen.getByText(/no two shared 5 or more identical wrong answers/)).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Plagiarism and code similarity' }));
    expect(screen.getByText('No similar code found.')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Inter-rater agreement' }));
    expect(screen.getByText('No answers were marked twice yet.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Export XLSX' }));
    expect(await screen.findByText('You do not have access to this test.')).toBeInTheDocument();
  });
});

describe('PRC-28 live privacy centre', () => {
  const PRIV = (over: Partial<LivePrivacy> = {}): LivePrivacy => ({
    state: 'ready',
    onRetry: vi.fn(),
    company: 'Kaveri Foods',
    consents: [{ what: 'Camera, screen and activity monitoring', test: 'Java Backend Developer · L2', on: '17 Nov 2026' }],
    recordings: { frames: 4, deleteOn: '17 Dec 2026' },
    face: { kept: true, deleteOn: '17 Dec 2026' },
    held: false,
    request: null,
    onErase: vi.fn().mockResolvedValue(undefined),
    onDownload: vi.fn().mockResolvedValue(undefined),
    ...over,
  });

  it('shows what is kept until when; erasing asks first; the copy downloads', async () => {
    const live = PRIV();
    render(<PrivacyCentreScreen live={live} />);
    expect(screen.getAllByText('Delete on 17 Dec 2026')).toHaveLength(2);
    await ue.click(screen.getByRole('button', { name: 'Download my data' }));
    expect(live.onDownload).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Erase my recordings and face data' }));
    await ue.click(within(screen.getByRole('dialog', { name: 'Erase your recordings and face data?' })).getByRole('button', { name: 'Erase my data' }));
    expect(live.onErase).toHaveBeenCalled();
  });

  it('negative: a held review says it waits; a waiting request offers no second erase; nothing kept offers none', () => {
    const { unmount } = render(<PrivacyCentreScreen live={PRIV({ held: true, request: { status: 'waiting', requestedOn: '17 Nov 2026', doneOn: null, dueOn: '17 Dec 2026' } })} />);
    expect(screen.getByText(/can't erase your recordings while a review or appeal/)).toBeInTheDocument();
    expect(screen.getByText('Erasure request received on 17 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Erase my recordings and face data' })).not.toBeInTheDocument();
    expect(screen.getByText(/legal hold/)).toBeInTheDocument();
    unmount();
    render(<PrivacyCentreScreen live={PRIV({ recordings: { frames: 0, deleteOn: null }, face: { kept: false, deleteOn: null } })} />);
    expect(screen.getAllByText('None kept')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Erase my recordings and face data' })).not.toBeInTheDocument();
  });
});
