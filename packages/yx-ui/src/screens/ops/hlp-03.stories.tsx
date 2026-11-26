import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TicketWorkspaceScreen } from './helpdesk';
import { ARTICLES, MACROS, TICKETS, TICKET_ACTIVITY, TICKET_MESSAGES } from './helpdesk-data';
import { TODAY } from '../_kit/data';
import { liveTicket } from './helpdesk-ticket-live-samples';
import { AGENT_TICKET_FIELDS, LEAD_TICKET_FIELDS } from '../desk/ticket-fields-sample';
import { COSTS, DESK, DETAIL, TICKET, WORK } from '../desk/data';
import { play, press, pressFirst } from '../_kit/story-play';
import { DOCS_VIEW, HR_SUMMARY, KB_LINKS, PICKS, SEQUENCES, SEQUENCE_RUNS, SHARES, TICKET_REQUEST } from '../desk/esm-data';
import { RequestPanel } from '../desk/request-panel';
import { TicketEsmRail } from '../desk/esm2';
import { TicketKbCard } from '../desk/ticket-kb';
import { EscalateDialog, ResolveDialog, TicketWorkRail } from '../desk/work';
import type { TicketDetail } from '../desk/types';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-03 · Ticket workspace', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { ticket: TICKETS[0], messages: TICKET_MESSAGES, macros: MACROS, articles: ARTICLES, activity: TICKET_ACTIVITY, today: TODAY };

export const Reply: S = { render: () => <TicketWorkspaceScreen {...base} /> };
export const MacroInserted: S = { name: 'Reply with saved reply', render: () => <TicketWorkspaceScreen {...base} defaultDraft={MACROS[0].body.replace('{first_name}', 'Divya')} /> };
export const InternalNote: S = { name: 'Internal note', render: () => <TicketWorkspaceScreen {...base} defaultMode="note" defaultDraft="Checked with Karthik: leave was approved late because he was travelling." /> };
export const WaitingOnEmployee: S = { name: 'Waiting on employee (SLA paused)', render: () => <TicketWorkspaceScreen {...base} ticket={TICKETS[2]} messages={TICKET_MESSAGES.slice(0, 2)} /> };
export const Breached: S = { name: 'Breached SLA', render: () => <TicketWorkspaceScreen {...base} ticket={TICKETS[4]} messages={TICKET_MESSAGES.slice(0, 1)} /> };
export const Resolved: S = { render: () => <TicketWorkspaceScreen {...base} resolved /> };

// States the real ticket workspace has (Helpdesk design wiring, round 3; founder answer 1: the HLP design wins). Drawn in
// the same layout as the stories above, with the side cards the live page shows under the design's rail.
const ok = async () => undefined;
/** The side cards the page passes as `rail`: request and approvals, move / share / documents / follow-ups, articles, related tickets. */
function sampleRail(over: { ticket?: TicketDetail; canWork?: boolean; only?: 'request' | 'esm' | 'kb' | 'work' } = {}) {
  const t = over.ticket ?? TICKET;
  const canWork = over.canWork ?? true;
  const show = (k: string) => !over.only || over.only === k;
  return (
    <>
      {show('request') && <RequestPanel view={TICKET_REQUEST} canAsk={canWork} onAsk={ok} onFindPeople={async () => PICKS} />}
      {show('esm') && (
        <TicketEsmRail
          canWork={canWork}
          canMove={canWork}
          hr={HR_SUMMARY}
          desks={[{ id: 'd-it', name: 'IT help desk' }, { id: 'd-hr', name: 'HR help desk' }]}
          currentDeskId="d-it"
          shares={SHARES}
          categories={() => [{ id: 'cat-let', name: 'Letters', sensitive: false }]}
          sensitive={false}
          onMove={ok}
          onShare={ok}
          onUnshare={ok}
          documents={DOCS_VIEW}
          onMakeDocument={ok}
          onWithdrawDocument={ok}
          sequences={SEQUENCES}
          runs={SEQUENCE_RUNS}
          onStartSequence={ok}
          onStopSequence={ok}
        />
      )}
      {show('kb') && <TicketKbCard links={KB_LINKS} solved={false} canWork={canWork} spaces={[{ id: 's1', name: 'IT help' }]} onSolvedBy={ok} onFlag={ok} onMakeArticle={async () => ({ id: 'a9' })} onOpenArticle={() => undefined} />}
      {show('work') && (
        <TicketWorkRail
          ticket={t}
          detail={DETAIL}
          work={WORK}
          desks={[DESK]}
          meId="u-suresh"
          onFindTicket={async () => []}
          onOpenTicket={() => undefined}
          onLink={ok}
          onUnlink={ok}
          onMerge={ok}
          onSplit={async () => ({ id: 'n' })}
          onSetParent={ok}
          onSetTracker={ok}
          onStartSide={ok}
          onSideMessage={ok}
          onCloseSide={ok}
          onAddTask={ok}
          onUpdateTask={ok}
          onBreachReason={ok}
          onExclude={ok}
          onRemind={ok}
          onSnooze={ok}
          onDoneReminder={ok}
          onUnmask={async () => 'ABCPE1234F'}
        />
      )}
    </>
  );
}

const WithEscalate = () => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <TicketWorkspaceScreen live={liveTicket({ rail: sampleRail({ only: 'work' }) })} />
      <EscalateDialog open={open} onOpenChange={setOpen} ticket={TICKET} detail={DETAIL} onEscalate={async () => undefined} />
    </>
  );
};
const WithResolve = () => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <TicketWorkspaceScreen live={liveTicket({ rail: sampleRail({ only: 'work' }) })} />
      <ResolveDialog open={open} onOpenChange={setOpen} ticket={TICKET} codes={[{ id: 'rc1', code: 'fixed', label: 'Fixed', active: true }]} required linked={0} onResolve={async () => undefined} />
    </>
  );
};
export const AgentWorking: S = { name: 'Agent · colleague writing, mentions and files', render: () => <TicketWorkspaceScreen live={liveTicket({ others: [{ userId: 'u-farah', name: 'Farah Khan', typing: true }], rail: sampleRail({ only: 'kb' }) })} /> };
export const RequestApprovals: S = { name: 'Request and approvals · ask a colleague to approve', render: () => <TicketWorkspaceScreen live={liveTicket({ rail: sampleRail({ only: 'request' }) })} /> };
export const MoveShareDocs: S = { name: 'Move, share, documents and follow-ups', render: () => <TicketWorkspaceScreen live={liveTicket({ rail: sampleRail({ only: 'esm' }) })} /> };
export const Articles: S = { name: 'Articles used · solved by, out of date, make one', render: () => <TicketWorkspaceScreen live={liveTicket({ rail: sampleRail({ only: 'kb' }) })} /> };
export const RelatedTickets: S = { name: 'Related tickets, merge, tasks, side conversations, targets, reminders', render: () => <TicketWorkspaceScreen live={liveTicket({ rail: sampleRail({ only: 'work' }) })} /> };
export const Escalate: S = { name: 'Move to another support level', render: () => <WithEscalate /> };
export const ResolveWithCode: S = { name: 'Resolve · code and note', render: () => <WithResolve /> };
export const ResolvedRated: S = { name: 'Resolved · closes on, the rating', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, systemState: 'solved', resolvedAt: '2026-10-08T05:00:00Z', closesOn: '2026-10-11T05:00:00Z', rating: 4 } })} /> };
// Answer 1646: a ticket raised while the desk was closed carries a badge.
export const OutsideHours: S = { name: 'Raised outside hours', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, raisedOutsideHours: true } })} /> };
// Answer 1661: an IT desk's agent sets or changes the device a ticket is about (any company device, by tag or name).
export const Application: S = { name: 'IT ticket · application set by an IT agent (answer 2057)', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, app: { id: 'a1', name: 'Tally Prime' }, appOptions: [{ id: 'a1', name: 'Tally Prime' }, { id: 'a2', name: 'Attendance devices' }] }, onSetApp: async () => undefined })} /> };
export const Costs: S = { name: 'IT ticket · costs: time at the team rate, fixed and material, dated (2719, 2810)', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, costs: COSTS } })} /> };
export const CostsAddTooEarly: S = { name: 'IT ticket · costs · Add cost pressed with nothing filled', render: Costs.render, play: play(press('Add cost')) };
export const CostsTakeOff: S = { name: 'IT ticket · costs · take a cost off (reason asked)', render: Costs.render, play: play(pressFirst('Take off')) };
export const CostsNoRate: S = { name: 'IT ticket · costs · team has no hourly rate', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, costs: { ...COSTS, hourlyRate: null, timeCost: '0.00', uncostedMinutes: 45, lines: [], total: '0.00' } } })} /> };
export const Device: S = { name: 'IT ticket · device set by an IT agent', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, device: { id: 'as1', label: 'Dell Latitude 5440 (KF-LT-0142)', detail: 'Laptop' }, canSetDevice: true }, onPickDevice: async () => [{ id: 'as1', label: 'Dell Latitude 5440 (KF-LT-0142)', detail: 'Laptop' }, { id: 'as2', label: 'Logitech headset (KF-HS-0077)', detail: 'Accessory' }], onSetDevice: async () => undefined })} /> };
// Answers 1641, 1650: the desk's own fields on the ticket: a team lead sees and sets every field, a first-line agent
// not the team-lead-only one; someone who only reads sees the values.
export const FieldsLead: S = { name: 'Fields · a team lead sets them (drop-down narrowed by another)', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, deskFields: LEAD_TICKET_FIELDS, canSetFields: true }, onSetFields: async () => undefined })} /> };
export const FieldsAgent: S = { name: 'Fields · a first-line agent (no team-lead-only field)', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, deskFields: AGENT_TICKET_FIELDS, canSetFields: true }, onSetFields: async () => undefined })} /> };
export const FieldsReadOnly: S = { name: 'Fields · read only', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, access: 'observer', canWork: false, deskFields: AGENT_TICKET_FIELDS, canSetFields: false } })} /> };
// Answer 1843: a field the desk needs before solving says so; Resolve is refused until it has a value.
export const FieldsRequired: S = { name: 'Fields · required before solving', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, deskFields: AGENT_TICKET_FIELDS.map((f) => (f.key === 'vendor_ticket' ? { ...f, value: null, display: null, requiredToSolve: true } : f)), canSetFields: true }, onSetFields: async () => undefined })} /> };
// Helpdesk plan item 4: a facilities work order names the building, area and equipment.
export const Place: S = { name: 'Facilities work order · building, area and equipment', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, canSetPlace: true, place: { building: { id: 'l-blr', name: 'Bengaluru office' }, area: { id: 'ar1', name: 'Ground floor' }, equipment: { id: 'e1', name: 'Passenger lift (BLR-LIFT-01)' } } }, onPickPlace: async () => [{ id: 'e1', label: 'Passenger lift (BLR-LIFT-01)', detail: 'Lift' }], onSetPlace: async () => undefined })} /> };
export const Collaborator: S = { name: 'Collaborator · notes only', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, access: 'collaborator', canWork: false }, rail: sampleRail({ canWork: false, only: 'kb' }) })} /> };
export const ReadOnly: S = { name: 'Desk admin · read only', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, access: 'observer', canWork: false, canNote: false } })} /> };
export const SenderUnverified: S = { name: 'Email from an unproven sender, customer', render: () => <TicketWorkspaceScreen live={liveTicket({ ticket: { ...TICKET, channel: 'email', senderVerified: false, customer: { account: { id: 'ac1', name: 'Sunrise Retail' }, plan: 'gold' }, product: { id: 'pr1', name: 'Kaveri billing app' } } })} /> };
export const NoAccess: S = { name: 'No access (not on this desk)', render: () => <TicketWorkspaceScreen live={liveTicket({ state: 'no-access', ticket: null })} /> };
