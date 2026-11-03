import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToPayScreen } from './expenses-finance';
import { TO_PAY } from './expenses-data';
import { JOURNAL_VIEW, TO_PAY_FULL } from './expenses-live-samples';

const meta: Meta = { title: 'Screens/Expenses/EXP-06 · To-pay queue', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Unpaid: S = { render: () => <ToPayScreen claims={TO_PAY} /> };
export const BulkPayroll: S = { name: 'Bulk · add to payroll', render: () => <ToPayScreen claims={TO_PAY} defaultSelected={['EXP-1037', 'EXP-1031']} confirm="payroll" /> };
export const BulkPayout: S = { name: 'Bulk · pay now by bank file', render: () => <ToPayScreen claims={TO_PAY} defaultSelected={['EXP-1035']} confirm="payout" /> };
export const Failed: S = { name: 'Payment failed · re-route', render: () => <ToPayScreen claims={TO_PAY} view="failed" /> };
export const All: S = { name: 'All approved (with paid)', render: () => <ToPayScreen claims={TO_PAY} view="all" /> };
export const Empty: S = { render: () => <ToPayScreen claims={[]} state="empty" /> };
export const Loading: S = { render: () => <ToPayScreen claims={TO_PAY} state="loading" /> };
export const Error: S = { render: () => <ToPayScreen claims={TO_PAY} state="error" /> };

// States the real record has (round 2), drawn with the designed screen and sample data.
const ok = async () => ({});
const live = {
  state: 'ready' as const, onRetry: () => {}, data: TO_PAY_FULL, journal: JOURNAL_VIEW, journalEntity: 'e1', journalMonth: '2026-10', onJournal: () => {},
  onToPayroll: async () => ({ moved: 1, refused: [] }), onPayout: async () => ({ rows: 1, total: '1114.00', phrase: 'RELEASE 1', excluded: [] }),
  onDownload: ok, onRelease: ok, onCancel: ok, onResults: ok, onExportJournal: ok, onPosted: ok,
};
export const Reroute: S = { name: 'Payment failed · re-route to payroll or a new bank file', render: () => <ToPayScreen live={live} defaultSheet="reroute" /> };
export const BankFiles: S = { name: 'Bank files · made by you, released by someone else', render: () => <ToPayScreen live={live} defaultTab="files" /> };
export const Release: S = { name: 'Bank file · second-person release', render: () => <ToPayScreen live={live} defaultTab="files" defaultSheet="release" /> };
export const Results: S = { name: "Bank file · the bank's results", render: () => <ToPayScreen live={live} defaultTab="files" defaultSheet="results" /> };
export const Journal: S = { name: 'Journal · codes to map before export', render: () => <ToPayScreen live={live} defaultTab="journal" /> };
export const JournalReady: S = { name: 'Journal · balanced, exported, mark posted', render: () => <ToPayScreen live={{ ...live, journal: { ...JOURNAL_VIEW, unmapped: [], lines: JOURNAL_VIEW.lines.filter((l) => l.accountCode !== 'UNMAPPED').map((l) => (l.accountCode === '2400' ? { ...l, debit: '0.00' } : l)), exports: [{ id: 'j1', status: 'exported', sha256: 'c'.repeat(64), createdAt: '2026-10-12T10:00:00Z', postedAt: null }] } }} defaultTab="journal" /> };
