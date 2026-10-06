import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExitCasesList, ExitCaseWorkspace } from './exits';
import { EXIT_CASES, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-19 · Exit cases', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'HR · exit cases', render: () => <ExitCasesList rows={EXIT_CASES} /> };
export const ManagerList: S = { name: 'Manager · my team', render: () => <ExitCasesList rows={EXIT_CASES} persona="mgr" /> };
export const Case: S = { name: 'HR · case stepper with deprovisioning', render: () => <ExitCaseWorkspace today={TODAY} /> };
export const CaseManager: S = { name: 'Manager · case (no HR-only flags)', render: () => <ExitCaseWorkspace today={TODAY} persona="mgr" /> };
export const Held: S = { name: 'HR · open case holds letters', render: () => <ExitCaseWorkspace today={TODAY} variant="held" current="documents" /> };
export const Loading: S = { name: '· loading', render: () => <ExitCasesList rows={EXIT_CASES} state="loading" /> };
export const Empty: S = { name: '· empty', render: () => <ExitCasesList rows={[]} /> };
