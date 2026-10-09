import type { Meta, StoryObj } from '@storybook/react-vite';
import { BenchRequestsScreen, type ResourceRequest } from './projects-billing';
import { PD, RESOURCE_PEOPLE } from './projects-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Projects/PRJ-07 · Bench board and resource requests', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const REQUESTS: ResourceRequest[] = [
  { id: 'q1', project: 'NRP-MOB', requestedBy: 'Karthik Subramanian', skill: 'SQL', level: 'Mid', pct: 100, from: PD(2026, 11, 1), to: PD(2027, 4, 30), status: 'Open' },
  { id: 'q2', project: 'CLL-WMS', requestedBy: 'Joseph Mathew', skill: 'Java', level: 'Senior', pct: 50, from: PD(2026, 10, 12), to: PD(2026, 11, 30), status: 'Matched', person: 'Manoj Patil' },
  { id: 'q3', project: 'INT-ERP', requestedBy: 'Prakash Menon', skill: 'Python', level: 'Mid', pct: 100, from: PD(2026, 10, 5), to: PD(2027, 3, 31), status: 'Confirmed', person: 'Arjun Das' },
  { id: 'q4', project: 'NRP-WEB', requestedBy: 'Karthik Subramanian', skill: 'React', level: 'Senior', pct: 100, from: PD(2026, 10, 12), to: PD(2026, 12, 31), status: 'Open' },
];
const base = { people: RESOURCE_PEOPLE, requests: REQUESTS, today: TODAY };

export const Bench: S = { name: 'Bench board with ageing', render: () => <BenchRequestsScreen {...base} persona="resource-manager" /> };
export const Requests: S = { name: 'Resource manager · requests', render: () => <BenchRequestsScreen {...base} persona="resource-manager" defaultTab="requests" /> };
export const Match: S = { name: 'Match · bench first, confirmed skill', render: () => <BenchRequestsScreen {...base} persona="resource-manager" defaultTab="requests" matchFor="q1" /> };
export const NoMatch: S = { name: 'Match · no one free', render: () => <BenchRequestsScreen {...base} persona="resource-manager" defaultTab="requests" matchFor="q4" /> };
export const Raise: S = { name: 'PM · raise request', render: () => <BenchRequestsScreen {...base} persona="pm" raiseOpen /> };
export const Empty: S = { name: 'Empty requests', render: () => <BenchRequestsScreen {...base} requests={[]} persona="pm" defaultTab="requests" /> };
