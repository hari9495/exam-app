// LIFE-1.06 YukthiX starter checklists (M01 §3.5 / §3.7, YX-LC-22, YX-LC-26; D17: a labelled starter the company
// copies and edits; a company copy is never overwritten when a starter changes). Written by YukthiX in plain words.
// The appointment-letter task is the law (OSH Code, YX-LC-26): its owner and day can change, it cannot be removed or
// skipped. IT and Admin tasks become Service Desk requests once the company picks a catalogue item (founder D1).

export type OwnerType = 'hr' | 'it' | 'admin' | 'finance' | 'payroll' | 'manager' | 'person' | 'user' | 'group' | 'buddy';
export type TaskKind = 'tick' | 'form' | 'document' | 'letter' | 'desk_request' | 'read' | 'watch' | 'survey';
/** 6f (design §7.5): life events run on the same engine; each starter's company copy starts Not in use. */
export const LIFE_EVENT_KINDS = ['new_manager', 'transfer', 'parental_leave', 'return_to_work'] as const;
export type LifeEventKind = (typeof LIFE_EVENT_KINDS)[number];
export type JourneyKind = 'onboarding' | 'offboarding' | LifeEventKind;
export const isLifeEvent = (k: string): k is LifeEventKind => (LIFE_EVENT_KINDS as readonly string[]).includes(k);
export interface StarterTask {
  key: string;
  title: string;
  ownerType: OwnerType;
  kind: TaskKind;
  config?: Record<string, unknown>;
  dueOffsetDays: number;
  dependsOn?: string[];
  required?: boolean;
  locked?: boolean;
}
export interface Starter {
  key: string;
  kind: JourneyKind;
  name: string;
  summary: string;
  tasks: StarterTask[];
}

const firstDayForm = {
  form: {
    sections: [
      {
        id: 'plan',
        columns: 1,
        fields: [
          { key: 'desk_ready', type: 'checkbox', label: 'Desk or work place is ready', required: true },
          { key: 'first_week', type: 'textarea', label: 'What the joiner does in the first week', required: true, max: 2000 },
        ],
      },
    ],
    rules: [],
  },
};

export const STARTERS: readonly Starter[] = [
  {
    key: 'onboarding_standard',
    kind: 'onboarding',
    name: 'Standard onboarding (starter)',
    summary: 'Documents, the appointment letter, IT and admin set-up, the PF and ESI joining tasks, and the manager’s first-week plan.',
    tasks: [
      { key: 'collect_pan', title: 'Collect the PAN card', ownerType: 'hr', kind: 'document', config: { typeKey: 'pan_card' }, dueOffsetDays: -7 },
      { key: 'collect_bank', title: 'Collect bank proof', ownerType: 'hr', kind: 'document', config: { typeKey: 'bank_proof' }, dueOffsetDays: -7 },
      { key: 'collect_education', title: 'Collect the highest education certificate', ownerType: 'hr', kind: 'document', config: { typeKey: 'education' }, dueOffsetDays: -5 },
      { key: 'collect_photo', title: 'Collect a photograph', ownerType: 'hr', kind: 'document', config: { typeKey: 'photo' }, dueOffsetDays: -5, required: false },
      { key: 'appointment_letter', title: 'Issue the appointment letter', ownerType: 'hr', kind: 'letter', config: { letterType: 'appointment' }, dueOffsetDays: 0, locked: true },
      { key: 'laptop', title: 'Laptop or work device', ownerType: 'it', kind: 'desk_request', dueOffsetDays: -2 },
      { key: 'accounts', title: 'Email and system accounts', ownerType: 'it', kind: 'desk_request', dueOffsetDays: -1 },
      { key: 'access_card', title: 'Access card and seat', ownerType: 'admin', kind: 'desk_request', dueOffsetDays: -1 },
      { key: 'welcome_call', title: 'Call the joiner before day one', ownerType: 'manager', kind: 'tick', dueOffsetDays: -3 },
      // Lifecycle 6e (PPL-41): the buddy checks in after a month (HR holds it until a buddy is named).
      // 6f: the new hire's own first step, shown on My first 30 days (§7.6).
      { key: 'welcome_read', title: 'How things work here', ownerType: 'person', kind: 'read', config: { text: 'Your manager and HR will help you settle in. Working hours, leave and holidays are in YukthiX under Time. Replace this text with your company’s own welcome guide.' }, dueOffsetDays: 1, required: false },
      { key: 'buddy_checkin', title: 'Buddy check-in after 30 days', ownerType: 'buddy', kind: 'tick', dueOffsetDays: 30, required: false },
      { key: 'first_week_plan', title: 'Plan the first week', ownerType: 'manager', kind: 'form', config: firstDayForm, dueOffsetDays: -1 },
      { key: 'uan', title: 'Generate or link the UAN', ownerType: 'payroll', kind: 'tick', dueOffsetDays: 3 },
      { key: 'form_11', title: 'Collect Form 11 (PF declaration)', ownerType: 'payroll', kind: 'tick', dueOffsetDays: 3 },
      { key: 'form_2', title: 'Collect Form 2 (PF and pension nomination)', ownerType: 'payroll', kind: 'tick', dueOffsetDays: 7 },
      { key: 'esic', title: 'Register with ESIC where ESI applies', ownerType: 'payroll', kind: 'tick', dueOffsetDays: 7, required: false },
    ],
  },
  {
    key: 'offboarding_standard',
    kind: 'offboarding',
    name: 'Standard offboarding (starter)',
    summary: 'Handover, access removal, asset return, and the PF, ESI and gratuity exit tasks.',
    tasks: [
      { key: 'handover', title: 'Hand over work and files', ownerType: 'manager', kind: 'tick', dueOffsetDays: -3 },
      { key: 'remove_access', title: 'Remove system access', ownerType: 'it', kind: 'desk_request', dueOffsetDays: 0 },
      { key: 'return_assets', title: 'Collect laptop, card and other assets', ownerType: 'admin', kind: 'desk_request', dueOffsetDays: 0 },
      { key: 'epfo_exit', title: 'Mark the date of exit on the EPFO portal', ownerType: 'payroll', kind: 'tick', dueOffsetDays: 2 },
      { key: 'esic_exit', title: 'Mark the ESIC exit where ESI applies', ownerType: 'payroll', kind: 'tick', dueOffsetDays: 2, required: false },
      { key: 'form_l', title: 'Send gratuity Form L where gratuity is payable', ownerType: 'payroll', kind: 'tick', dueOffsetDays: 15, required: false },
      { key: 'pf_claim', title: 'Attest the PF transfer or withdrawal claim', ownerType: 'payroll', kind: 'tick', dueOffsetDays: 30, required: false },
    ],
  },
  // 6f life events (gap pass O1). Placeholder content in our own words; the company replaces it with its own.
  {
    key: 'new_manager_standard',
    kind: 'new_manager',
    name: 'New manager (starter)',
    summary: 'For someone who gets their first team: what changes, who to ask, and a check-in after the first month.',
    tasks: [
      { key: 'welcome', title: 'Talk about the new role', ownerType: 'manager', kind: 'tick', dueOffsetDays: 0 },
      { key: 'read_role', title: 'What a manager does here', ownerType: 'person', kind: 'read', config: { text: 'As a manager you approve leave and attendance for your team, set goals with each person and meet them one to one. HR will help with anything you are unsure about. Replace this text with your company’s own guide.' }, dueOffsetDays: 1 },
      { key: 'approvals', title: 'Look at your approvals inbox', ownerType: 'person', kind: 'tick', dueOffsetDays: 3 },
      { key: 'one_to_ones', title: 'Meet each person in your team', ownerType: 'person', kind: 'tick', dueOffsetDays: 14 },
      { key: 'pulse', title: 'How is it going?', ownerType: 'person', kind: 'survey', config: { questions: ['I know what is expected of me as a manager.', 'I know where to get help.'] }, dueOffsetDays: 30 },
    ],
  },
  {
    key: 'transfer_standard',
    kind: 'transfer',
    name: 'Transfer (starter)',
    summary: 'For a move to another place, team or company in the group: hand over before, settle in after.',
    tasks: [
      { key: 'handover', title: 'Hand over current work', ownerType: 'person', kind: 'tick', dueOffsetDays: -3 },
      { key: 'access', title: 'Check system access for the new team', ownerType: 'it', kind: 'tick', dueOffsetDays: 0 },
      { key: 'welcome', title: 'Welcome to the new team', ownerType: 'manager', kind: 'tick', dueOffsetDays: 1 },
      { key: 'read_place', title: 'About your new place of work', ownerType: 'person', kind: 'read', config: { text: 'Timings, holidays and leave rules can differ by place. Check your new holiday list and attendance rules on your first day. Replace this text with your company’s own guide.' }, dueOffsetDays: 1 },
      { key: 'pulse', title: 'How is the move going?', ownerType: 'person', kind: 'survey', config: { questions: ['I have what I need to do my work.', 'My new team made me welcome.'] }, dueOffsetDays: 21 },
    ],
  },
  {
    key: 'parental_leave_standard',
    kind: 'parental_leave',
    name: 'Parental leave (starter)',
    summary: 'For maternity or paternity leave: hand over, know your benefits, stay in touch only if you want to.',
    tasks: [
      { key: 'handover', title: 'Plan the hand-over', ownerType: 'manager', kind: 'tick', dueOffsetDays: -7 },
      { key: 'read_benefits', title: 'Your leave and benefits', ownerType: 'person', kind: 'read', config: { text: 'Your leave days, how pay works during leave and how to extend or end leave early are in your company’s leave policy. Replace this text with your company’s own guide.' }, dueOffsetDays: -3 },
      { key: 'contact', title: 'Agree how (and whether) to keep in touch', ownerType: 'hr', kind: 'tick', dueOffsetDays: -1, required: false },
    ],
  },
  {
    key: 'return_to_work_standard',
    kind: 'return_to_work',
    name: 'Return to work (starter)',
    summary: 'For coming back after parental leave: a plan before day one, a gentle first week, a check-in.',
    tasks: [
      { key: 'plan', title: 'Plan the return with the employee', ownerType: 'manager', kind: 'tick', dueOffsetDays: -7 },
      { key: 'access', title: 'Check system access and the work device', ownerType: 'it', kind: 'tick', dueOffsetDays: -1 },
      { key: 'catch_up', title: 'What changed while you were away', ownerType: 'person', kind: 'read', config: { text: 'Your manager will walk you through changes in the team and your work. Replace this text with your company’s own guide.' }, dueOffsetDays: 0 },
      { key: 'pulse', title: 'How is the return going?', ownerType: 'person', kind: 'survey', config: { questions: ['My return was well planned.', 'My manager supports a flexible start.'] }, dueOffsetDays: 14 },
    ],
  },
];

/** Starter tasks that are law: kept locked in every company copy (YX-LC-26). */
export const LOCKED_STARTER_KEYS: ReadonlyMap<string, readonly string[]> = new Map(STARTERS.map((s) => [s.key, s.tasks.filter((t) => t.locked).map((t) => t.key)]));
