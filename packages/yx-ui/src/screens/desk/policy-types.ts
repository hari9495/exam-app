// HLP-10 / HLP-11 company policies: the shapes the server sends (apps/api/src/policies).

export type PolicyMethod = 'click' | 'otp';
export type MyPolicyStatus = 'pending' | 'overdue' | 'acknowledged';
export type PolicyVersionStatus = 'draft' | 'waiting' | 'sent_back' | 'published';

export interface PolicyFile {
  id: string;
  name: string;
  size: number;
  type: string;
  scan: 'pending' | 'clean' | 'infected' | string;
}

/** GET desk/my/policies → policies[]. */
export interface MyPolicyRow {
  id: string;
  code: string;
  title: string;
  category: string;
  method: PolicyMethod;
  version: string;
  versionId: string;
  effectiveOn: string | null;
  changeSummary: string | null;
  status: MyPolicyStatus;
  dueOn: string | null;
  acknowledgedOn: string | null;
  acknowledgedVersion: string | null;
}

/** GET desk/my/policies/:id. */
export interface MyPolicy {
  id: string;
  code: string;
  title: string;
  category: string;
  method: PolicyMethod;
  owner: string | null;
  version: string;
  versionId: string;
  effectiveOn: string | null;
  changeSummary: string | null;
  bodyHtml: string;
  files: PolicyFile[];
  status: MyPolicyStatus;
  dueOn: string | null;
  acknowledged: { version: string | null; at: string; method: PolicyMethod; typedName: string | null } | null;
  typedName: boolean;
  myName: string;
}

export interface MyAckInput {
  versionId: string;
  read: true;
  typedName?: string;
  code?: string;
}

/** GET desk/policies. */
export interface PolicyRowAdmin {
  id: string;
  code: string;
  title: string;
  category: string;
  method: PolicyMethod;
  owner: string | null;
  version: string | null;
  effectiveOn: string | null;
  open: { number: number; status: PolicyVersionStatus } | null;
  audience: number;
  acknowledged: number;
  overdue: number;
  dueOn: string | null;
}

export interface PolicyVersionView {
  id: string;
  number: number;
  label: string;
  status: PolicyVersionStatus;
  changeSummary: string | null;
  reack: boolean;
  effectiveOn: string | null;
  writtenBy: string | null;
  writtenByMe: boolean;
  publishedBy: string | null;
  needsSecondPerson: boolean;
  /** HLP-14: the counsel note the publisher ticks as seen before publishing (null when none). */
  counselNote?: string | null;
  sentBackNote: string | null;
  acknowledged: number;
  version: number;
}

export interface PolicySettings {
  dueDays: number;
  everyDays: number | null;
  managerAfterDays: number | null;
  reackDefault: boolean;
  typedName: boolean;
  secondPerson: boolean;
}

/** GET desk/policies/:id. */
export interface PolicyAdmin {
  id: string;
  code: string;
  title: string;
  category: string;
  method: PolicyMethod;
  ownerUserId: string | null;
  owner: string | null;
  legalEntityIds: string[];
  locationIds: string[];
  departmentIds: string[];
  gradeIds: string[];
  version: number;
  current: (PolicyVersionView & { bodyHtml: string; files: PolicyFile[] }) | null;
  open: (PolicyVersionView & { bodyHtml: string; files: PolicyFile[] }) | null;
  versions: PolicyVersionView[];
  ackVersion: string | null;
  audience: number;
  acknowledged: number;
  overdue: number;
  dueOn: string | null;
  byDept: { departmentId: string | null; dept: string; audience: number; acknowledged: number }[];
  settings: PolicySettings;
}

/** GET desk/policies/:id/pending. */
export interface PendingPerson {
  employeeId: string;
  name: string;
  code: string | null;
  departmentId: string | null;
  dept: string | null;
  manager: string | null;
  dueOn: string;
  daysOverdue: number;
  lastRemindedOn: string | null;
  managerTold: boolean;
}

export interface NamedId {
  id: string;
  name: string;
}
/** GET desk/policies/options. */
export interface PolicyOptions {
  legalEntities: NamedId[];
  locations: NamedId[];
  departments: NamedId[];
  grades: NamedId[];
  owners: NamedId[];
}

export interface PolicyChange {
  title?: string;
  category?: string;
  method?: PolicyMethod;
  ownerUserId?: string;
  legalEntityIds?: string[];
  locationIds?: string[];
  departmentIds?: string[];
  gradeIds?: string[];
}
