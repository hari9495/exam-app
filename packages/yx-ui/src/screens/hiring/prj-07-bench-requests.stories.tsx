import type { Meta, StoryObj } from '@storybook/react-vite';
import { BenchRequestsScreen, type ResourceRequest } from './projects-billing';
import type { LiveRequests } from './resourcing-live';
import { LIVE_MATCHES, LIVE_REQUESTS } from './projects-live-fixtures';
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

// Projects P-4 (answers 1417, 1418): the live page keeps only Resource requests and links to Staffing desk › Bench.
const ok = async () => undefined;
const live = (over: Partial<LiveRequests> = {}): LiveRequests => ({ state: 'ready', data: LIVE_REQUESTS, onRaise: ok, onMatches: async () => LIVE_MATCHES, onFill: ok, onWithdraw: ok, onBench: () => {}, ...over });
export const LiveList: S = { name: 'Live · resource requests (link to the one bench)', render: () => <BenchRequestsScreen live={live()} /> };
export const LiveRaise: S = { name: 'Live · raise request drawer', render: () => <BenchRequestsScreen live={live({ defaultRaise: true })} /> };
export const LiveMatch: S = { name: 'Live · people with free time, bench first', render: () => <BenchRequestsScreen live={live({ defaultMatch: LIVE_MATCHES })} /> };
export const LiveNoMatch: S = { name: 'Live · no one has this much free time', render: () => <BenchRequestsScreen live={live({ defaultMatch: { ...LIVE_MATCHES, matches: [] } })} /> };
export const LivePm: S = { name: 'Live · project manager (raises, cannot fill)', render: () => <BenchRequestsScreen live={live({ data: { ...LIVE_REQUESTS, can: { raise: true, fill: false } } })} /> };
export const LiveEmpty: S = { name: 'Live · no requests', render: () => <BenchRequestsScreen live={live({ data: { ...LIVE_REQUESTS, rows: [] } })} /> };
