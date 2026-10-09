// Service Desk 3b-2 batch 1 (SD-2.01 … SD-2.05, SD-2.12): the shapes the catalogue, approvals and rules screens use.
import type { Answers, FormDef, ServerGroup } from '../../lib/forms';

export interface CatalogItemCard {
  id: string;
  deskId: string;
  desk: string;
  category: string | null;
  name: string;
  shortText: string | null;
  cost: number | null;
  currency: string;
  deliveryDays: number | null;
}
export interface OrderGuideCard {
  id: string;
  name: string;
  description: string | null;
}
export interface Catalogue {
  items: CatalogItemCard[];
  guides: OrderGuideCard[];
}
export interface ItemMedia {
  kind: 'image' | 'video' | 'document';
  title: string;
  url: string;
}
export interface CatalogItemPage {
  id: string;
  name: string;
  shortText: string | null;
  desk: string;
  cost: number | null;
  currency: string;
  deliveryDays: number | null;
  version: number;
  bodyHtml: string;
  media: ItemMedia[];
  form: FormDef;
  /** The orderer's department, location, cost centre and legal entity (ids), for form rules. */
  profile: Record<string, string | null>;
  /** Names of the approval steps, in order. */
  approvals: string[];
}
export interface OrderGuideView {
  id: string;
  name: string;
  description: string | null;
  form: FormDef;
}
export interface CartLine {
  key: string;
  item: CatalogItemPage;
  quantity: number;
  answers: Answers;
}
export interface PickOption {
  id: string;
  label: string;
  detail: string | null;
}
export type PickKind = 'people' | 'locations' | 'cost-centres';

export type ItemStage = 'submitted' | 'approval' | 'fulfilment' | 'delivered' | 'cancelled' | 'rejected';
export interface ApprovalRoute {
  status: string;
  steps: { name: string; state: string; rule: string; approvers: { name: string; onBehalfOf: string | null; status: string }[]; waitingFor: string[] }[];
  log: { action: string; by: string | null; onBehalfOf: string | null; step: number | null; reason: string | null; channel: string; at: string }[];
}
export interface RequestItemView {
  id: string;
  item: string;
  itemVersion: number;
  quantity: number;
  stage: ItemStage;
  stageAt: string;
  tracker: { stage: string; state: 'done' | 'current' | 'next' | 'stopped' }[];
  canCancel: boolean;
  /** The requester sees labelled answers; agents of the desk see the raw answers. */
  answers: { label: string; value: string }[] | Record<string, unknown>;
  approval: ApprovalRoute | null;
  tasks: { id: string; title: string; state: string; dueAt: string | null }[];
}
export interface MyRequestView {
  ticketId: string;
  number: string;
  subject: string;
  systemState: string;
  items: RequestItemView[];
}
export interface TicketRequestView {
  items: RequestItemView[];
  approvals: (ApprovalRoute & { id: string; title: string; summary: { label: string; value: string }[]; submittedAt: string })[];
}

// ------------------------------------------------------------------ approvals (P03)

export interface ApprovalTask {
  taskId: string;
  requestId: string;
  type: string;
  title: string;
  summary: { label: string; value: string }[];
  requester: string;
  raisedBy: string | null;
  onBehalfOf: string | null;
  step: { index: number; of: number; name: string; need: number; approvers: number };
  dueAt: string | null;
  submittedAt: string;
  /** Irreversible requests (e.g. reopening a locked pay month) are decided on their own page, with a fresh second step. */
  decideAt?: string | null;
}
export interface ApprovalHistory {
  decided: { requestId: string; title: string; type: string; decision: string; at: string; requestStatus: string }[];
  sent: { requestId: string; title: string; type: string; status: string; submittedAt: string; decidedAt: string | null }[];
}
export interface Delegation {
  id: string;
  mine: boolean;
  person: string;
  delegate: string;
  startsOn: string;
  endsOn: string;
  source: 'manual' | 'leave';
}

// ------------------------------------------------------------------ catalogue set-up

export interface FulfilmentTaskDef {
  title: string;
  groupId: string;
  olaHours?: number;
  note?: string;
}
export type ApproverDef = { kind: 'manager'; level?: number } | { kind: 'cost_centre_owner'; field: string } | { kind: 'users'; userIds: string[] } | { kind: 'user_group'; groupId: string };
export interface ApprovalStepDef {
  name: string;
  approvers: ApproverDef[];
  mode: 'any' | 'all' | 'count' | 'percent';
  count?: number;
  percent?: number;
  rejectOn?: 'one' | 'quorum_lost';
  remindAfterHours?: number;
  timeoutHours?: number;
  onTimeout?: 'escalate' | 'approve' | 'reject';
  selfApproval?: 'never' | 'allowed';
}
export interface ItemDraft {
  bodyHtml?: string;
  media?: ItemMedia[];
  form?: FormDef;
  approval?: ApprovalStepDef[];
  fulfilment?: FulfilmentTaskDef[];
}
export interface CatalogItemAdmin {
  id: string;
  deskId: string;
  categoryId: string | null;
  name: string;
  shortText: string | null;
  state: 'draft' | 'published' | 'retired';
  currentVersion: number | null;
  audience: ServerGroup | null;
  cost: number | null;
  currency: string;
  deliveryDays: number | null;
  sortOrder: number;
  draft: ItemDraft;
  version: number;
  updatedAt: string;
  versions?: { version: number; publishedAt: string }[];
  orders?: Record<string, number>;
}
export interface CatalogSchema {
  requesterFields: { key: string; label: string; type: 'choice'; options: { value: string; label: string }[] }[];
  groups: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  userGroups: { id: string; name: string }[];
  questionnaires: { id: string; name: string }[];
  costCentresWithoutOwner: string[];
}
export interface CatalogItemInput {
  name?: string;
  shortText?: string;
  categoryId?: string | null;
  cost?: number | null;
  deliveryDays?: number | null;
  audience?: ServerGroup | null;
  everyone?: boolean;
  draft?: ItemDraft;
}

// ------------------------------------------------------------------ rules (P19 automation)

export interface RuleTriggerDef {
  key: string;
  label: string;
  time?: boolean;
}
export interface DeskRuleAction {
  type: 'assign' | 'set_field' | 'add_tag' | 'notify' | 'escalate' | 'create_task' | 'webhook';
  groupId?: string;
  userId?: string;
  field?: 'priority' | 'category' | 'type' | 'status';
  value?: string | number;
  tag?: string;
  to?: 'assignee' | 'group' | 'leads' | 'user';
  message?: string;
  tier?: 'L2' | 'L3';
  title?: string;
  olaHours?: number;
  webhookId?: string;
}
export interface DeskRule {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'retired';
  pausedReason: string | null;
  sortOrder: number;
  stopAfter: boolean;
  maxRunsPerHour: number;
  currentVersion: number;
  recipeKey: string | null;
  version: number;
  trigger: { type: string; hours?: number; fields?: string[] };
  condition: ServerGroup;
  actions: DeskRuleAction[];
  lastWeek?: Record<string, number>;
}
export interface DeskRuleSchema {
  triggers: RuleTriggerDef[];
  fields: { key: string; label: string; type: 'text' | 'number' | 'money' | 'date' | 'choice'; options?: { value: string; label: string }[] }[];
  groups: { id: string; name: string }[];
  people: { id: string; name: string; role: string }[];
  categories: { id: string; name: string }[];
  types: { id: string; name: string }[];
  statuses: { id: string; name: string }[];
  webhooks: { id: string; name: string; url: string }[];
  canUseWebhooks: boolean;
  recipes: readonly { key: string; name: string; description: string }[];
}
export interface RuleRun {
  id: string;
  at: string;
  ruleVersion: number;
  trigger: string;
  /** null when the run was on a ticket the reader cannot open (then nothing else about it is shown). */
  ticketId: string | null;
  ticket: string | null;
  outcome: 'matched' | 'not_matched' | 'failed' | 'loop_stopped' | 'limit_stopped' | 'dry_run' | 'hidden';
  depth: number;
  trace: { id: string; label: string; operator: string; expected: unknown; actual: unknown; pass: boolean }[];
  actions: { type: string; result: string }[];
  error: string | null;
}
export interface DryRunResult {
  checked: number;
  matched: number;
  records: { recordId: string; label: string; match: boolean; trace: RuleRun['trace'] }[];
}
export interface RuleWebhook {
  id: string;
  name: string;
  url: string;
  active: boolean;
}
