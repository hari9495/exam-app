import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RecycleBinScreen, type RecycleBinRow, type RecycleBinScreenProps } from './recycle-bin';

// Batch B item 3 (admin B2): Settings › Recycle bin.
const meta: Meta = { title: 'Screens/Settings/Recycle bin', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));
const BIN_ROWS: RecycleBinRow[] = [
  { id: 'b1', source: 'bin', kind: 'department', what: 'Department', area: 'Organisation', label: 'Quality assurance', deletedAt: '2026-11-16T10:20:00+05:30', deletedBy: 'Lakshmi Venkatesan', purgeOn: '2027-05-15T10:20:00+05:30' },
  { id: 'b2', source: 'bin', kind: 'location', what: 'Location', area: 'Organisation', label: 'Hosur warehouse', deletedAt: '2026-11-12T15:05:00+05:30', deletedBy: 'Suresh Pillai', purgeOn: '2027-05-11T15:05:00+05:30' },
  { id: 'b3', source: 'bin', kind: 'candidate_email_template', what: 'Email template', area: 'Hiring', label: 'Interview reminder (Tamil)', deletedAt: '2026-11-10T09:00:00+05:30', deletedBy: 'Neha Kulkarni', purgeOn: '2027-05-09T09:00:00+05:30' },
  { id: 'h1', source: 'hiring', kind: 'candidate', what: 'Candidate', area: 'Hiring', label: 'Farhan Sheikh', deletedAt: '2026-11-08T12:00:00+05:30', deletedBy: null, purgeOn: '2026-12-08T12:00:00+05:30' },
];

function Bin(over: Partial<RecycleBinScreenProps>) {
  const [keepDays, setKeepDays] = useState(over.keepDays ?? 180);
  return (
    <div style={{ padding: 'var(--yx-space-6)' }}>
      <RecycleBinScreen state="ready" rows={BIN_ROWS} onRestore={() => wait()} onPurge={() => wait()} {...over} keepDays={keepDays} onKeepDays={over.onKeepDays === undefined ? async (d) => { await wait(); setKeepDays(d); } : over.onKeepDays} />
    </div>
  );
}

export const List: S = { name: 'Recycle bin · deleted records', render: () => <Bin /> };
export const RestoreConfirm: S = {
  name: 'Recycle bin · restore, confirm',
  render: () => <Bin />,
  play: async ({ canvasElement }) => canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Restore Quality assurance"]')?.click(),
};
export const RestoreRefused: S = {
  name: 'Recycle bin · restore refused (name taken)',
  render: () => <Bin onRestore={async () => { await wait(200); throw new Error('It cannot come back: a record with the same name or code exists now. Rename or delete that one first.'); }} />,
};
export const PurgeConfirm: S = {
  name: 'Recycle bin · delete for good, confirm',
  render: () => <Bin />,
  play: async ({ canvasElement }) => canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Delete Quality assurance for good"]')?.click(),
};
export const ReadOnlyKeep: S = { name: 'Recycle bin · keep days read-only', render: () => <Bin onKeepDays={undefined} /> };
export const Empty: S = { name: 'Recycle bin · empty', render: () => <Bin rows={[]} /> };
export const Loading: S = { name: 'Recycle bin · loading', render: () => <Bin rows={[]} state="loading" /> };
export const LoadError: S = { name: 'Recycle bin · could not load', render: () => <Bin rows={[]} state="error" onRetry={() => {}} /> };
export const NoAccess: S = { name: 'Recycle bin · no access', render: () => <Bin rows={[]} state="no-access" /> };
export const Phone: S = { name: 'Recycle bin · phone', globals: { viewport: { value: 'phone' } }, render: () => <Bin /> };
