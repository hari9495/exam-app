// LIFE-1.06 YukthiX starter checklists (M01 §3.5 / §3.7, YX-LC-22, YX-LC-26; D17: a labelled starter the company
// copies and edits; a company copy is never overwritten when a starter changes). Written by YukthiX in plain words.
// The appointment-letter task is the law (OSH Code, YX-LC-26): its owner and day can change, it cannot be removed or
// skipped. IT and Admin tasks become Service Desk requests once the company picks a catalogue item (founder D1).

export type OwnerType = 'hr' | 'it' | 'admin' | 'finance' | 'payroll' | 'manager' | 'person' | 'user' | 'group' | 'buddy';
export type TaskKind = 'tick' | 'form' | 'document' | 'letter' | 'desk_request';
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
  kind: 'onboarding' | 'offboarding';
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
];

/** Starter tasks that are law: kept locked in every company copy (YX-LC-26). */
export const LOCKED_STARTER_KEYS: ReadonlyMap<string, readonly string[]> = new Map(STARTERS.map((s) => [s.key, s.tasks.filter((t) => t.locked).map((t) => t.key)]));
