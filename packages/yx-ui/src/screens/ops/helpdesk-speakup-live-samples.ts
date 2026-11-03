// Sample records in the server's shapes for the HLP-06 live stories and tests (Kaveri Foods demo people).
import type { FiledReport, LiveCheckReport, LiveSpeakUp, LiveSpeakUpSetup, ReporterView, SpeakUpFormData } from './helpdesk-speakup-live';

export const SU_TODAY = new Date(2026, 10, 3);

export const SU_FORM: SpeakUpFormData = {
  company: 'Kaveri Foods Pvt Ltd',
  org: 'kaveri-foods',
  anonymous: 'all',
  categories: { grievance: ['Pay and benefits', 'Working conditions', 'A manager', 'Transport', 'Safety', 'Other'], whistleblower: ['Fraud or theft', 'Bribery or corruption', 'Conflict of interest', 'Misuse of data', 'Other'] },
  locations: [
    { id: 'l1', name: 'Bengaluru head office' },
    { id: 'l2', name: 'Chennai office' },
    { id: 'l3', name: 'Hosur plant' },
  ],
  officers: [
    { id: 'u-rekha', name: 'Rekha Iyengar' },
    { id: 'u-suresh', name: 'Suresh Pillai' },
  ],
  ready: { grievance: true, whistleblower: true, posh: true },
  posh: { filingMonths: 3, extensionMonths: 3, source: 'IN.POSH 2013-v1 (verify)' },
  ackDays: 2,
  me: 'Divya Raghunathan',
};

export const FILED_NAMED: FiledReport = {
  id: 'c1',
  number: 'GRV-0146',
  kind: 'grievance',
  routedTo: 'grievance',
  team: 'the Grievance Redressal Committee',
  late: false,
  clock: [
    { key: 'ack', label: 'Acknowledgement', due: '2026-11-05' },
    { key: 'decide', label: 'Decision by the committee', due: '2026-12-03' },
  ],
  source: 'IN.GRC 2020-v1 (verify)',
};
export const FILED_ANON: FiledReport = { id: 'c2', number: 'WB-0009', kind: 'whistleblower', routedTo: 'ethics', team: 'the ethics team', late: false, clock: [{ key: 'ack', label: 'Acknowledgement', due: '2026-11-05' }], source: null, code: 'KF7Q-2MXA-99TR-HPL3' };

export function liveSpeakUp(over: Partial<LiveSpeakUp> = {}): LiveSpeakUp {
  return {
    state: 'ready',
    form: SU_FORM,
    onFile: async (_i, identity) => (identity === 'anonymous' ? FILED_ANON : FILED_NAMED),
    onUpload: async () => undefined,
    onDone: () => undefined,
    checkHref: '/yx/speakup/kaveri-foods/check',
    today: SU_TODAY,
    ...over,
  };
}

export const REPORTER_VIEW: ReporterView = {
  number: 'WB-0009',
  kind: 'whistleblower',
  status: 'investigation',
  filedAt: '2026-09-03T16:40:00Z',
  team: 'the ethics team',
  messages: [
    { id: 'a1', from: 'reporter', at: '2026-09-03T16:40:00Z', text: 'Three invoices from the packaging vendor in July were approved though the goods never reached the Hosur store.' },
    { id: 'a2', from: 'team', at: '2026-09-04T05:00:00Z', text: 'Thank you. We have acknowledged your report. Please share the GRN numbers here; nobody on the team can see who you are.' },
  ],
};

export function liveCheck(over: Partial<LiveCheckReport> = {}): LiveCheckReport {
  return { company: 'Kaveri Foods Pvt Ltd', onOpen: async () => REPORTER_VIEW, onReply: async () => REPORTER_VIEW, onUpload: async () => undefined, followUpHref: '/yx/desk/speakup', ...over };
}

export function liveSetup(over: Partial<LiveSpeakUpSetup> = {}): LiveSpeakUpSetup {
  return {
    state: 'ready',
    data: {
      members: [
        { id: 'm1', team: 'ethics', userId: 'u-rekha', name: 'Rekha Iyengar', role: 'member', addedAt: '2026-10-01T05:00:00Z' },
        { id: 'm2', team: 'ethics', userId: 'u-suresh', name: 'Suresh Pillai', role: 'member', addedAt: '2026-10-01T05:00:00Z' },
        { id: 'm3', team: 'ic', userId: 'u-lakshmi', name: 'Lakshmi Venkatesan', role: 'presiding', addedAt: '2026-10-01T05:00:00Z' },
        { id: 'm4', team: 'ic', userId: 'u-ngo', name: 'Farida Sheikh', role: 'external', addedAt: '2026-10-01T05:00:00Z' },
        { id: 'm5', team: 'escalation', userId: 'u-chair', name: 'Anand Rao', role: 'member', addedAt: '2026-10-01T05:00:00Z' },
        { id: 'm6', team: 'safety', userId: 'u-prakash', name: 'Prakash Nair', role: 'member', addedAt: '2026-11-04T05:00:00Z' },
      ],
      users: [
        { id: 'u-rekha', name: 'Rekha Iyengar', email: 'rekha@kaverifoods.in' },
        { id: 'u-divya', name: 'Divya Raghunathan', email: 'divya@kaverifoods.in' },
        { id: 'u-joseph', name: 'Joseph Mathew', email: 'joseph@kaverifoods.in' },
      ],
      settings: { anonymous: 'all', ackDays: 2, grievance: SU_FORM.categories.grievance, whistleblower: SU_FORM.categories.whistleblower },
    },
    onAdd: async () => undefined,
    onRemove: async () => undefined,
    rulesHref: '/yx/settings/company-rules',
    ...over,
  };
}
