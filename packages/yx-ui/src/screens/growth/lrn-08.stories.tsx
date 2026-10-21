import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComplianceDashboardScreen } from './learn-admin';
import { COMPLIANCE } from './learn-data';
import { TeamLearningScreen } from './learn-live';

const meta: Meta = { title: 'Screens/Learning/LRN-08 · Compliance dashboard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'L&D · department × mandatory course', render: () => <ComplianceDashboardScreen data={COMPLIANCE} /> };
export const Team: S = {
  name: 'Manager · my team',
  render: () => (
    <TeamLearningScreen
      data={{
        courses: ['POSH awareness', 'Fire safety', 'Food hygiene'],
        people: [
          { employeeId: 'p1', name: 'Gurpreet Kaur', role: 'Line Operator', cells: ['Completed', 'Overdue', 'In progress'] },
          { employeeId: 'p2', name: 'Manoj Patil', role: 'Shift Supervisor', cells: ['Completed', 'Completed', 'Completed'] },
          { employeeId: 'p3', name: 'Rahul Sharma', role: 'Line Operator', cells: ['Enrolled', 'Completed', 'Expired'] },
          { employeeId: 'p4', name: 'Sneha Ghosh', role: 'Quality Inspector', cells: ['Completed', 'Not assigned', 'Completed'] },
        ],
        overdue: [{ id: 'o1', name: 'Gurpreet Kaur', course: 'Fire safety', due: '2026-10-11' }],
      }}
    />
  ),
};
export const Hr: S = { name: 'HR view', render: () => <ComplianceDashboardScreen persona="hr" data={COMPLIANCE} /> };
export const NoneOverdue: S = { name: 'No one overdue', render: () => <ComplianceDashboardScreen data={{ ...COMPLIANCE, overdue: [] }} /> };
export const Loading: S = { render: () => <ComplianceDashboardScreen data={COMPLIANCE} state="loading" /> };
export const Failed: S = { name: 'Error', render: () => <ComplianceDashboardScreen data={COMPLIANCE} state="error" /> };
