import type { Meta, StoryObj } from '@storybook/react-vite';
import { PersonWorkspace } from './record';
import { d, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-03 · Person record', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const HrOverview: S = { name: 'HR · overview (masked IDs with audited reveal)', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} /> };
export const EmployeeSelf: S = { name: 'Employee · own record', render: () => <PersonWorkspace persona="emp" relation="self" today={TODAY} /> };
export const ManagerTeam: S = { name: 'Manager · team member (Personal hidden)', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} /> };
export const Job: S = { name: 'Job tab', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="job" /> };
export const PayHr: S = { name: 'Pay tab · HR', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="pay" /> };
export const PayGated: S = { name: 'Pay tab · manager without salary grant', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" /> };
export const PayGrant: S = { name: 'Pay tab · manager with salary grant', render: () => <PersonWorkspace persona="mgr" relation="team" payGrant today={TODAY} defaultTab="pay" /> };
export const Time: S = { name: 'Time tab', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="time" /> };
export const Documents: S = { name: 'Documents tab · HR verify', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="documents" /> };
export const DocumentsManager: S = { name: 'Documents tab · manager (restricted classes hidden)', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="documents" /> };
export const Performance: S = { name: 'Performance tab', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="performance" /> };
export const Learning: S = { name: 'Learning tab', render: () => <PersonWorkspace persona="emp" relation="self" today={TODAY} defaultTab="learning" /> };
export const Assets: S = { name: 'Assets tab', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="assets" /> };
export const History: S = { name: 'History tab (timeline, corrections, roles)', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="history" /> };
export const AsOfPast: S = { name: 'History · as on 1 Jul 2024', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="history" defaultAsOf={d(2024, 7, 1)} /> };
export const AsOfFuture: S = { name: 'History · as on 1 Oct 2026 (scheduled)', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} defaultTab="history" defaultAsOf={d(2026, 10, 1)} /> };
export const Loading: S = { name: '· loading', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} state="loading" /> };
export const LoadError: S = { name: '· error', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} state="error" /> };
export const NotFound: S = { name: '· not found (restricted or missing)', render: () => <PersonWorkspace persona="mgr" relation="other" today={TODAY} state="not-found" /> };
