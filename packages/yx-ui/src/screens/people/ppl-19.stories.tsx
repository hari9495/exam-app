import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import type { ExitWorkspace } from './live/types';
import { ExitCasesList, ExitCaseWorkspace } from './exits';
import { EXIT_CASES, TODAY } from './people-data';
import { StartExitDialog } from './live/exits';
import { IR_PERMISSION_CHOICES, PERSON_CHOICES, TODAY_KEY } from './people-data';
import { choose, date, pick, play, press, type } from './popup-play';

const meta: Meta = { title: 'Screens/People/PPL-19 · Exit cases', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'HR · exit cases', render: () => <ExitCasesList rows={EXIT_CASES} /> };
export const ManagerList: S = { name: 'Manager · my team', render: () => <ExitCasesList rows={EXIT_CASES} persona="mgr" /> };
export const Case: S = { name: 'HR · case stepper with deprovisioning', render: () => <ExitCaseWorkspace today={TODAY} /> };
export const CaseManager: S = { name: 'Manager · case (no HR-only flags)', render: () => <ExitCaseWorkspace today={TODAY} persona="mgr" /> };
export const Held: S = { name: 'HR · open case holds letters', render: () => <ExitCaseWorkspace today={TODAY} variant="held" current="documents" /> };
export const Loading: S = { name: '· loading', render: () => <ExitCasesList rows={EXIT_CASES} state="loading" /> };
export const Empty: S = { name: '· empty', render: () => <ExitCasesList rows={[]} /> };

/** HR undoes an exit HR started by mistake (founder 28 Oct 2026): an end of contract before its last day, reason dialog open. */
const contract: ExitWorkspace = {
  id: 'k-contract', employeeId: 'e-leela', exitType: 'end_of_contract', typeLabel: 'End of contract', initiatedBy: 'company', reasonCode: null, reasonText: 'Fixed-term contract ends', submittedOn: '2026-10-05', requestedLwd: null, noticePeriod: '0d', noticeLabel: 'None', standardLwd: '2026-11-30', approvedLwd: '2026-11-30', lastDay: '2026-11-30', noticeArrangement: null, status: 'accepted', pendingChange: null, lettersHeld: false, version: 2,
  name: 'Leela Rao', employeeCode: 'KF-0207', journeyId: null, interview: 'sent', hr: null, can: { manage: true, confidential: false, interview: false },
  clearance: [{ id: 'c1', department: 'asset', title: 'Return Latitude 5450 (LT-0412)', owner: 'IT and Admin team', status: 'open', note: null, recoveryAmount: null, recoveryReason: null, signedOffAt: null, version: 1 }],
};
const noop = async () => ({});
export const Withdraw: S = {
  name: 'HR · withdraw an exit HR started',
  render: () => (
    <ExitCaseWorkspace
      today={TODAY}
      live={{ state: 'ready', data: contract, today: '2026-10-09', onBack: () => {}, onNotice: noop, onHrFacts: noop, onSignOff: noop, interviewHref: '#', checklistHref: () => '#', onWithdraw: noop }}
    />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Withdraw exit' }));
  },
};
/** After HR withdraws it: the reason on top, the unfinished steps Stopped and the clearance items Skipped. */
export const Withdrawn: S = {
  name: 'HR · withdrawn exit',
  render: () => (
    <ExitCaseWorkspace
      today={TODAY}
      live={{
        state: 'ready',
        data: { ...contract, status: 'withdrawn', interview: 'skipped', withdrawalReason: 'Contract was renewed last week', clearance: contract.clearance.map((c) => ({ ...c, status: 'waived', note: 'Exit withdrawn' })) },
        today: '2026-10-09', onBack: () => {}, onNotice: noop, onHrFacts: noop, onSignOff: noop, interviewHref: '#', checklistHref: () => '#', onWithdraw: noop,
      }}
    />
  ),
};

// Start an exit (People › Exit cases): the live dialog HR opens for an exit the company starts.
const startExit = (onStart: Parameters<typeof StartExitDialog>[0]['onStart'] = async () => ({ id: 'x-new' })) => <StartExitDialog people={PERSON_CHOICES} permissions={IR_PERMISSION_CHOICES} today={TODAY_KEY} onClose={() => undefined} onStart={onStart} />;
const fillRetrenchment = [pick('Person', /Imran Qureshi/), pick('Kind of exit', 'Retrenchment'), type(/^How the worker was chosen/, 'Last come, first go in the packing operator category'), choose('Wages in lieu'), pick('Government permission', /Hosur plant retrenchment/), date('Last working day', '31 Oct 2026'), type(/^Reason/, 'Packing line 3 closes after the move to Hosur unit 2')];
export const StartExit: S = { name: 'Start exit · open', render: () => startExit() };
export const StartExitRetrenchment: S = { name: 'Start exit · retrenchment filled (basis, notice, permission)', render: () => startExit(), play: play(...fillRetrenchment) };
export const StartExitTermination: S = { name: 'Start exit · termination (another HR person approves)', render: () => startExit(), play: play(pick('Person', /Rohit Menon/), pick('Kind of exit', 'Termination')) };
export const StartExitAbsconding: S = { name: 'Start exit · absconding (last day present, a past date)', render: () => startExit(), play: play(pick('Kind of exit', 'Absconding')) };
export const StartExitMissing: S = { name: 'Start exit · Start pressed with nothing filled', render: () => startExit(), play: play(press('Start exit')) };
export const StartExitFailed: S = { name: 'Start exit · the server refuses', render: () => startExit(async () => { throw new Error('Imran Qureshi already has an open exit case.'); }), play: play(...fillRetrenchment, press('Start exit')) };
