import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContractWorkersLiveScreen, ContractorsLiveScreen, type LiveContractor, type LiveSite, type LiveWorker } from './contract-live';

// CLB-01 and CLB-02, live (founder decision 21 Oct 2026): the designed contract labour screens with live data only.
// Left out until they have data: the worker import and the contractor's own login.
const meta: Meta = { title: 'Screens/Contract labour/Live', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const ok = async () => ({});
const TODAY = '2026-09-29';
const SITES: LiveSite[] = [
  { id: 'hsr', name: 'Hosur plant', state: 'IN-TN', legalEntityId: 'tn' },
  { id: 'blr', name: 'Bengaluru head office', state: 'IN-KA', legalEntityId: 'ka' },
];
const lic = (id: string, no: string, site: LiveSite, states: string[], max: number, active: number, validTo: string) => ({ id, licenceNo: no, locationId: site.id, site: site.name, states, maxWorkers: max, active, validFrom: '2026-01-01', validTo });
const CONTRACTORS: LiveContractor[] = [
  { id: 'c1', legalEntityId: 'tn', name: 'Sri Lakshmi Facility Services', work: 'Housekeeping', pan: 'AAKFS4471L', contact: 'Lakshmi Narayanan', status: 'active', licences: [lic('l1', 'TN/OSH/CL/2026/1180', SITES[0], ['IN-TN', 'IN-KA'], 30, 2, '2026-12-31')] },
  { id: 'c2', legalEntityId: 'tn', name: 'Vetri Security Agency', work: 'Security', pan: 'AAHFV2210K', contact: 'Selvam K.', status: 'active', licences: [lic('l2', 'TN/CLRA/2024/0442', SITES[0], ['IN-TN'], 3, 3, '2026-11-20')] },
  { id: 'c3', legalEntityId: 'ka', name: 'Annapoorna Canteen Services', work: 'Canteen', pan: 'AAMFA5512P', contact: 'Geetha P.', status: 'active', licences: [lic('l3', 'KA/OSH/CL/2026/0341', SITES[1], ['IN-KA'], 12, 1, '2028-03-31')] },
];
const entityName = (id: string) => (id === 'tn' ? 'Kaveri Foods (Tamil Nadu) Pvt Ltd' : 'Kaveri Foods Pvt Ltd');
const W = (id: string, name: string, k: LiveContractor, work: string, skill: LiveWorker['skill'], wage: string, fromOn: string, status: LiveWorker['status'] = 'deployed'): LiveWorker => ({
  id,
  personId: `p-${id}`,
  name,
  contractorId: k.id,
  contractor: k.name,
  licenceNo: k.licences[0].licenceNo,
  legalEntity: { id: k.legalEntityId, name: entityName(k.legalEntityId) },
  site: { id: k.licences[0].locationId, name: k.licences[0].site },
  work,
  skill,
  wage,
  fromOn,
  toOn: null,
  status,
  aadhaarLast4: String(1000 + id.length * 73 + name.length * 7).slice(-4),
  uanLast4: String(3000 + name.length * 31).slice(-4),
  esicLast4: String(10 + name.length).padStart(4, '0'),
  gatePass: `GP-${4100 + name.length}`,
  gatePassValidTo: '2026-12-31',
});
const WORKERS: LiveWorker[] = [
  W('w1', 'Murugan P.', CONTRACTORS[0], 'Housekeeping', 'unskilled', '14820.00', '2026-04-02'),
  W('w2', 'Selvi R.', CONTRACTORS[0], 'Housekeeping', 'unskilled', '14820.00', '2026-05-06'),
  W('w3', 'Anbu Selvan', CONTRACTORS[1], 'Security guard', 'semi_skilled', '16240.00', '2026-03-11'),
  W('w4', 'Karthika M.', CONTRACTORS[1], 'Security guard', 'semi_skilled', '16240.00', '2026-06-15'),
  W('w5', 'Ramesh Babu', CONTRACTORS[1], 'Security guard', 'semi_skilled', '16240.00', '2026-09-28', 'pending'),
  W('w6', 'Shanthi V.', CONTRACTORS[2], 'Cook', 'skilled', '19200.00', '2026-07-01'),
];
const workers = { state: 'ready' as const, today: TODAY, workers: WORKERS, contractors: CONTRACTORS, sites: SITES, canManage: true, onDeploy: ok, onApprove: ok, onRelease: ok, canReveal: true, onReveal: async () => '548550001073', onSetIdentifiers: ok, onMinimumWage: async () => ({ monthly: '14820.00', text: 'Minimum for zone 1, unskilled: ₹14,820 a month' }), onExport: () => {} };
export const Workers: S = { name: 'CLB-02 · Contract workers, live', render: () => <ContractWorkersLiveScreen {...workers} /> };
export const WorkersDeploy: S = { name: 'CLB-02 · Contract workers, live · deploy (checks)', render: () => <ContractWorkersLiveScreen {...workers} defaultDeployOpen /> };
export const WorkersAtMaximum: S = { name: 'CLB-02 · Contract workers, live · deploy, licence maximum reached', render: () => <ContractWorkersLiveScreen {...workers} contractors={[CONTRACTORS[1]]} defaultDeployOpen /> };
export const WorkersReadOnly: S = { name: 'CLB-02 · Contract workers, live · plant HR (read only, Hosur)', render: () => <ContractWorkersLiveScreen {...workers} workers={WORKERS.filter((w) => w.site.id === 'hsr')} canManage={false} /> };
export const WorkersEmpty: S = { name: 'CLB-02 · Contract workers, live · nothing yet', render: () => <ContractWorkersLiveScreen {...workers} workers={[]} /> };
const contractors = { state: 'ready' as const, today: TODAY, contractors: CONTRACTORS, entities: [{ id: 'tn', name: entityName('tn') }, { id: 'ka', name: entityName('ka') }], sites: SITES, canManage: true, onAdd: ok, onAddLicence: ok };
export const Contractors: S = { name: 'CLB-01 · Contractors, live', render: () => <ContractorsLiveScreen {...contractors} /> };
export const ContractorsEmpty: S = { name: 'CLB-01 · Contractors, live · nothing yet', render: () => <ContractorsLiveScreen {...contractors} contractors={[]} /> };
