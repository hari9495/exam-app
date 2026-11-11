import type { ContainView, LiveContain, LiveFeatureFlags, LiveFlag } from './console-ops';

// Console C-4 samples (answers 1049, 1050): the live Feature flags and Contain company screens, for stories and tests.
export const LIVE_FLAGS: LiveFlag[] = [
  { key: 'access.requests', label: 'Access requests', description: 'Request access from a "You don\'t have access" page', defaultOn: true, killed: null, overrides: [] },
  { key: 'help.tours', label: 'First-run tours', description: "Help › Tours: the first-run tours on each person's first sign-in", defaultOn: true, killed: null, overrides: [{ organizationId: 'o2', company: 'Vaigai Motors', on: false, reason: 'Asked to pause tours during their audit', at: '2026-11-10T06:00:00.000Z' }] },
  { key: 'help.whats_new', label: "What's new", description: "Help › What's new: the entries YukthiX writes for each release", defaultOn: true, killed: { at: '2026-11-12T04:00:00.000Z', by: 'staff-1', reason: 'Wrong entries shown to companies' }, overrides: [] },
  { key: 'policy.ai_writer', label: 'Write policies with AI', description: "Helpdesk › Write policies with AI uses the company's AI; off falls back to the YukthiX starters", defaultOn: true, killed: null, overrides: [] },
];

const ok = async () => {};

export const liveFlags = (over: Partial<LiveFeatureFlags> = {}): LiveFeatureFlags => ({
  state: 'ready',
  onRetry: () => {},
  flags: LIVE_FLAGS,
  companies: [
    { id: 'o1', name: 'Kaveri Foods' },
    { id: 'o2', name: 'Vaigai Motors' },
  ],
  meId: 'staff-2',
  onDefault: ok,
  onOverride: ok,
  onKill: ok,
  onRevive: ok,
  ...over,
});

const BASE: ContainView = { company: { id: 'o2', name: 'Vaigai Motors' }, users: 530, apps: 3, breach: { certinHours: 6, dpdpHours: 72 }, containment: null };
const OPEN = { open: true, reason: 'Admin account signed in from 3 new countries within 20 minutes; bulk export started.', containedBy: 'Anand Iyer', containedAt: '2026-11-12T03:50:00.000Z', certinDueAt: '2026-11-12T09:50:00.000Z', dpdpDueAt: '2026-11-15T03:50:00.000Z', signedOut: 212, appsRevoked: 3, liftRequest: null, lifted: null };
export const CONTAIN_READY: ContainView = BASE;
export const CONTAIN_OPEN: ContainView = { ...BASE, containment: OPEN };
export const CONTAIN_LIFT: ContainView = { ...BASE, containment: { ...OPEN, liftRequest: { by: 'Anand Iyer', byMe: false, at: '2026-11-12T08:40:00.000Z', reason: 'Passwords reset, the export reviewed with the company' } } };

export const liveContain = (view: ContainView, over: Partial<LiveContain> = {}): LiveContain => ({ state: 'ready', onRetry: () => {}, view, onContain: ok, onRequestLift: ok, onLift: ok, ...over });
