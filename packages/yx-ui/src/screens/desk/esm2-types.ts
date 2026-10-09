// Service Desk 3b-2 batch 2 shapes, as the API returns them (SD-2.06 … SD-2.11, SD-2.13, SD-2.17 … SD-2.19).
import type { FormDef } from '../../lib/forms';

export interface HrSummary {
  source: 'hr' | 'people_list' | 'none';
  name: string;
  designation: string | null;
  department: string | null;
  location: string | null;
  manager: string | null;
  workEmail: string | null;
  internal: { employeeCode: string; joinedOn: string; tenure: string; grade: string | null; employmentType: string | null } | null;
}

export interface TicketShare {
  deskId: string;
  desk: string;
  level: 'view' | 'comment';
  at: string;
}

export interface RequestDocument {
  id: string;
  title: string;
  status: 'issued' | 'pending' | 'signed' | 'declined' | 'withdrawn';
  sha256: string;
  signedAt: string | null;
  createdAt: string;
  needsMe: boolean;
  text?: string;
  evidence?: Record<string, unknown> | null;
}
export interface DocumentsView {
  documents: RequestDocument[];
  templates: { id: string; name: string; needsSignature: boolean }[];
}

export interface SequenceRunView {
  id: string;
  sequence: string;
  step: number;
  state: 'running' | 'stopped' | 'done';
  nextAt: string | null;
  stopReason: string | null;
}
export interface SequenceDef {
  id: string;
  name: string;
  steps: { afterHours: number; bodyHtml: string }[];
  active: boolean;
  version: number;
}

export interface RecurringView {
  id: string;
  name: string;
  template: { subject: string; bodyHtml: string; groupId?: string | null; priority?: number | null };
  rrule: string;
  timeZone: string;
  startsAt: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  state: 'active' | 'paused' | 'ended';
  version: number;
  upcoming: string[];
  runs: { dueAt: string; ticketId: string | null; late: boolean; missed: boolean }[];
}

export interface LifecycleTransition {
  from: string;
  to: string;
  require?: string[];
  who?: 'agent' | 'lead';
}
export interface LifecycleDraft {
  startStatusId?: string;
  statusIds?: string[];
  transitions?: LifecycleTransition[];
}
export interface LifecycleView {
  id: string;
  ticketTypeId: string;
  name: string;
  state: 'draft' | 'active' | 'retired';
  currentVersion: number | null;
  draft: LifecycleDraft;
  version: number;
  versions: { version: number; publishedAt: string }[];
}
export interface LifecycleSetup {
  types: { id: string; name: string; kind: string }[];
  statuses: { id: string; label: string; systemState: string; ticketTypeId: string | null }[];
  requirable: { key: string; label: string }[];
  lifecycles: LifecycleView[];
}

export interface BranchView {
  id: string;
  locationId: string;
  location: string;
  groupId: string | null;
  calendarId: string | null;
  adminUserId: string | null;
  version: number;
  canEdit: boolean;
}

export interface DocTemplate {
  id: string;
  name: string;
  body: string;
  needsSignature: boolean;
  active: boolean;
  version: number;
}

export interface JourneyView {
  id: string;
  kind: 'join' | 'exit';
  name: string;
  itemIds: string[];
  active: boolean;
  version: number;
}
export interface JourneySetup {
  journeys: JourneyView[];
  items: { id: string; name: string; deskId: string; journeyOnly: boolean }[];
  recent: { journeyId: string; employeeId: string; date: string; tickets: number; at: string }[];
}

export interface ChatPrompt {
  id?: string;
  pathPrefix: string;
  text: string;
  afterSeconds: number;
}
export interface ChatQueue {
  id: string;
  name: string;
  groupId: string | null;
  active: boolean;
  maxPerAgent: number;
  waitMinutes: number;
  welcome: string | null;
  preChat: FormDef;
  prompts: ChatPrompt[];
  version: number;
}
export interface MyChatQueue {
  id: string;
  deskId: string;
  desk: string;
  name: string;
  welcome: string | null;
  preChat: FormDef;
  online: boolean;
}
export interface ChatCard {
  title?: string;
  text?: string;
  buttons?: { label: string; reply: string }[];
}
export interface ChatMessage {
  id: string;
  author: 'requester' | 'agent' | 'system';
  name?: string | null;
  authorUserId?: string | null;
  body: string;
  card: ChatCard | null;
  file: { id: string; name: string; size: number; scan: string } | null;
  at: string;
}
export interface ChatSession {
  id: string;
  deskId: string;
  queueId: string;
  state: 'queued' | 'active' | 'ended';
  subject: string;
  agentUserId: string | null;
  ticketId: string | null;
  rating: number | null;
  endReason: string | null;
  requesterSeenAt: string | null;
  agentSeenAt: string | null;
  startedAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
  person?: string;
  queue?: string;
  agent?: string | null;
  ticket?: { id: string; number: string } | null;
  preChat?: { label: string; value: string }[];
  messages?: ChatMessage[];
}

export interface InteractionView {
  id: string;
  channel: 'chat' | 'call' | 'walk_up';
  subject: string;
  notes: string;
  outcome: 'open' | 'resolved' | 'ticket' | 'abandoned';
  person: string | null;
  agent: string;
  ticketId: string | null;
  ticketNumber: string | null;
  callRef: string | null;
  startedAt: string;
  endedAt: string | null;
  version: number;
}

export interface ActionLinkView {
  state: 'open' | 'closed' | 'sign_in';
  title: string;
  summary: { label: string; value: string }[];
  expiresAt: string;
}

export interface ChannelLinkView {
  typedLinksAllowed: boolean;
  links: { id: string; provider: 'teams' | 'slack' | 'push'; label: string | null; createdAt: string }[];
}
