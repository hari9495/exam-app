import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, fill, never, ok, play, press, pressFirst, type } from '../../_kit/story-play';
import { AuditScreen, type AuditScreenProps } from './audit';
import { ExchangeFilesScreen, PayDocumentsScreen, type ExchangeFilesScreenProps, type PayDocumentsScreenProps } from './documents';
import { PayPeriodsScreen, ReopenRequestsScreen, type PayPeriodsScreenProps, type ReopenRequestsScreenProps } from './periods';
import { AUDIT_PAGE, CHAIN_BROKEN, CHAIN_OK, EXCHANGE_FILES, PAY_DOCUMENTS, PAY_PERIODS, PERIOD_HISTORY, REOPEN_REQUESTS } from './fixtures-5ab';

// Payroll batch 5a on the live app: pay periods, reopen requests, the audit log, pay documents and payroll files.
// The same components the pages render, with Kaveri Foods data.
const meta: Meta = { title: 'Screens/Pay/Live · Periods, audit, documents and files', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ PAY-1.02 Pay periods
const periods = (over: Partial<PayPeriodsScreenProps> = {}) => <PayPeriodsScreen state="ready" data={PAY_PERIODS} year="2026" onYear={() => undefined} onHistory={async () => PERIOD_HISTORY} onAskReopen={ok} onOpenRequests={() => undefined} {...over} />;
const why = type(/^Why/, 'A late overtime claim of Anil Kumar was approved after the lock');
export const Periods: S = { name: 'PAY-1.02 · Pay periods', render: () => periods() };
export const PeriodsHistory: S = { name: 'PAY-1.02 · A month’s history and corrections', render: () => periods(), play: play(pressFirst('History')) };
export const PeriodsReadOnly: S = { name: 'PAY-1.02 · Pay periods, someone who cannot ask to reopen', render: () => periods({ data: { ...PAY_PERIODS, entities: PAY_PERIODS.entities.map((e) => ({ ...e, canRequestReopen: false })) } }) };
export const PeriodsEmpty: S = { name: 'PAY-1.02 · No legal entity in scope', render: () => periods({ data: { ...PAY_PERIODS, entities: [] } }) };
export const PeriodsLoading: S = { name: 'PAY-1.02 · Loading', render: () => periods({ state: 'loading', data: null }) };
export const PeriodsError: S = { name: 'PAY-1.02 · Could not load', render: () => periods({ state: 'error', data: null, onRetry: () => undefined }) };
export const PeriodsNoAccess: S = { name: 'PAY-1.02 · No access', render: () => periods({ state: 'no-access', data: null }) };
export const AskReopen: S = { name: 'Ask to reopen · open', render: () => periods(), play: play(pressFirst('Ask to reopen')) };
export const AskReopenFilled: S = { name: 'Ask to reopen · reason given', render: () => periods(), play: play(pressFirst('Ask to reopen'), why) };
export const AskReopenMissing: S = { name: 'Ask to reopen · Send pressed with no reason', render: () => periods(), play: play(pressFirst('Ask to reopen'), press('Send for approval')) };
export const AskReopenFailed: S = { name: 'Ask to reopen · the server refuses', render: () => periods({ onAskReopen: fails('September payslips are issued, so the month cannot be reopened. Pay it as a correction.') }), play: play(pressFirst('Ask to reopen'), why, press('Send for approval')) };

// ------------------------------------------------------------------ YX-LOCK-05 Reopen requests
const requests = (over: Partial<ReopenRequestsScreenProps> = {}) => <ReopenRequestsScreen state="ready" data={REOPEN_REQUESTS} me="Neha Joshi" onDecide={ok} {...over} />;
export const Requests: S = { name: 'YX-LOCK-05 · Reopen requests, one waiting for me', render: () => requests() };
export const RequestsEmpty: S = { name: 'YX-LOCK-05 · No reopen requests', render: () => requests({ data: [] }) };
export const RequestsLoading: S = { name: 'YX-LOCK-05 · Loading', render: () => requests({ state: 'loading', data: null }) };
export const RequestsError: S = { name: 'YX-LOCK-05 · Could not load', render: () => requests({ state: 'error', data: null, onRetry: () => undefined }) };
export const Approve: S = { name: 'Approve a reopen · open (type the phrase)', render: () => requests(), play: play(pressFirst('Approve')) };
export const ApproveFilled: S = { name: 'Approve a reopen · phrase typed', render: () => requests(), play: play(pressFirst('Approve'), type(/^Type REOPEN/, 'REOPEN KFPL-TN 2026-09')) };
export const ApproveMissing: S = { name: 'Approve a reopen · Approve pressed without the phrase', render: () => requests(), play: play(pressFirst('Approve'), press('Approve')) };
export const ApproveFailed: S = { name: 'Approve a reopen · the server refuses', render: () => requests({ onDecide: fails('Confirm it is you first: the second sign-in step timed out.') }), play: play(pressFirst('Approve'), type(/^Type REOPEN/, 'REOPEN KFPL-TN 2026-09'), press('Approve')) };
export const TurnDown: S = { name: 'Turn down a reopen · open', render: () => requests(), play: play(pressFirst('Turn down')) };
export const TurnDownMissing: S = { name: 'Turn down a reopen · pressed with no reason', render: () => requests(), play: play(pressFirst('Turn down'), press('Turn down')) };

// ------------------------------------------------------------------ Audit log
const audit = (over: Partial<AuditScreenProps> = {}) => <AuditScreen state="ready" data={AUDIT_PAGE} chain={CHAIN_OK} filters={{}} onFilters={() => undefined} onMore={() => undefined} canExport onExport={ok} onVerify={ok} onTimeline={async () => AUDIT_PAGE.entries} {...over} />;
export const Audit: S = { name: 'Audit log · chain OK, export allowed', render: () => audit() };
export const AuditNoExport: S = { name: 'Audit log · read only (no export)', render: () => audit({ canExport: false }) };
export const AuditBroken: S = { name: 'Audit log · the chain check found a break', render: () => audit({ chain: CHAIN_BROKEN }) };
export const AuditDetails: S = { name: 'Audit log · an entry’s details', render: () => audit(), play: play(pressFirst('Details')) };
export const AuditTimeline: S = { name: 'Audit log · a record’s timeline', render: () => audit(), play: play(pressFirst('Record timeline')) };
export const AuditVerifyFailed: S = { name: 'Audit log · Check now refused', render: () => audit({ onVerify: fails('A check is already running; try again in a minute.') }), play: play(press('Check now')) };
export const AuditChecking: S = { name: 'Audit log · checking the chain', render: () => audit({ onVerify: never }), play: play(press('Check now')) };
export const AuditEmpty: S = { name: 'Audit log · nothing matches', render: () => audit({ data: { entries: [], next: null } }) };
export const AuditLoading: S = { name: 'Audit log · loading', render: () => audit({ state: 'loading', data: null, chain: null }) };
export const AuditError: S = { name: 'Audit log · could not load', render: () => audit({ state: 'error', data: null, chain: null, onRetry: () => undefined }) };
export const AuditNoAccess: S = { name: 'Audit log · no access', render: () => audit({ state: 'no-access', data: null, chain: null }) };

// ------------------------------------------------------------------ Pay documents
const docs = (over: Partial<PayDocumentsScreenProps> = {}) => <PayDocumentsScreen state="ready" data={PAY_DOCUMENTS} entityId={null} onEntity={() => undefined} onDownload={ok} verifyUrl={(c) => `https://kaverifoods.yukthix.test/verify/${c}`} {...over} />;
export const Documents: S = { name: 'Pay documents · issued, replaced and awaiting signature', render: () => docs() };
export const DocumentsDownloadFailed: S = { name: 'Pay documents · download refused', render: () => docs({ onDownload: fails('This document was purged under the retention policy.') }), play: play(pressFirst('Download PDF')) };
export const DocumentsEmpty: S = { name: 'Pay documents · none yet', render: () => docs({ data: { ...PAY_DOCUMENTS, documents: [] } }) };
export const DocumentsLoading: S = { name: 'Pay documents · loading', render: () => docs({ state: 'loading', data: null }) };
export const DocumentsError: S = { name: 'Pay documents · could not load', render: () => docs({ state: 'error', data: null, onRetry: () => undefined }) };
export const DocumentsNoAccess: S = { name: 'Pay documents · no access', render: () => docs({ state: 'no-access', data: null }) };

// ------------------------------------------------------------------ PAY-1.11 Payroll files
const files = (over: Partial<ExchangeFilesScreenProps> = {}) => <ExchangeFilesScreen state="ready" data={EXCHANGE_FILES} me="Meena Raghavan" onDownload={ok} onRelease={ok} {...over} />;
export const Files: S = { name: 'PAY-1.11 · Payroll files', render: () => files() };
export const FilesMaker: S = { name: 'PAY-1.11 · Payroll files, the person who made it (cannot release)', render: () => files({ data: { ...EXCHANGE_FILES, files: EXCHANGE_FILES.files.map((f) => ({ ...f, madeByMe: true, canRelease: false })) } }) };
export const FilesEmpty: S = { name: 'PAY-1.11 · No files yet', render: () => files({ data: { ...EXCHANGE_FILES, files: [] } }) };
export const FilesLoading: S = { name: 'PAY-1.11 · Loading', render: () => files({ state: 'loading', data: null }) };
export const FilesError: S = { name: 'PAY-1.11 · Could not load', render: () => files({ state: 'error', data: null, onRetry: () => undefined }) };
export const Release: S = { name: 'Release a file · open (type the phrase)', render: () => files(), play: play(pressFirst('Release')) };
export const ReleaseMissing: S = { name: 'Release a file · pressed without the phrase', render: () => files(), play: play(pressFirst('Release'), press('Release the file')) };
export const ReleaseFailed: S = { name: 'Release a file · the server refuses', render: () => files({ onRelease: fails('The bank cut-off for today has passed; release tomorrow after 9:00 am.') }), play: play(pressFirst('Release'), type(/^Type RELEASE/, 'RELEASE 214'), press('Release the file')) };
