import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccessCodeCard, CameraFrame, CheckList, ClockPanel, Confidential, DueMonth, MembersList, MoneyLead, PhotoPlaceholder, QrPlaceholder, ReceiptImage, SlaBadge, SourceTag, StatusTrail } from './ops-kit';
import { formatAccessCode, poshClock } from './ops-rules';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Kit/Ops kit', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

export const SlaBadges: S = {
  name: 'SLA badge (on track, at risk, breached, paused, met)',
  render: () => (
    <div className="yx-ops-row">
      <SlaBadge elapsedMin={60} targetMin={240} />
      <SlaBadge elapsedMin={200} targetMin={240} />
      <SlaBadge elapsedMin={300} targetMin={240} />
      <SlaBadge elapsedMin={100} targetMin={240} paused />
      <SlaBadge elapsedMin={100} targetMin={240} met />
    </div>
  ),
};
export const Clock: S = { name: 'Clock panel (POSH)', render: () => <ClockPanel title="Statutory clock" today={TODAY} items={poshClock(new Date(2026, 6, 10), { notice: new Date(2026, 6, 15) })} source="P07 POSH parameters" /> };
export const ConfidentialWrapper: S = { name: 'Confidential watermark', render: () => <Confidential><MembersList members={[{ name: 'Dr. Anuradha Menon', role: 'Presiding officer', access: 'full' }, { name: 'Adv. Shobha Rao', role: 'External member', external: true }, { name: 'Joseph Mathew', role: 'Member', blocked: 'Conflict of interest' }]} /></Confidential> };
export const Placeholders: S = {
  name: 'Receipt, camera, photo, QR',
  render: () => (
    <div className="yx-ops-row">
      <ReceiptImage merchant="Harbour View Residency" amount={9200} date={new Date(2026, 8, 14)} />
      <CameraFrame state="ready" />
      <CameraFrame state="denied" />
      <CameraFrame subject="face" state="processing" />
      <PhotoPlaceholder name="Murugan P." size="lg" />
      <QrPlaceholder value="V-0413" />
    </div>
  ),
};
export const Trail: S = { name: 'Status trail', render: () => <StatusTrail steps={[{ label: 'Generate' }, { label: 'Uploaded' }, { label: 'Acknowledged' }, { label: 'Filed' }]} current={2} /> };
export const Checks: S = { name: 'Check list', render: () => <CheckList label="Checks" items={[{ id: '1', status: 'pass', label: 'Challan period matches' }, { id: '2', status: 'fail', label: 'Workers covered', detail: 'Short by 2' }, { id: '3', status: 'warn', label: 'Amount consistent' }, { id: '4', status: 'pending', label: 'Minimum wage' }]} /> };
export const Tags: S = { name: 'Clause source tags', render: () => <div className="yx-ops-row"><SourceTag source="law" rule="IN.OSH TN 2026-01" /><SourceTag source="company" /><SourceTag source="ai" /></div> };
export const Money: S = { name: 'Money lead', render: () => <div className="yx-ops-row"><MoneyLead label="You will receive" amount={9794} sub="₹19,794 claimed − ₹10,000 advance" /><MoneyLead label="You will return" amount={3000} tone="warning" /></div> };
export const Code: S = { name: 'Access code (shown once)', render: () => <AccessCodeCard code={formatAccessCode(20260929)} /> };
export const Month: S = { name: 'Due-date month', render: () => <DueMonth month={new Date(2026, 9, 1)} today={TODAY} label="October 2026" items={[{ date: new Date(2026, 9, 7), label: 'TDS challan', tone: 'warning' }, { date: new Date(2026, 9, 15), label: 'PF ECR', tone: 'neutral' }, { date: new Date(2026, 9, 31), label: 'Form 138', tone: 'neutral' }]} /> };
