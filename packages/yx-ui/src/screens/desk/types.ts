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
  resolutionRequired?: boolean;
  reopenWindowDays?: number;
  requesterCanReopen?: boolean;
  autoCloseDays?: number | null;
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
  halfDayOpenHalf?: 'first' | 'second';
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
  tier?: string;
  sla?: { dueAt: string | null; breached: boolean; paused: boolean } | null;
  createdAt: string;
  updatedAt: string;
  canBulk: boolean;
  channel?: string;
  customerAccountId?: string | null;
  /** False when an email's sender could not be proven (SPF / DKIM / DMARC). */
  senderVerified?: boolean;
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
  snoozed?: 'show' | 'only';
  breaching?: boolean;
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
  fromTicketId?: string | null;
  kind: 'reply' | 'note' | 'system';
  side: 'agent' | 'requester' | 'system';
  author: string;
  mine: boolean;
  bodyHtml: string;
  channel: string;
  createdAt: string;
  editedAt: string | null;
  senderVerified?: boolean;
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
  resolutionCode?: string | null;
  resolutionNote?: string | null;
  tier?: string;
  parentId?: string | null;
  mergedIntoId?: string | null;
  tracker?: boolean;
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
  /** Batch 3: false when we could not prove who sent the email. */
  senderVerified?: boolean;
  customer?: { account: { id: string; name: string }; plan: string | null } | null;
  product?: { id: string; name: string } | null;
  /** The screen the in-app help drawer was opened on. */
  screen?: string | null;
  /** Values read from the email by rules (e.g. order_number); may also hold `screen`. */
  fields?: Record<string, unknown> | null;
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
  /** A reply now starts a follow-up ticket (closed, or past the reopen window). */
  replyStartsFollowUp?: boolean;
  reopenUntil?: string | null;
  mergedInto?: string | null;
  /** US-G-016: only when it should be resolved, never internal reasons. */
  resolveBy?: string | null;
  targetPaused?: boolean;
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

// ---- batch 2 (SD-1.09 to SD-1.17) ----

export interface TicketBrief {
  id: string;
  number: string;
  subject: string;
  systemState: SystemState;
  deskId: string;
  tracker: boolean;
}

export interface SlaTimerView {
  id: string;
  kind: 'sla' | 'ola';
  metric: string;
  label: string;
  state: 'running' | 'paused' | 'met' | 'cancelled';
  breached: boolean;
  startedAt: string;
  dueAt: string | null;
  breachedAt: string | null;
  metAt: string | null;
  targetSeconds: number;
  usedSeconds: number;
  percent: number;
  pauseReason: string | null;
  breachReason: string | null;
  excluded: boolean;
  exclusionReason: string | null;
  cancelReason: string | null;
  segments: { from: string; to: string; state: 'running' | 'paused' | 'breached'; reason: string | null }[];
}

export interface TaskView {
  id: string;
  ticketId: string | null;
  deskId: string;
  title: string;
  note: string | null;
  checklist: boolean;
  state: 'open' | 'in_progress' | 'done' | 'cancelled';
  assigneeUserId: string | null;
  assignee: string | null;
  groupId: string | null;
  dueAt: string | null;
  version: number;
  doneAt: string | null;
  ticket?: { id: string; number: string; subject: string | null } | null;
}

export interface TicketWork {
  parent: TicketBrief | null;
  children: TicketBrief[];
  merged: TicketBrief[];
  mergedInto: TicketBrief | null;
  links: { id: string; kind: string; words: string; ticket: TicketBrief; direction: 'in' | 'out' }[];
  sideConversations: { id: string; channel: 'note_thread' | 'child_ticket'; subject: string; withWhom: string | null; state: 'open' | 'closed'; createdBy: string; createdAt: string; childTicket: TicketBrief | null; messages: { id: string; author: string; bodyHtml: string; createdAt: string }[] }[];
  tasks: TaskView[];
  sla: SlaTimerView[];
  reminders: { id: string; kind: 'remind' | 'snooze'; remindAt: string; note: string | null }[];
  maskedValues: { id: string; kind: string; masked: string; messageId: string | null }[];
  canUnmask: boolean;
  canSeeReads: boolean;
  canExclude: boolean;
  canMerge: boolean;
}

export interface DeskTemplates {
  templates: { id: string; name: string; ticketTypeId: string | null; defaults: { categoryId?: string; groupId?: string; priority?: number; tags?: string[] }; checklist: string[]; active: boolean }[];
  resolutionCodes: { id: string; code: string; label: string; active: boolean }[];
}

export interface CalendarItem {
  id: string;
  kind: 'reminder' | 'snooze' | 'task' | 'sla';
  at: string;
  title: string;
  ticketId: string | null;
}

export interface SlaTarget {
  metric: string;
  minutes: (number | null)[];
  milestones?: { percent: number; actions: { type: string; groupId?: string }[] }[];
}

export interface SlaPolicyView {
  id: string;
  name: string;
  kind: 'sla' | 'ola';
  sortOrder: number;
  active: boolean;
  version: number;
  versions: { id: string; version: number; validFrom: string; scope: { match: 'all' | 'any'; rules: { field: string; op: string; values: string[] }[] }; calendarSource: string; calendarId: string | null; targets: SlaTarget[]; pauseStates: string[]; recount: string }[];
}

export interface SlaSetup {
  policies: SlaPolicyView[];
  complianceTargets: { metric: string; priority: number | null; targetPercent: number }[];
}

export interface ComplianceReport {
  month: string;
  lines: { metric: string; label: string; priority: number | null; kept: number; missed: number; open: number; excluded: number; percent: number | null; target: number | null; atRisk: boolean }[];
}

export interface DuplicatePerson {
  personId: string;
  name: string;
  loginEmail: string;
  tickets: number;
  possibleMatch: { personId: string; name: string; employeeCode: string | null };
}

// ---- batch 3 (SD-1.18 to SD-1.23, SD-1.28): email, portals, banners, customers ----

export type MailboxKind = 'hosted' | 'forward' | 'm365_oauth' | 'gmail_oauth' | 'imap';

export interface Mailbox {
  id: string;
  deskId: string;
  address: string;
  kind: MailboxKind;
  displayName: string | null;
  sendingDomainId: string | null;
  defaultCategoryId: string | null;
  defaultTypeId: string | null;
  defaultTemplateId: string | null;
  autoAck: boolean;
  ackText: string | null;
  trustedForwarders: string[];
  status: 'active' | 'paused';
  lastPolledAt: string | null;
  lastError: string | null;
  config?: Record<string, unknown> | null;
  version: number;
  sendsMail?: boolean;
  sendsFromOwnDomain?: boolean;
}

export interface MailboxInput {
  address?: string;
  kind?: MailboxKind;
  displayName?: string;
  sendingDomainId?: string | null;
  defaultCategoryId?: string | null;
  defaultTypeId?: string | null;
  autoAck?: boolean;
  ackText?: string;
  trustedForwarders?: string[];
  status?: 'active' | 'paused';
  config?: Record<string, string | number>;
}

/** Shown once, right after a hosted or forward mailbox is made or its address is replaced. */
export interface WebhookSecret {
  webhookUrl: string;
  signingSecret: string;
}

export type RuleField = 'from' | 'domain' | 'to' | 'subject' | 'body' | 'header';
export type RuleOp = 'contains' | 'equals' | 'starts_with' | 'ends_with';
export type RuleAction = 'route' | 'tag' | 'priority' | 'reject' | 'spam' | 'parse_field';

export interface MailRuleInput {
  name: string;
  field: RuleField;
  headerName?: string;
  op: RuleOp;
  value: string;
  action: RuleAction;
  actionValue?: { categoryId?: string; tag?: string; priority?: number; key?: string; field?: string };
  stop?: boolean;
  active?: boolean;
  sortOrder?: number;
}
export interface MailRule extends MailRuleInput {
  id: string;
}

export type InboundVerdict = 'held' | 'spam' | 'rejected' | 'loop' | 'bounce' | 'accepted';

export interface InboundEmail {
  id: string;
  receivedAt: string;
  from: string;
  fromName: string | null;
  subject: string | null;
  verdict: InboundVerdict;
  reason: string | null;
  checks: { spf?: string | null; dkim?: string | null; dmarc?: string | null; dmarcPolicy?: string | null; arc?: string | null; verified?: boolean; signed?: boolean } | null;
  flags: string[];
  ticketId: string | null;
  released: boolean;
}

export interface InboundEmailDetail {
  id: string;
  from: string;
  fromName: string | null;
  to: string;
  subject: string | null;
  verdict: InboundVerdict;
  reason: string | null;
  flags: string[];
  receivedAt: string;
  text: string;
  files: string[];
}

export interface SendingDomain {
  id: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed';
  lastCheckedAt: string | null;
  records: { type: 'TXT'; host: string; value: string; ok: boolean; what: string }[];
}

export interface Bounce {
  id: string;
  address: string;
  kind: 'bounce' | 'complaint';
  reason: string | null;
  createdAt: string;
}

export type PortalSignUp = 'closed' | 'allowed_domains' | 'open';

export interface PortalInput {
  slug: string;
  name: string;
  deskIds: string[];
  signUp: PortalSignUp;
  allowedDomains?: string[];
  openRequests?: boolean;
  accentColour?: string;
  loginTitle?: string;
  loginText?: string;
  readingAids?: boolean;
  status?: 'active' | 'off';
}
export interface PortalView {
  id: string;
  slug: string;
  name: string;
  deskIds: string[];
  signUp: PortalSignUp;
  allowedDomains: string[];
  openRequests: boolean;
  accentColour: string | null;
  loginTitle: string | null;
  loginText: string | null;
  readingAids: boolean;
  status: 'active' | 'off';
  version: number;
  address: string;
}

export type BannerSeverity = 'info' | 'warning' | 'outage';
export type BannerAudience = 'everyone' | 'employees' | 'customers';

export interface BannerInput {
  text: string;
  severity: BannerSeverity;
  audience: BannerAudience;
  ticketId?: string | null;
  locationId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}
export interface Banner {
  id: string;
  deskId: string;
  text: string;
  severity: BannerSeverity;
  audience: BannerAudience;
  locationId: string | null;
  ticketId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  live: boolean;
  meToo: number;
  ticket: { id: string; number: string; systemState: SystemState } | null;
}

/** A live banner as a requester (employee or outside customer) sees it. */
export interface PublicBanner {
  id: string;
  text: string;
  severity: BannerSeverity;
  canMeToo: boolean;
  meToo: boolean;
}

export interface CustomerPlan {
  plan: string;
  tier: string;
  inherited: boolean;
}

export interface CustomerAccountRow {
  id: string;
  name: string;
  emailDomains: string[];
  parentId: string | null;
  parent: string | null;
  status: 'active' | 'inactive';
  contacts: number;
  plan: CustomerPlan | null;
  version: number;
}

export type ContactRole = 'primary' | 'billing' | 'technical' | 'member';

export interface CustomerContact {
  id: string;
  personId: string;
  name: string;
  email: string;
  role: ContactRole;
  seesAccountTickets: boolean;
  status: 'active' | 'inactive';
}

export interface Entitlement {
  id: string;
  plan: string;
  tier: string;
  ticketsAllowed: number | null;
  hoursAllowed: number | null;
  channels: string[];
  whenUsedUp: 'flag' | 'hold';
  validFrom: string;
  validTo: string | null;
}

export interface CustomerAccount {
  id: string;
  name: string;
  emailDomains: string[];
  status: 'active' | 'inactive';
  version: number;
  owner: { id: string; name: string } | null;
  parent: { id: string; name: string } | null;
  children: { id: string; name: string }[];
  plan: CustomerPlan | null;
  contacts: CustomerContact[];
  entitlements: Entitlement[];
}

export interface Product {
  id: string;
  name: string;
  deskId: string | null;
  active: boolean;
}

// ---- the outside portal (no YukthiX sign-in) ----

export interface PortalHome {
  company: string;
  portal: { name: string; accentColour: string | null; loginTitle: string | null; loginText: string | null; readingAids: boolean; openRequests: boolean; signUp: PortalSignUp };
  desks: { id: string; name: string; categories: { id: string; name: string; parentId: string | null }[]; products: { id: string; name: string }[] }[];
  banners: PublicBanner[];
}

export interface PortalMe {
  name: string;
  email: string;
  account: string | null;
  seesAccountTickets: boolean;
}

export interface PortalTicketRow {
  id: string;
  number: string;
  subject: string;
  status: string;
  systemState: SystemState;
  mine: boolean;
  raisedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalTicket {
  id: string;
  number: string;
  subject: string;
  desk: string;
  status: string;
  systemState: SystemState;
  createdAt: string;
  raisedBy: string | null;
  mine: boolean;
  canReply: boolean;
  resolveBy: string | null;
  messages: { id: string; side: 'agent' | 'requester' | 'system'; author: string; mine: boolean; bodyHtml: string; createdAt: string }[];
  files: { id: string; fileName: string; scanStatus: string }[];
}

export interface PortalRaiseInput {
  deskId: string;
  categoryId?: string;
  productId?: string;
  subject: string;
  description: string;
}
