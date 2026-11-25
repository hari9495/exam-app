import type { Meta, StoryObj } from '@storybook/react-vite';
import { LEDGER_OPTIONS, LEDGER_ROWS, LedgerMappingScreen, SUSPENSE_LINE } from './ledger-mapping';

const meta: Meta = { title: 'Screens/Pay/PAY-62 · Ledger mapping', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const base = { onRetry: () => undefined, options: LEDGER_OPTIONS, onSave: async () => undefined, onRemove: async () => undefined };
export const Mapping: S = { name: 'PAY-62 · Ledger mapping with the suspense account', render: () => <LedgerMappingScreen state="ready" rows={LEDGER_ROWS} canEdit {...base} /> };
export const NoSuspense: S = { name: 'PAY-62 · No suspense account yet', render: () => <LedgerMappingScreen state="ready" rows={LEDGER_ROWS.filter((r) => r.componentCode !== SUSPENSE_LINE)} canEdit {...base} /> };
export const Empty: S = { name: 'PAY-62 · Nothing mapped yet', render: () => <LedgerMappingScreen state="ready" rows={[]} canEdit {...base} /> };
export const ReadOnly: S = { name: 'PAY-62 · Read only (journal export key)', render: () => <LedgerMappingScreen state="ready" rows={LEDGER_ROWS} canEdit={false} {...base} /> };
export const Loading: S = { name: 'PAY-62 · Loading', render: () => <LedgerMappingScreen state="loading" rows={null} canEdit {...base} /> };
export const LoadError: S = { name: 'PAY-62 · Error', render: () => <LedgerMappingScreen state="error" rows={null} canEdit {...base} /> };
