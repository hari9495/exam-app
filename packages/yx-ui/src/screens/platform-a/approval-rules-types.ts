// E2 approval rules editor: the shapes the live screens and the web share (GET/PUT /workflow/policies and friends).
import type { RuleField } from '../../lib/rules';
import type { ServerGroup } from '../../lib/forms';

export type PolicyApprover = 'manager' | 'manager_2' | 'hr' | 'users' | 'group' | 'key_holders' | 'chain_grade' | 'chain_limit' | 'hiring_manager';
export interface PolicyStepInput {
  name: string;
  approver: PolicyApprover;
  mode: 'any' | 'all' | 'count';
  count?: number;
  userIds?: string[];
  groupId?: string;
  key?: string;
  scope?: 'entity' | 'department' | 'location';
  gradeId?: string;
  family?: string;
}
export interface PolicyRuleInput {
  name: string;
  when: ServerGroup;
  steps: PolicyStepInput[];
}
export interface PolicyTypeRow {
  key: string;
  label: string;
  /** The area the list groups it under. */
  group?: string;
  /** full: company steps replace the built-in ones; addon: they come after them; locked: built in, cannot change. */
  mode?: 'full' | 'addon' | 'locked';
  /** The values a rule may test. */
  fields?: { key: string; label: string; type: RuleField['type']; options?: { value: string; label: string }[] }[];
  /** The approval-limit family of an amount type (expense, hiring, pay). */
  family?: string | null;
  /** Pay types: the key every approver must hold. */
  payKey?: string | null;
  /** The otherwise route; null: the module's built-in steps. */
  steps: PolicyStepInput[] | null;
  rules?: PolicyRuleInput[];
  /** The module's own steps in words. */
  builtIn?: string;
  approvers: string;
  version: number;
  updatedBy: string | null;
  updatedAt: string | null;
}
export interface PolicyBodyInput {
  rules: PolicyRuleInput[];
  steps: PolicyStepInput[];
}

/** "Try it" (PLT-57): what the engine's route gave. */
export interface TryResult {
  rule: string | null;
  values: Record<string, string | number | null>;
  /** On sample values, the module's own steps in words (it adds them when the request is sent). */
  builtIn: string | null;
  steps: { name: string; from: 'company' | 'required' | 'built_in'; state: string; need: number; approvers: string[]; fallback: boolean; nobody: boolean }[];
}
export interface TryInput {
  values?: Record<string, string | number>;
  requestId?: string;
  draft?: PolicyBodyInput;
}
export interface PastRequest {
  id: string;
  title: string;
  submittedAt: string;
}

/** Part 7: the hiring notices. */
export interface NoticeRow {
  event: string;
  label: string;
  subject: string | null;
  body: string | null;
  own: boolean;
}

/** Part 6: the old hiring routes next to the new rules. */
export interface MoveRow {
  type: string;
  label: string;
  status: 'none' | 'moved' | 'match' | 'differs';
  checked: number;
  differences: { step: string; person: string; old: string[]; new: string[]; why: string }[];
}

export interface Choice {
  value: string;
  label: string;
}

export interface LivePolicyEditor {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  types: PolicyTypeRow[];
  remindHours: number;
  escalateHours: number;
  canEdit: boolean;
  onSave: (type: string, body: PolicyBodyInput, version: number) => Promise<unknown>;
  onReset: (type: string, version: number) => Promise<unknown>;
  /** Stories: open on this request type. */
  defaultType?: string;
  /** Hiring › Approvals (answer 2650): the same editor, these types only. */
  only?: string[];
  /** Who can be chosen as approvers. */
  people?: Choice[];
  groups?: Choice[];
  grades?: Choice[];
  /** Try it (PLT-57). */
  onTry?: (type: string, input: TryInput) => Promise<TryResult>;
  pastRequests?: (type: string) => Promise<PastRequest[]>;
  /** Part 7: notices of the hiring types. */
  notices?: {
    load: (type: string) => Promise<{ events: NoticeRow[] }>;
    save: (type: string, event: string, v: { subject: string; body: string }) => Promise<unknown>;
    reset: (type: string, event: string) => Promise<unknown>;
  };
  /** Part 6: the move of the old hiring routes (Hiring › Approvals). */
  move?: { rows: MoveRow[] | null; onMove: () => Promise<unknown> };
  /** Where the approval limits are set. */
  limitsHref?: string;
}
