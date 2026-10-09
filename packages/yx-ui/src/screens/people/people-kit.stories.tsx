import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClassBadge, CompareTable, DueCountdown, ExplainedLines, FactRail, FieldList, MaskedValue, ProgressRing, StatusChecklist } from './people-kit';
import { ARJUN, CLEARANCE, d, HOLIDAYS, MEERA_FNF, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/Kit', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

export const Classes: S = { name: 'Field class badges', render: () => <div className="yx-ppl__row">{(['Public', 'Internal', 'Personal', 'Confidential', 'Special'] as const).map((c) => <ClassBadge key={c} cls={c} />)}</div> };
export const Masked: S = { name: 'Masked value with audited reveal', render: () => <MaskedValue value="AKDPK4821M" masked="XXXXXX821M" label="PAN" canReveal /> };
export const FieldsHr: S = { name: 'Field list · HR', render: () => <FieldList rows={ARJUN.identity} persona="hr" relation="other" /> };
export const FieldsManager: S = { name: 'Field list · manager (hidden classes)', render: () => <FieldList rows={[...ARJUN.personal, ...ARJUN.identity]} persona="mgr" relation="team" /> };
export const Rings: S = { name: 'Progress ring', render: () => <div className="yx-ppl__row"><ProgressRing value={0} label="Start" /><ProgressRing value={62} label="Kavya" /><ProgressRing value={100} label="Done" size="sm" /></div> };
export const Countdown: S = { name: 'Due countdown', render: () => <div className="yx-ppl__stack"><DueCountdown due={d(2026, 10, 22)} today={TODAY} holidays={HOLIDAYS} /><DueCountdown due={d(2026, 10, 22)} today={d(2026, 10, 21)} holidays={HOLIDAYS} /><DueCountdown due={d(2026, 10, 22)} today={d(2026, 10, 26)} holidays={HOLIDAYS} /></div> };
export const Rail: S = { name: 'Fact rail', render: () => <FactRail facts={[{ label: 'Manager', value: 'Divya Raghunathan' }]} events={[{ label: 'Probation ends', date: d(2026, 10, 5), tone: 'warning' }, { label: '1 pending request', note: 'Bank change' }]} /> };
export const Checklist: S = { name: 'Status checklist', render: () => <StatusChecklist label="Clearance" today={TODAY} rows={CLEARANCE.map((c) => ({ id: c.id, title: c.item, owner: c.owner, status: c.status, due: d(2026, 9, 28) }))} /> };
export const Lines: S = { name: 'Explained F&F lines', render: () => <ExplainedLines title="Earnings" lines={MEERA_FNF.filter((l) => l.kind === 'earning')} /> };
export const Compare: S = { name: 'Compare table', render: () => <CompareTable caption="Evidence" left="Record A" right="Record B" rows={[{ label: 'Name', a: 'Suresh Nair', b: 'Suresh K Nair' }, { label: 'Date of birth', a: '11 Feb 1990', b: '11 Feb 1990' }]} highlight={(l) => l === 'Date of birth'} /> };
