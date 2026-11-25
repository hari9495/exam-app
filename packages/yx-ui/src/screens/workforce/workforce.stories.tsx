import type { Meta, StoryObj } from '@storybook/react-vite';
import { BulkChangesScreen } from './bulk';
import { BATCH_DETAIL, BATCHES, BULK_RESULT, PEOPLE } from './data';

const meta: Meta = { title: 'Screens/People/People core', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));

const bulk = {
  state: 'ready' as const,
  batches: BATCHES,
  people: PEOPLE,
  canManage: true,
  canApprove: true,
  canPay: false,
  onCheckFile: () => wait().then(() => BULK_RESULT),
  onCheckReassign: () => wait().then(() => ({ ...BULK_RESULT, errors: 0, rows: BULK_RESULT.rows.slice(0, 1) })),
  loadBatch: () => wait().then(() => BATCH_DETAIL),
  onApprove: () => wait(),
  onReject: () => wait(),
  onCancel: () => wait(),
};
export const BulkFile: S = { name: 'Bulk changes · from a file', render: () => <BulkChangesScreen {...bulk} /> };
export const BulkBatch: S = { name: 'Bulk changes · batch to approve', render: () => <BulkChangesScreen {...bulk} defaultBatchId="b-1" /> };
