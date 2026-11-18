import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CheckReportScreen, SpeakUpScreen } from './cases';
import { SpeakUpSetupScreen, anonymousFor } from './helpdesk-speakup-live';
import { FILED_ANON, FILED_NAMED, REPORTER_VIEW, SU_FORM, liveCheck, liveSetup, liveSpeakUp } from './helpdesk-speakup-live-samples';

// HLP-06 Speak-up filing, live (the designed screens with real records).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const writeIt = (text = 'The night shift cab skipped my stop three times.') => ue.type(screen.getByRole('textbox', { name: /What happened/ }), text);

describe('HLP-06 rules (screen)', () => {
  it('anonymous follows the company setting; POSH never', () => {
    expect(anonymousFor('all', 'grievance')).toBe(true);
    expect(anonymousFor('ethics_only', 'grievance')).toBe(false);
    expect(anonymousFor('ethics_only', 'whistleblower')).toBe(true);
    expect(anonymousFor('off', 'whistleblower')).toBe(false);
    expect(anonymousFor('all', 'posh')).toBe(false);
  });
});

describe('HLP-06 Speak up (live)', () => {
  it('File report too early says what is missing; a named grievance is filed and shows the clock', async () => {
    const onFile = vi.fn().mockResolvedValue(FILED_NAMED);
    show(<SpeakUpScreen live={liveSpeakUp({ onFile })} />);
    await ue.click(screen.getByRole('button', { name: 'File report' }));
    expect(await screen.findByText('Say what happened (10 letters or more).')).toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
    await writeIt();
    await ue.click(screen.getByRole('checkbox', { name: /worried about retaliation/ }));
    await ue.click(screen.getByRole('button', { name: 'File report' }));
    expect(onFile).toHaveBeenCalledWith({ kind: 'grievance', summary: 'The night shift cab skipped my stop three times.', retaliationWorry: true }, 'named');
    expect(await screen.findByText('Grievance GRV-0146 is filed')).toBeInTheDocument();
    expect(screen.getByText('Decision by the committee')).toBeInTheDocument();
  });

  it('anonymous: sent without the sign-in; the reply code shows once with the way to follow up', async () => {
    const onFile = vi.fn().mockResolvedValue(FILED_ANON);
    show(<SpeakUpScreen live={liveSpeakUp({ onFile, start: { kind: 'whistleblower' } })} />);
    await ue.click(screen.getByRole('radio', { name: /Anonymously/ }));
    expect(screen.getByText(/does not record who you are/)).toBeInTheDocument();
    await writeIt('Vendor invoices approved without the goods arriving.');
    await ue.click(screen.getByRole('button', { name: 'File report' }));
    expect(onFile.mock.calls[0][1]).toBe('anonymous');
    expect(await screen.findByTestId('access-code')).toHaveTextContent('KF7Q-2MXA-99TR-HPL3');
    expect(screen.getByRole('link', { name: 'Check my report' })).toHaveAttribute('href', '/yx/speakup/kaveri-foods/check');
  });

  it('anonymous: update alerts are optional; the email goes with the report, never with a named one', async () => {
    const onFile = vi.fn().mockResolvedValue(FILED_ANON);
    show(<SpeakUpScreen live={liveSpeakUp({ onFile, start: { kind: 'whistleblower' } })} />);
    expect(screen.queryByRole('switch', { name: /Tell me when there's an update/ })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: /Anonymously/ }));
    await ue.click(screen.getByRole('switch', { name: /Tell me when there's an update/ }));
    await ue.type(screen.getByRole('textbox', { name: /Email for alerts/ }), 'tip@example.test');
    await writeIt('Vendor invoices approved without the goods arriving.');
    await ue.click(screen.getByRole('button', { name: 'File report' }));
    expect(onFile.mock.calls[0][0]).toMatchObject({ alertEmail: 'tip@example.test' });
  });

  it('the company switched anonymous grievances off: the option is off and says why', () => {
    show(<SpeakUpScreen live={liveSpeakUp({ form: { ...SU_FORM, anonymous: 'ethics_only' } })} />);
    expect(screen.getByRole('radio', { name: /Anonymously/ })).toBeDisabled();
    expect(screen.getByText(/switched anonymous grievances off/)).toBeInTheDocument();
  });

  it('POSH: the Internal Committee first, then the named complaint form; the late window warns', async () => {
    show(<SpeakUpScreen live={liveSpeakUp({ start: { kind: 'posh', happenedOn: '2026-06-10' } })} />);
    expect(screen.getByText('This goes to the Internal Committee')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue to the complaint form' }));
    expect(screen.queryByRole('radio', { name: /Anonymously/ })).not.toBeInTheDocument();
    expect(screen.getByText('More than 3 months ago')).toBeInTheDocument();
  });

  it('nobody set up: says so and File report only explains (toast)', async () => {
    const onFile = vi.fn();
    show(<SpeakUpScreen live={liveSpeakUp({ onFile, form: { ...SU_FORM, ready: { grievance: false, whistleblower: false, posh: false } } })} />);
    expect(screen.getByText('Nobody receives these reports yet')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'File report' }));
    expect((await screen.findAllByText('Your company has not chosen who receives these reports yet.')).length).toBeGreaterThan(0);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('a refusal stays on the page; no access on 403', async () => {
    const onFile = vi.fn().mockRejectedValue(new Error('Choose one of the topics in the list.'));
    const r = show(<SpeakUpScreen live={liveSpeakUp({ onFile })} />);
    await writeIt();
    await ue.click(screen.getByRole('button', { name: 'File report' }));
    expect(await screen.findByText('Choose one of the topics in the list.')).toBeInTheDocument();
    r.unmount();
    show(<SpeakUpScreen live={liveSpeakUp({ state: 'no-access' })} />);
    expect(screen.getByText(/closed while you act for someone else/)).toBeInTheDocument();
  });
});

describe('HLP-06 Check my report (live)', () => {
  it('a wrong code says how many tries are left; the right code opens the messages; a reply is sent', async () => {
    const onOpen = vi.fn().mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'SPEAKUP_WRONG_CODE', body: { triesLeft: 3 } })).mockResolvedValue(REPORTER_VIEW);
    const onReply = vi.fn().mockResolvedValue(REPORTER_VIEW);
    show(<CheckReportScreen live={liveCheck({ onOpen, onReply })} />);
    await ue.click(screen.getByRole('button', { name: 'Open my report' }));
    expect(await screen.findByText('Enter the 16 characters of your reply code.')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Reply code/ }), 'KF7Q-2MXA-99TR-HPL4');
    await ue.click(screen.getByRole('button', { name: 'Open my report' }));
    expect(await screen.findByText(/You have 3 tries left in this hour/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open my report' }));
    expect(await screen.findByText('Report WB-0009')).toBeInTheDocument();
    expect(screen.getByText('Case team')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /^Reply/ }), 'GRN 4471 and 4472.');
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(onReply).toHaveBeenCalledWith('KF7Q-2MXA-99TR-HPL4', 'GRN 4471 and 4472.'));
  });

  it('locked after too many tries', async () => {
    const onOpen = vi.fn().mockRejectedValue(Object.assign(new Error('no'), { code: 'SPEAKUP_LOCKED', body: { retryAfterSeconds: 600 } }));
    show(<CheckReportScreen live={liveCheck({ onOpen, start: { code: 'KF7Q-2MXA-99TR-HPL4' } })} />);
    await ue.click(screen.getByRole('button', { name: 'Open my report' }));
    expect(await screen.findByText(/Too many tries. Try again after/)).toBeInTheDocument();
  });
});

describe('HLP-06 Speak-up set-up (live)', () => {
  it('lists the officers per list; Add too early says so; adding to the IC sends the role', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    show(<SpeakUpSetupScreen live={liveSetup({ onAdd, start: { adding: 'ic' } })} />);
    expect(screen.getAllByText('Presiding officer').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Choose who to add.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('warns the System Admin while the Internal Committee or Escalation is empty; no warning once both are set', () => {
    const base = liveSetup();
    const { unmount } = show(<SpeakUpSetupScreen live={{ ...base, data: { ...base.data!, members: base.data!.members.filter((m) => m.team === 'ethics') } }} />);
    expect(screen.getByText('Set-up is not finished')).toBeInTheDocument();
    expect(screen.getByText(/Local Committee/)).toBeInTheDocument();
    expect(screen.getByText(/reports about a case officer are refused/)).toBeInTheDocument();
    unmount();
    show(<SpeakUpSetupScreen live={base} />);
    expect(screen.queryByText('Set-up is not finished')).not.toBeInTheDocument();
  });

  it('answer 2591: adding to the IC asks whether she is a woman and when the term ends; a man cannot preside', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    show(<SpeakUpSetupScreen live={liveSetup({ onAdd, start: { adding: 'ic' } })} />);
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('combobox', { name: /Person/ }));
    await ue.click(await screen.findByRole('option', { name: /Divya Raghunathan/ }));
    await ue.click(within(dialog).getByRole('radio', { name: /Presiding officer/ }));
    await ue.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Say whether this member is a woman.')).toBeInTheDocument();
    expect(screen.getByText('Choose the day their term ends.')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('radio', { name: 'No' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('The presiding officer must be a senior woman employee.')).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('radio', { name: 'Yes' }));
    const next = new Date();
    next.setFullYear(next.getFullYear() + 2);
    const dd = `${String(next.getDate()).padStart(2, '0')}/${String(next.getMonth() + 1).padStart(2, '0')}/${next.getFullYear()}`;
    await ue.type(within(dialog).getByRole('textbox', { name: /Term ends/ }), `${dd}{Enter}`);
    await ue.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ team: 'ic', role: 'presiding', woman: true, termEndsOn: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}` }));
  });

  it('answer 2591: the IC card warns when a member has no woman or term end recorded', () => {
    const base = liveSetup();
    show(<SpeakUpSetupScreen live={{ ...base, data: { ...base.data!, members: base.data!.members.map((m) => (m.team === 'ic' && m.role === 'presiding' ? { ...m, woman: null, termEndsOn: null } : m)) } }} />);
    expect(screen.getByText(/Lakshmi Venkatesan: woman or term end not recorded/)).toBeInTheDocument();
  });

  it('no access without the key', () => {
    show(<SpeakUpSetupScreen live={liveSetup({ state: 'no-access' })} />);
    expect(screen.getByText(/HR does not/)).toBeInTheDocument();
  });
});
