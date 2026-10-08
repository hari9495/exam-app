// Service Desk (M14 phase 3b-1): the shapes the /api/v1/desk routes return and accept. Dates arrive as ISO strings.
export type { LoadState } from '../org/types';

export type SystemState = 'new' | 'open' | 'pending' | 'on_hold' | 'solved' | 'closed';
export type DeskRole = 'agent' | 'lead' | 'admin' | 'collaborator';
export type DeskKind = 'hr' | 'it' | 'admin' | 'facilities' | 'finance' | 'legal' | 'security' | 'customer_support' | 'custom';

export interface DeskSummary {
  id: string;
  key: string;
  name: string;
  kind: DeskKind;
  audience: 'employee' | 'customer';
  billingClass: 'hrms_included' | 'service_desk';
  privacy: 'standard' | 'restricted';
  calendarId: string | null;
  numberPrefix: string;
  numberSuffix: string;
  attachmentTypes: string[];
  attachmentMaxMb: number;
  vipRaisesPriority: boolean;
  status: 'active' | 'archived';
  version: number;
  myRole?: DeskRole | null;
  canSetUp?: boolean;
  canWork?: boolean;
}

export interface DeskType {
  id: string;
  kind: 'incident' | 'request' | 'question';
  name: string;
  active: boolean;
  sortOrder: number;
}
export interface DeskStatus {
  id: string;
  label: string;
  systemState: SystemState;
  ticketTypeId: string | null;
  sortOrder: number;
  active: boolean;
}
export interface DeskCategory {
  id: string;
  name: string;
  parentId: string | null;
  sensitive: boolean;
  defaultGroupId: string | null;
  defaultPriority: number | null;
  active: boolean;
  sortOrder: number;
}
export interface DeskGroup {
  id: string;
  name: string;
  tier: string | null;
  assignmentMethod: 'manual' | 'round_robin' | 'load';
  maxOpenPerAgent: number | null;
  active: boolean;
  memberIds: string[];
}
export interface DeskMember {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  role: DeskRole;
  tier: string | null;
  skills: string[];
  validFrom: string;
  validTo: string | null;
  active: boolean;
}
export interface Scenario {
  id: string;
  name: string;
  active: boolean;
  actions: { statusId?: string; priority?: number; groupId?: string; assignee?: string | null; addTags?: string[]; note?: string; reply?: string };
}
export interface DeskDetail {
  desk: DeskSummary;
  types: DeskType[];
  statuses: DeskStatus[];
  categories: DeskCategory[];
  groups: DeskGroup[];
  matrix: { impact: number; urgency: number; priority: number }[];
  members: DeskMember[];
  scenarios: Scenario[];
  myRole: DeskRole | null;
  canSetUp: boolean;
  canManageMembers: boolean;
}

export interface CannedResponse {
  id: string;
  title: string;
  bodyHtml: string;
  personal: boolean;
  active: boolean;
}

export interface Calendar {
  id: string;
  name: string;
  timeZone: string;
  version: number;
  hours: { id: string; weekday: number; startMinute: number; endMinute: number; validFrom: string; validTo: string | null }[];
  holidays: { id: string; on: string; name: string; halfDay: boolean }[];
}

export interface SeatCost {
  paid: boolean;
  reason: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  scanStatus: 'pending' | 'clean' | 'blocked' | 'infected';
  side: 'agent' | 'requester';
  messageId: string | null;
  createdAt: string;
}

export interface TicketRow {
  id: string;
  number: string;
  subject: string;
  deskId: string;
  desk: string;
  type: string;
  statusId: string;
  status: string;
  systemState: SystemState;
  priority: number;
  category: string | null;
  group: string | null;
  requester: string | null;
  requestedFor: string | null;
  assigneeUserId: string | null;
  assignee: string | null;
  tags: string[];
  vip: boolean;
  sensitive: boolean;
  private: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  canBulk: boolean;
}

export interface TicketPage {
  items: TicketRow[];
  total: number;
  nextCursor: string | null;
}

export interface TicketFilters {
  deskIds?: string[];
  states?: SystemState[];
  statusIds?: string[];
  priorities?: number[];
  assignee?: string;
  groupIds?: string[];
  categoryIds?: string[];
  tags?: string[];
  vip?: boolean;
  search?: string;
}

export interface SavedTicketView {
  id: string;
  name: string;
  deskId: string | null;
  shared: boolean;
  mine: boolean;
  filters: TicketFilters;
  columns: string[];
  sort: string | null;
  layout: 'list' | 'board';
}

export interface TicketMessage {
  id: string;
  kind: 'reply' | 'note' | 'system';
  side: 'agent' | 'requester' | 'system';
  author: string;
  mine: boolean;
  bodyHtml: string;
  channel: string;
  createdAt: string;
  editedAt: string | null;
}

export interface TicketDetail {
  id: string;
  number: string;
  deskId: string;
  subject: string;
  kind: string;
  systemState: SystemState;
  statusId: string;
  typeId: string;
  categoryId: string | null;
  groupId: string | null;
  priority: number;
  impact: number | null;
  urgency: number | null;
  assigneeUserId: string | null;
  channel: string;
  sensitive: boolean;
  private: boolean;
  vip: boolean;
  tags: string[];
  firstResponseAt: string | null;
  resolvedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  access: 'agent' | 'observer' | 'collaborator';
  canWork: boolean;
  canNote: boolean;
  canAssignOthers: boolean;
  desk: { id: string; key: string; name: string; audience: 'employee' | 'customer' };
  type: { id: string; name: string } | null;
  status: { id: string; label: string } | null;
  category: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  requester: { id: string; name: string; email: string | null } | null;
  requestedFor: { id: string; name: string; email: string | null } | null;
  assignee: { id: string; name: string } | null;
  openedBy: string | null;
  messages: TicketMessage[];
  attachments: Attachment[];
  watchers: { id: string; personId: string; name: string; email: string | null; external: boolean }[];
  collaborators: { userId: string; name: string }[];
  time: { totalMinutes: number; entries: { id: string; minutes: number; note: string | null; workedOn: string; who: string; mine: boolean }[] };
}

export interface TimelineEntry {
  id: string;
  kind: string;
  from: string | null;
  to: string | null;
  reason: string | null;
  by: string;
  at: string;
}

export interface RequesterContext {
  person: { id: string; name: string; email: string | null } | null;
  vip: boolean;
  employee: { code: string | null; designation: string | null; department: string | null; location: string | null } | null;
  otherTickets: { id: string; number: string; subject: string; systemState: SystemState; createdAt: string }[];
  assets: unknown[];
}

export interface Presence {
  userId: string;
  name: string;
  typing: boolean;
}

export interface Person {
  id: string;
  name: string;
  email: string | null;
}

/** What the update form sends (PATCH /desk/tickets/:id). */
export interface TicketChange {
  statusId?: string;
  priority?: number;
  priorityReason?: string;
  categoryId?: string | null;
  groupId?: string | null;
  tags?: string[];
  private?: boolean;
  subject?: string;
}

// ---- the requester's side ----

export interface RaiseDesk {
  id: string;
  name: string;
  key: string;
  attachmentTypes: string[];
  attachmentMaxMb: number;
  types: { id: string; name: string }[];
  categories: { id: string; name: string; parentId: string | null; sensitive: boolean }[];
}

export interface MyTicketRow {
  id: string;
  number: string;
  subject: string;
  desk: string;
  status: string;
  systemState: SystemState;
  private: boolean;
  role: 'requester' | 'requested_for' | 'watcher';
  createdAt: string;
  updatedAt: string;
}

export interface MyTicket {
  id: string;
  number: string;
  subject: string;
  desk: { name: string; attachmentTypes: string[]; attachmentMaxMb: number };
  status: string;
  systemState: SystemState;
  private: boolean;
  createdAt: string;
  requester: string | null;
  requestedFor: string | null;
  assignee: string | null;
  canReply: boolean;
  messages: { id: string; side: 'agent' | 'requester' | 'system'; author: string; mine: boolean; bodyHtml: string; createdAt: string }[];
  attachments: Attachment[];
  history: { at: string; from: string | null; to: string | null }[];
}

export interface RaiseInput {
  deskId: string;
  typeId?: string;
  categoryId?: string;
  subject: string;
  description: string;
  impact?: number;
  urgency?: number;
  private?: boolean;
}
