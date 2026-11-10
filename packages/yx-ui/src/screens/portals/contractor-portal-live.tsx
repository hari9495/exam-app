// T9-13 contractor portal, live (CL-3, answers 631, 636, 678): the designed ContractorPortalScreen renders this when the
// page passes `live`. The same parts as the design (what is due, licences with the renewal upload, work orders, workers
// with the add-worker form) with the contractor's own records. Monthly packs and bills come with CL-4 and are left out,
// never shown with sample values. A call answered 401 part-way shows "sign in again".
import { Button } from '../../components/button';
import { EmptyState } from '../../components/feedback';
import { TenantPortal } from './portals-kit';
import { ClAttendance, ClBillList, ClDue, ClLicences, ClPackList, ClPackView, ClWorkerList, ClWorkOrders, type MinWageHint, type PortalCheck, type PortalPackSummary, type PortalRenewalInput, type PortalUploadInput, type PortalWorkerInput, type PortalAttendance } from './contractor-portal';

export type LiveContractorTab = 'establishments' | 'workers' | 'attendance' | 'packs' | 'bills';
/** GET /public/contractor-portal/:org/me. */
export interface ContractorPortalData {
  company: string;
  contractor: { name: string; work: string };
  contact: { name: string; email: string };
  today: string;
  sites: { id: string; name: string }[];
  establishments: { licenceId: string; site: { id: string; name: string }; licenceNo: string; scope: string; issuedBy?: string | null; states: string[]; maxWorkers: number; deployed: number; validFrom: string; validTo: string; state: string; renewal: { id: string; licenceNo: string; status: 'pending' | 'verified' | 'rejected'; validTo: string; rejectReason: string | null } | null }[];
  workOrders: { id: string; number: string; fromOn: string; toOn: string; headcount: number; active: number; sites: string[] }[];
  workers: { id: string; name: string; idMasked: string; site: string; skill: string; wage: string | null; fromOn: string; toOn: string | null; status: 'pending' | 'deployed'; gatePass: string | null; gateValidTo: string | null; uan: string | null; esicIp: string | null }[];
  due: { kind: string; tone: 'danger' | 'warning' | 'info'; text: string }[];
}
export interface LiveContractorPortal {
  tenant: string;
  tab: LiveContractorTab;
  hrefFor: (tab: LiveContractorTab) => string;
  state: 'ready' | 'loading' | 'error';
  onRetry: () => void;
  /** The session ended part-way (a call answered 401). */
  ended: boolean;
  onSignInAgain: () => void;
  onSignOut: () => void;
  data: ContractorPortalData | null;
  onCheck: (input: PortalWorkerInput) => Promise<PortalCheck[]>;
  onAdd: (input: PortalWorkerInput) => Promise<unknown>;
  /** Answer 754: the worker's photo, after the worker is sent. */
  onPhoto?: (id: string, file: File) => Promise<unknown>;
  onRenew: (licenceId: string, input: PortalRenewalInput, file: File) => Promise<unknown>;
  /** CL-4: the packs owed, the one open, the bills; the uploads; the minimum-wage hint (685). */
  packs?: PortalPackSummary[];
  pack?: ContractorPackData | null;
  bills?: { held: string[]; bills: { id: string; no: string; period: string; amount: string; tds: string | null; recovery: string; net: string | null; status: 'Paid' | 'Rejected' | 'On hold' | 'Being checked' | 'Due'; paidOn: string | null }[] } | null;
  onOpenPack?: (p: PortalPackSummary | null) => void;
  onUpload?: (input: PortalUploadInput, file: File) => Promise<unknown>;
  onMinWage?: (locationId: string, skill: string) => Promise<MinWageHint | null>;
  /** Answer 736. */
  onWithdraw?: (id: string, reason: string) => Promise<unknown>;
  /** CL-5 (answer 625): the days on site for a site and month, and saving the contractor's marks. */
  attendance?: { siteId: string | null; month: string; data: PortalAttendance | null };
  onPickAttendance?: (siteId: string, month: string) => void;
  onSaveAttendance?: (entries: { deploymentId: string; days: string[] }[]) => Promise<unknown>;
}
/** GET /public/contractor-portal/:org/pack. */
export interface ContractorPackData {
  site: { id: string; name: string };
  month: string;
  due: string;
  status: 'open' | 'submitted' | 'verified' | 'discrepancy' | 'overdue';
  required?: ('pf_challan' | 'esi_challan' | 'wage_register' | 'bank_proof' | 'muster_roll')[];
  items: Record<'pf_challan' | 'esi_challan' | 'wage_register' | 'bank_proof' | 'muster_roll', { state: 'submitted' | 'verified' | 'discrepancy'; note: string | null; fileName: string; workersCovered: number | null; amount: string | null } | null>;
  workers: { deploymentId: string; name: string; idMasked: string; skill: string; line: { days: number; gross: string; paidOn: string } | null; minimum: { monthly: string; daily: string; source: string; verify: boolean } | null; short: string | null }[];
  checks: { id: string; label: string; status: 'pass' | 'fail' | 'pending'; detail?: string }[];
}

const TABS: { id: LiveContractorTab; label: string }[] = [
  { id: 'establishments', label: 'Establishments and licences' },
  { id: 'workers', label: 'Workers' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'packs', label: 'Monthly packs' },
  { id: 'bills', label: 'Bills' },
];
const dOf = (s: string) => new Date(`${s}T00:00:00`);

export function LiveContractorPortalView({ live }: { live: LiveContractorPortal }) {
  const d = live.data;
  const today = d ? dOf(d.today) : new Date();
  const body = () => {
    if (live.ended) return <EmptyState title="Your session ended." description="Sign in again with a new code." action={<Button variant="primary" onClick={live.onSignInAgain}>Sign in again</Button>} />;
    if (live.state === 'error') return <EmptyState title="This page could not be loaded." action={<Button onClick={live.onRetry}>Try again</Button>} />;
    if (live.state === 'loading' || !d) return <EmptyState compact title="Loading…" />;
    if (live.tab === 'establishments')
      return (
        <div className="yx-ps-stack">
          <ClDue items={d.due} />
          <ClLicences
            today={today}
            items={d.establishments.map((e) => ({ id: e.licenceId, site: e.site.name, licenceNo: e.licenceNo, authority: e.issuedBy ?? undefined, nature: e.scope, maxWorkers: e.maxWorkers, deployed: e.deployed, validTo: dOf(e.validTo), renewal: e.renewal ? { licenceNo: e.renewal.licenceNo, status: e.renewal.status, validTo: dOf(e.renewal.validTo), rejectReason: e.renewal.rejectReason } : null }))}
            onRenew={live.onRenew}
          />
          <ClWorkOrders items={d.workOrders.map((w) => ({ id: w.id, number: w.number, from: dOf(w.fromOn), to: dOf(w.toOn), headcount: w.headcount, active: w.active, sites: w.sites }))} />
        </div>
      );
    if (live.tab === 'attendance') {
      const sites = [...new Map([...d.sites, ...(live.packs ?? []).map((x) => x.site)].map((x) => [x.id, x])).values()];
      return <ClAttendance key={`${live.attendance?.siteId}-${live.attendance?.month}-${live.attendance?.data?.workers.map((w) => w.present).join()}`} today={today} sites={sites} siteId={live.attendance?.siteId ?? null} month={live.attendance?.month ?? d.today.slice(0, 7)} data={live.attendance?.data ?? null} onPick={live.onPickAttendance} onSave={live.onSaveAttendance} />;
    }
    if (live.tab === 'packs') {
      if (live.pack) return <ClPackView pack={{ ...live.pack, due: dOf(live.pack.due) }} today={today} onBack={() => live.onOpenPack?.(null)} onUpload={live.onUpload} />;
      return <ClPackList items={live.packs ?? []} onOpen={(p) => live.onOpenPack?.(p)} />;
    }
    if (live.tab === 'bills') return <ClBillList held={live.bills?.held ?? []} bills={(live.bills?.bills ?? []).map((b) => ({ ...b, amount: Number(b.amount), tds: b.tds === null ? null : Number(b.tds), recovery: Number(b.recovery), net: b.net === null ? null : Number(b.net) }))} />;
    return (
      <ClWorkerList
        today={today}
        sites={d.sites}
        workers={d.workers.map((w) => ({ id: w.id, name: w.name, idMasked: w.idMasked, uan: w.uan ?? '', esic: w.esicIp ?? '', skill: w.skill, wage: w.wage === null ? null : Number(w.wage), site: w.site, from: dOf(w.fromOn), gatePass: w.gatePass, gateValidTo: w.gateValidTo ? dOf(w.gateValidTo) : null, status: w.status === 'pending' ? 'Pending approval' : 'Deployed' }))}
        onCheck={live.onCheck}
        onAdd={live.onAdd}
        onPhoto={live.onPhoto}
        onMinWage={live.onMinWage}
        onWithdraw={live.onWithdraw}
      />
    );
  };
  return (
    <TenantPortal
      tenant={d?.company ?? live.tenant}
      portal={`Contractor portal${d ? ` · ${d.contractor.name}` : ''}`}
      nav={TABS.map((t) => ({ label: t.label, active: t.id === live.tab, href: live.hrefFor(t.id) }))}
      access={{ kind: 'otp', identity: d?.contact.email ?? '', endsOn: today, today, endsBecause: 'contract end' }}
      footer={{ privacy: 'Privacy notice for contract-labour vendors (G-09)' }}
      noLanguage
      onSignOut={live.onSignOut}
    >
      {body()}
    </TenantPortal>
  );
}
