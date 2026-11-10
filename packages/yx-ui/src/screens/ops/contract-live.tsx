// Contract labour CL-1 live (CLB-01 Contractors register; docs/yukthix/contract-labour-design-map.md): the designed
// ContractorsScreen renders this when the page passes `live`. The same view as the design (ContractorsView) with the
// company's contractors, their licences and renewals, and the actions the person may take. What CL-1 has no data for
// yet is left out, never shown with sample values: the establishment cards (deployments, CL-2), the work order and
// the contractor login (CL-3). The server checks every rule again.
import { ContractorsView, type ContractorInput, type LicenceInput, type RenewalInput } from './contract';
import type { Contractor } from './contract-data';

/** GET /contract-labour/contractors. */
export interface ContractorsData {
  canManage: boolean;
  today: string;
  alertDays: number[];
  locations: { id: string; name: string; state: string }[];
  states: { code: string; name: string }[];
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
      establishments={[]}
      today={d ? date(d.today) : new Date()}
      state={live.state === 'ready' ? (d && d.contractors.length ? 'ready' : 'empty') : live.state}
      openId={null}
      sheet={null}
      canManage={Boolean(d?.canManage)}
      portal={false}
      workOrder={false}
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
    />
  );
}
