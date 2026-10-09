import type { Meta, StoryObj } from '@storybook/react-vite';
import { VendorComplianceScreen } from './contract';
import { LIABILITY_ALERTS, PACK_MATRIX, PROOF_TYPES } from './contract-data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-03 · Vendor compliance tracker', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { month: 'Aug 2026', proofTypes: PROOF_TYPES, matrix: PACK_MATRIX, alerts: LIABILITY_ALERTS };

export const Matrix: S = { name: 'Matrix · liability alerts · payment holds', render: () => <VendorComplianceScreen {...base} /> };
export const Verify: S = { name: 'Proof verification · short challan', render: () => <VendorComplianceScreen {...base} verifyOpen /> };
export const Override: S = { name: 'Payment hold override with reason', render: () => <VendorComplianceScreen {...base} overrideOpen /> };
export const Finance: S = { name: 'Finance view (no override)', render: () => <VendorComplianceScreen {...base} persona="fin" /> };
export const AllClear: S = { name: 'All verified', render: () => <VendorComplianceScreen {...base} matrix={PACK_MATRIX.map((m) => ({ ...m, statuses: m.statuses.map((s) => (s === 'Not required' ? s : 'Verified')) }))} alerts={[]} /> };
