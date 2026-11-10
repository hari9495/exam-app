// Contract labour CL-1 live (CLB-01 Contractors register; docs/yukthix/contract-labour-design-map.md): the designed
// ContractorsScreen renders this when the page passes `live`. The same view as the design (ContractorsView) with the
// company's contractors, their licences and renewals, and the actions the person may take. What CL-1 has no data for
// yet is left out, never shown with sample values: the establishment cards (deployments, CL-2), the work order and
// the contractor login (CL-3). The server checks every rule again.
import { ContractorsView, WorkersView, type ContractorInput, type LicenceInput, type RenewalInput, type WorkerInput, type WorkOrderInput } from './contract';
import type { ContractWorker, Contractor } from './contract-data';
import type { CheckRow } from './ops-kit';

/** GET /contract-labour/contractors. */
export interface ContractorsData {
  canManage: boolean;
  today: string;
  alertDays: number[];
  locations: { id: string; name: string; state: string }[];
  states: { code: string; name: string }[];
  /** Answer 674 (CL-2): sites with contractor licences or contract workers. */
  establishments?: { id: string; name: string; state: string; workers: number; licenceMax: number; threshold: number | null; verify: boolean }[];
  contractors: {
    id: string;
    name: string;
    work: string;
    contactEmail: string | null;
    pan: string | null;
    panVerified: boolean;
    gstin: string | null;
    pfCode: string | null;
    esicCode: string | null;
    lin: string | null;
    active: boolean;
    contacts?: { id: string; name: string; email: string; portal: 'invited' | 'active' }[];
    workOrders?: { id: string; number: string; fromOn: string; toOn: string; headcount: number; active: number; sites: { id: string; name: string }[]; version: number }[];
    licences: {
      id: string;
      no: string;
      locationId: string;
      establishment: string;
      scope: string;
      states: string[];
      max: number;
      validFrom: string;
      validTo: string;
      status: 'pending' | 'verified' | 'rejected';
      state: 'pending' | 'rejected' | 'not-started' | 'valid' | 'expiring' | 'expired' | 'renewed';
      renewalOfId: string | null;
      rejectReason: string | null;
      decided: { by: string; at: string } | null;
      file: { name: string; scan: 'clean' | 'pending' | 'infected' };
      block: string | null;
    }[];
  }[];
}

export interface ContractorsLive {
  state: 'loading' | 'ready' | 'error';
  data: ContractorsData | null;
  onRetry: () => void;
  onSaveContractor: (id: string | null, input: ContractorInput) => Promise<unknown>;
  onAddLicence: (contractorId: string, input: LicenceInput, file: File) => Promise<unknown>;
  onRenew: (licenceId: string, input: RenewalInput, file: File) => Promise<unknown>;
  onVerify: (licenceId: string) => Promise<unknown>;
  onReject: (licenceId: string, reason: string) => Promise<unknown>;
  onOpenFile: (licenceId: string) => void;
  onSaveWorkOrder?: (contractorId: string, id: string | null, input: WorkOrderInput) => Promise<unknown>;
  onAddContact?: (contractorId: string, input: { name: string; email: string }) => Promise<unknown>;
  onRemoveContact?: (contractorId: string, contactId: string) => Promise<unknown>;
}

const date = (s: string) => new Date(`${s}T00:00:00`);
const listText = (days: number[]) => (days.length ? `${days.slice(0, -1).join(', ')}${days.length > 1 ? ' and ' : ''}${days[days.length - 1]} days before expiry` : 'None');

/** API rows as the design's contractors (state names for the scope line, dates as days). */
export function contractorsOf(data: ContractorsData): Contractor[] {
  const name = (code: string) => data.states.find((s) => s.code === code)?.name ?? code;
  return data.contractors.map((c) => ({
    id: c.id,
    name: c.name,
    work: c.work,
    pan: c.pan ?? '',
    panVerified: c.panVerified,
    gstin: c.gstin ?? '',
    pfCode: c.pfCode ?? '',
    esicCode: c.esicCode ?? '',
    lin: c.lin ?? '',
    contact: c.contactEmail ?? '',
    contactEmail: c.contactEmail,
    loginInvited: false,
    status: c.active ? 'Active' : 'Inactive',
    contacts: c.contacts ?? [],
    workOrders: c.workOrders?.map((w) => ({ id: w.id, number: w.number, from: date(w.fromOn), to: date(w.toOn), headcount: w.headcount, active: w.active, sites: w.sites, version: w.version })),
    licences: c.licences.map((l) => ({
      id: l.id,
      no: l.no,
      locationId: l.locationId,
      establishment: l.establishment,
      scope: l.scope,
      states: l.states.map(name),
      stateCodes: l.states,
      max: l.max,
      validFrom: date(l.validFrom),
      validTo: date(l.validTo),
      status: l.status,
      state: l.state,
      renewalOf: l.renewalOfId,
      rejectReason: l.rejectReason,
      decided: l.decided,
      block: l.block,
      fileName: l.file.scan === 'clean' ? l.file.name : null,
    })),
  }));
}

export function LiveContractors({ live }: { live: ContractorsLive }) {
  const d = live.data;
  return (
    <ContractorsView
      contractors={d ? contractorsOf(d) : []}
      establishments={(d?.establishments ?? []).filter((e) => e.threshold !== null).map((e) => ({ name: e.name, state: e.state, rc: '—', family: 'OSH Code', workers: e.workers, threshold: e.threshold!, validTo: null, licenceMax: e.licenceMax }))}
      today={d ? date(d.today) : new Date()}
      state={live.state === 'ready' ? (d && d.contractors.length ? 'ready' : 'empty') : live.state}
      openId={null}
      sheet={null}
      canManage={Boolean(d?.canManage)}
      locations={d?.locations ?? []}
      states={d?.states ?? []}
      alertText={d ? listText(d.alertDays) : undefined}
      onRetry={live.onRetry}
      onSaveContractor={live.onSaveContractor}
      onAddLicence={live.onAddLicence}
      onRenew={live.onRenew}
      onVerify={live.onVerify}
      onReject={live.onReject}
      onOpenFile={live.onOpenFile}
      onSaveWorkOrder={live.onSaveWorkOrder}
      onAddContact={live.onAddContact}
      onRemoveContact={live.onRemoveContact}
    />
  );
}

/* ---------------- CL-2 live: CLB-02 contract workers ---------------- */

/** GET /contract-labour/workers. */
export interface WorkersData {
  canManage: boolean;
  today: string;
  inductionRequired: boolean;
  inductionMonths: number;
  contractors: { id: string; name: string }[];
  locations: { id: string; name: string; state: string }[];
  workers: {
    id: string;
    personId: string;
    name: string;
    contractor: { id: string; name: string };
    site: { id: string; name: string };
    skill: string;
    wage: string | null;
    fromOn: string;
    toOn: string | null;
    status: 'pending' | 'deployed' | 'released';
    gatePass: string | null;
    gateValidTo: string | null;
    induction: { on: string; by: string | null } | null;
    uan: string | null;
    esicIp: string | null;
    idMasked: string;
    releasedOn: string | null;
    releaseReason: string | null;
    version: number;
  }[];
}
export interface WorkersLive {
  state: 'loading' | 'ready' | 'error';
  data: WorkersData | null;
  onRetry: () => void;
  onCheck: (input: WorkerInput) => Promise<CheckRow[]>;
  onSend: (input: WorkerInput) => Promise<unknown>;
  onApprove: (id: string, version: number, induction: { on: string | null; by: string | null }) => Promise<unknown>;
  onRelease: (id: string, version: number, on: string, reason: string) => Promise<unknown>;
}
const STATUS: Record<WorkersData['workers'][number]['status'], ContractWorker['status']> = { pending: 'Pending approval', deployed: 'Deployed', released: 'Released' };

/** API rows as the design's contract workers. */
export function workersOf(data: WorkersData): ContractWorker[] {
  return data.workers.map((w) => ({
    id: w.id,
    name: w.name,
    contractor: w.contractor.name,
    site: w.site.name,
    skill: w.skill as ContractWorker['skill'],
    wage: w.wage === null ? null : Number(w.wage),
    from: date(w.fromOn),
    to: w.toOn ? date(w.toOn) : null,
    gatePass: w.gatePass,
    gateValidTo: w.gateValidTo ? date(w.gateValidTo) : null,
    uan: w.uan ?? '',
    ip: w.esicIp ?? '',
    idMasked: w.idMasked,
    status: STATUS[w.status],
    induction: w.induction ? { on: date(w.induction.on), by: w.induction.by } : null,
    version: w.version,
  }));
}

export function LiveWorkers({ live }: { live: WorkersLive }) {
  const d = live.data;
  return (
    <WorkersView
      workers={d ? workersOf(d) : []}
      contractors={d?.contractors ?? []}
      locations={d?.locations ?? []}
      today={d ? date(d.today) : new Date()}
      state={live.state === 'ready' ? (d && d.workers.length ? 'ready' : 'empty') : live.state}
      sheet={null}
      canManage={Boolean(d?.canManage)}
      inductionRequired={d?.inductionRequired ?? true}
      inductionMonths={d?.inductionMonths ?? 12}
      onRetry={live.onRetry}
      onCheck={live.onCheck}
      onSend={live.onSend}
      onApprove={live.onApprove}
      onRelease={live.onRelease}
    />
  );
}
