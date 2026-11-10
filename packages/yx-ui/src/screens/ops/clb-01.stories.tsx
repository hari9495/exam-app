import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContractorsScreen } from './contract';
import { CONTRACTORS, ESTABLISHMENTS, type Contractor } from './contract-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-01 · Contractors register', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { contractors: CONTRACTORS, establishments: ESTABLISHMENTS, today: TODAY };

// CL-1 (answers 623, 627): recorded licences carry their verification. Vetri's licence ends on 20 Oct 2026; its renewal
// was added and waits for verification; Kaveri's ended and has no renewal, so deployment there is blocked.
const vetri = CONTRACTORS[1]!;
const kaveri = CONTRACTORS[2]!;
const recorded: Contractor[] = [
  CONTRACTORS[0]!,
  { ...vetri, licences: [{ ...vetri.licences[0]!, id: 'l2', locationId: 'hosur', stateCodes: ['IN-TN'], validFrom: new Date(2024, 9, 21), status: 'verified', state: 'expiring', decided: { by: 'Lakshmi Venkatesan', at: '2024-10-18T10:00:00' }, fileName: 'vetri-licence-2024.pdf' }] },
  { ...kaveri, licences: [{ ...kaveri.licences[0]!, id: 'l3', locationId: 'hosur', stateCodes: ['IN-TN'], validFrom: new Date(2023, 7, 16), status: 'verified', state: 'expired', block: 'The contractor’s licence is not valid on this day.', decided: { by: 'Lakshmi Venkatesan', at: '2023-08-14T10:00:00' }, fileName: 'kaveri-licence-2023.pdf' }] },
  CONTRACTORS[3]!,
];
const withRenewal: Contractor[] = recorded.map((c) =>
  c.id === 'c2' ? { ...c, licences: [{ no: 'TN/OSH/CL/2026/2290', establishment: 'Hosur plant', scope: 'Establishment', states: ['Tamil Nadu'], stateCodes: ['IN-TN'], max: 20, id: 'l2r', locationId: 'hosur', validFrom: new Date(2026, 9, 21), validTo: new Date(2027, 9, 20), status: 'pending', state: 'pending', renewalOf: 'l2', fileName: 'vetri-licence-2026.pdf' }, ...c.licences] } : c,
);
const live = { ...base, contractors: recorded };

export const Register: S = { name: 'Register · renewal alerts', render: () => <ContractorsScreen {...base} /> };
export const Record: S = { name: 'Contractor record (licence, work order)', render: () => <ContractorsScreen {...base} openId="c2" /> };
export const Expired: S = { name: 'Expired licence record', render: () => <ContractorsScreen {...base} openId="c3" /> };
export const Empty: S = { render: () => <ContractorsScreen {...base} contractors={[]} state="empty" /> };
export const Loading: S = { render: () => <ContractorsScreen {...base} state="loading" /> };
export const AddContractor: S = { name: 'Add contractor (CL-1)', render: () => <ContractorsScreen {...live} sheet={{ kind: 'contractor', id: null }} /> };
export const ChangeContractor: S = { name: 'Change contractor details (CL-1)', render: () => <ContractorsScreen {...live} sheet={{ kind: 'contractor', id: 'c2' }} /> };
export const AddLicence: S = { name: 'Add licence (CL-1)', render: () => <ContractorsScreen {...live} sheet={{ kind: 'licence', contractorId: 'c2' }} /> };
export const Blocked: S = { name: 'Expired licence · deployment blocked (CL-1)', render: () => <ContractorsScreen {...live} openId="c3" /> };
export const Renew: S = { name: 'Add renewal (CL-1)', render: () => <ContractorsScreen {...live} sheet={{ kind: 'renew', licenceId: 'l2' }} /> };
export const RenewalPending: S = { name: 'Renewal waiting for verification (CL-1)', render: () => <ContractorsScreen {...live} contractors={withRenewal} openId="c2" /> };
export const Reject: S = { name: 'Reject a renewal with the reason (CL-1)', render: () => <ContractorsScreen {...live} contractors={withRenewal} sheet={{ kind: 'reject', licenceId: 'l2r' }} /> };
export const ReadOnly: S = { name: 'Read only (view key, CL-1)', render: () => <ContractorsScreen {...live} contractors={withRenewal} openId="c2" readOnly /> };
export const WorkOrder: S = { name: 'Add work order (CL-2)', render: () => <ContractorsScreen {...live} sheet={{ kind: 'workorder', contractorId: 'c2', id: null }} /> };
export const InviteContact: S = { name: 'Invite to contractor login (CL-3)', render: () => <ContractorsScreen {...live} sheet={{ kind: 'contact', contractorId: 'c3' }} /> };
