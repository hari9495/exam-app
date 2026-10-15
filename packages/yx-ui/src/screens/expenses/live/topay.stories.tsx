import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToPayLiveScreen } from './topay';
import { JOURNAL, TO_PAY } from './topay-fixtures';

// To pay, wired (batch E3; EXP-06). In the affordance guard set ('screens-expenses-live').
const meta: Meta = { title: 'Screens/Expenses/Live · To pay', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const props = {
  state: 'ready' as const,
  data: TO_PAY,
  journal: JOURNAL,
  journalEntity: 'e1',
  journalMonth: '2026-10',
  onJournal: () => undefined,
  onToPayroll: async () => ({ moved: 1, refused: [] }),
  onPayout: async () => ({ rows: 1, total: '1114.00', phrase: 'RELEASE 1', excluded: [] }),
  onDownload: ok,
  onRelease: ok,
  onCancel: ok,
  onResults: ok,
  onExportJournal: ok,
  onPosted: ok,
};

export const Claims: S = { name: 'EXP-06 · To pay', render: () => <ToPayLiveScreen {...props} /> };
export const Empty: S = { name: 'EXP-06 · Nothing to pay', render: () => <ToPayLiveScreen {...props} data={{ entities: TO_PAY.entities, claims: [], batches: [] }} journal={{ ...JOURNAL, lines: [], unmapped: [] }} /> };
