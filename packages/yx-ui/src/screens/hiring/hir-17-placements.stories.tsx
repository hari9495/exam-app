import type { Meta, StoryObj } from '@storybook/react-vite';
import { BenchBoardScreen, PlacementFee, PlacementHours, PlacementRecordScreen, PlacementsScreen } from './hiring-staffing';
import { PLACEMENTS } from './hiring-data';
import { TODAY } from '../_kit/data';
import { BenchSheet, PlacementSheet } from './staffing-sheets';


const meta: Meta = { title: 'Screens/Hiring/HIR-17 · Placements and bench board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'Placements list with margin', render: () => <PlacementsScreen rows={PLACEMENTS} /> };
export const Record: S = { name: 'Placement record · ending soon', render: () => <PlacementRecordScreen placement={PLACEMENTS[1]} today={TODAY} /> };
export const Extend: S = { name: 'Extend (dated change)', render: () => <PlacementRecordScreen placement={PLACEMENTS[1]} today={TODAY} action="extend" /> };
export const EndEarly: S = { name: 'End early · confirmation', render: () => <PlacementRecordScreen placement={PLACEMENTS[0]} today={TODAY} action="end" /> };
export const VendorSupplied: S = { name: 'Vendor-supplied placement', render: () => <PlacementRecordScreen placement={PLACEMENTS[3]} today={TODAY} /> };
export const Bench: S = { name: 'Bench board · policy days', render: () => <BenchBoardScreen rows={PLACEMENTS} today={TODAY} /> };
export const BenchEmpty: S = { name: 'Bench · empty', render: () => <BenchBoardScreen rows={[]} today={TODAY} /> };
export const Loading: S = { name: 'Loading', render: () => <PlacementsScreen rows={[]} state="loading" /> };

// Drawn for the live page (staffing slice 2): a placement from a selected submission; adding someone to the bench.
export const NewPlacement: S = {
  name: 'New placement · from a selected submission',
  render: () => (
    <>
      <PlacementsScreen rows={PLACEMENTS} />
      <PlacementSheet open onOpenChange={() => {}} today={TODAY} placeable={[{ id: 's1', person: 'Kiran Joshi', job: 'Java Developer', source: 'employee' }, { id: 's2', person: 'Deepak Rao', job: 'Java Developer', source: 'candidate' }]} onSave={async () => {}} />
    </>
  ),
};
// Answers 638 and 822: our own employee at a client that has sites is placed at one (it counts against our licence).
export const NewPlacementSite: S = {
  name: 'New placement · client site required for own staff (822)',
  render: () => (
    <>
      <PlacementsScreen rows={PLACEMENTS} />
      <PlacementSheet open onOpenChange={() => {}} today={TODAY} placeable={[{ id: 's1', person: 'Kiran Joshi', job: 'Security guard', source: 'employee', sites: [{ id: 'cs1', name: 'Ambattur unit' }, { id: 'cs2', name: 'Peenya warehouse' }] }]} onSave={async () => {}} />
    </>
  ),
};
export const AddToBench: S = {
  name: 'Add to bench',
  render: () => (
    <>
      <BenchBoardScreen rows={PLACEMENTS} today={TODAY} />
      <BenchSheet open onOpenChange={() => {}} today={TODAY} people={[{ value: 'e2', label: 'Kiran Joshi' }]} onSave={async () => {}} />
    </>
  ),
};
export const RecruiterView: S = {
  name: 'Recruiter · no pay rates or margins',
  render: () => (
    <PlacementsScreen
      live={{ state: 'ready', onRetry: () => {}, showPay: false, canManage: false, onNew: () => {}, onOpen: () => {}, onBench: () => {}, rows: [{ id: 'p1', person: 'Aravind Kumar', role: 'Java Developer', unit: 'hour', clientId: 'c1', client: 'Nilgiri Retail', supply: 'own', vendor: null, startOn: '2026-01-05', endOn: '2026-12-31', status: 'active', endedReason: null, billRate: '1200.00', version: 1 }] }}
    />
  ),
};

// Drawn for the live page (staffing slice 3): weekly hours, approved by the client in the portal or recorded here.
export const Hours: S = {
  name: 'Placement record · weekly hours',
  render: () => (
    <PlacementHours
      live={{
        canEnter: true,
        today: TODAY,
        contacts: [{ id: 'k1', name: 'Rekha Balan', role: 'Engineering manager' }],
        rows: [
          { id: 'h2', weekStart: '2026-09-21', hours: '40', overtime: '2', status: 'waiting', note: null, invoiced: false, version: 1 },
          { id: 'h1', weekStart: '2026-09-14', hours: '38', overtime: '0', status: 'sent_back', note: 'Thursday was a holiday', invoiced: false, version: 2 },
          { id: 'h0', weekStart: '2026-09-07', hours: '40', overtime: '0', status: 'approved', note: null, invoiced: true, version: 2 },
        ],
        onSave: async () => {},
        onApprove: async () => {},
      }}
    />
  ),
};
// Drawn for answer 494: the client hires the person (fee invoice from HIR-30 terms) and the guarantee on leaving.
const FEE = { series: [{ value: 's1', label: 'KF/TN/26-27/ · 33AABCK1234F1Z9' }], terms: true, today: TODAY, onHired: async () => {}, onLeft: async () => {}, onOpenInvoice: () => {} };
export const FeeBeforeHire: S = { name: 'Placement fee · before the hire', render: () => <PlacementFee canManage person="Aravind Kumar" fee={{ ...FEE, hiredOn: null, ctc: null, feeInvoice: null, leftOn: null, guarantee: null }} /> };
export const FeeGuarantee: S = {
  name: 'Placement fee · left inside the guarantee',
  render: () => <PlacementFee canManage person="Aravind Kumar" fee={{ ...FEE, hiredOn: '2026-09-01', ctc: '1800000.00', feeInvoice: { id: 'f1', number: 'KF/TN/26-27/0201', status: 'issued', total: '176929.20' }, leftOn: '2026-10-01', guarantee: 'credit' }} />,
};
