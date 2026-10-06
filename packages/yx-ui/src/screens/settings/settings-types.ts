// Settings map types (APX-D §3). One SettingsPageDef per settings page; the generic SettingsPageScreen renders it.
// Rules carried by the data: D17 starter defaults, "set by law" read-only values (P07), legal floors, source scope, dated settings.

export type SettingValue = string | number | boolean | string[] | null;

export type SettingKind =
  | 'text' // single line
  | 'textarea' // long text (consent text, notice wording)
  | 'number' // plain whole number, use `unit` for days / months / hours
  | 'money' // ₹ amount
  | 'percent' // 0–100
  | 'toggle' // on / off (rendered as a checkbox; the page has a Save button, so no Switch)
  | 'select' // one of many (> 5 options)
  | 'radio' // one of 2–5 visible options
  | 'multiselect' // several of many
  | 'time' // 12-hour time, value 'HH:mm'
  | 'date' // value ISO 'yyyy-mm-dd'
  | 'list' // a master table (departments, leave types…): columns + rows, Add / Edit per row
  | 'link' // bespoke editor owned by another screen (PLT-32 rule builder, TIM leave type editor…)
  | 'offsets' // a few numbers as chips, e.g. reminders 30 and 7 days before (value string[], unit after)
  | 'usage' // read-only meter: value used of `max`, in `unit`
  | 'image' // uploaded picture (logo): preview, Replace, Remove
  | 'colour' // hex colour with swatch picker, preview and contrast check
  | 'law'; // legal value: read-only with a "Set by law" chip and link to the rules browser

export interface LegalFloor {
  /** Minimum allowed value (or maximum when `kind` is 'max'). */
  value: number;
  kind?: 'min' | 'max';
  /** Statute citation shown in the hint, e.g. "Maternity Benefit Act, 1961 s.5". */
  statute: string;
}

export interface SettingDef {
  /** Registry key, e.g. "leave.notice_days". Unique across all pages. */
  key: string;
  label: string;
  kind: SettingKind;
  /** Current value. */
  value?: SettingValue;
  /** Options for select / radio / multiselect. */
  options?: string[];
  /** Shown after number inputs and in search results, e.g. "days". */
  unit?: string;
  min?: number;
  max?: number;
  /** Plain helper line under the control. */
  helper?: string;
  /** Legal floor (D17: law is a floor). The form blocks saving below it and always shows the hint. */
  legal?: LegalFloor;
  /** 'law' kind: statute that sets the value. */
  law?: string;
  /** Value still equals the YukthiX starter template (label "Starter default"). */
  starter?: boolean;
  /** Effective-dated setting: shows "Valid from" and history (P06). */
  dated?: { validFrom: string };
  /** Where the value comes from: "Company" | "Inherited from Kaveri Foods Pvt Ltd" | "Overridden for Hosur plant". */
  scope?: string;
  /** Extra words for settings search ("probation", "late coming"). */
  synonyms?: string[];
  /** Read-only after a one-time choice, with the reason, e.g. "Fixed at sign-up". */
  locked?: string;
  /** Sensitive settings need re-authentication on save (P02 / M04 Q8). */
  sensitive?: boolean;
  /** list kind */
  columns?: string[];
  rows?: string[][];
  addLabel?: string;
  /** link kind: the screen that owns the bespoke editor. */
  linkScreenId?: string;
  linkLabel?: string;
  /** Contributed by a doc other than the page owner, e.g. "P23". */
  contributedBy?: string;
  /** Not available yet: shown as "Coming soon" and the control is disabled. */
  availability?: string;
  /** Labels shown for options when they differ from the stored value, e.g. 'dd-mm-yyyy' → '30-09-2026'. */
  optionLabels?: Record<string, string>;
  /** list kind: a summary the page can't edit (no Add, no row edit). */
  readOnlyList?: boolean;
  /** list kind: an extra button per row, e.g. "View on map". */
  rowAction?: string;
  /** Verification state (domain, email sender), with an optional action. */
  status?: { tone: 'success' | 'warning'; text: string; action?: string };
  /** Action shown next to a locked value, e.g. Request a region move. */
  lockedAction?: { label: string; screenId: string };
  /** Only shown while another setting on the page has this value (e.g. auto-confirm days only when auto-confirm is on). */
  showWhen?: { key: string; equals: SettingValue };
  /** A warning always shown under the control (e.g. who can see salaries). */
  warning?: string;
  /** Can't be changed until something else is fixed; the reason is shown and the control is disabled. */
  blocked?: string;
  /** list kind: pick-lists for some columns in the row editor. */
  columnOptions?: Record<string, string[]>;
  /** list kind: columns shown but not editable in the row editor. */
  lockedColumns?: string[];
  /** Values that differ for a location, department or type. Shown once, under the company value, as "Different for: …". */
  overrides?: { scope: string; value: SettingValue; validFrom?: string }[];
  /** A YukthiX product rule (not a law): read-only, labelled "Built-in rule". Set from "YukthiX rule: …" text. */
  builtIn?: boolean;
  /** text kind: a numbering pattern like KFL/{type}/{yyyy}/{seq:4}; shows the next number and needs {seq}. */
  refPattern?: boolean;
  /** number kind: can't be more than this other setting on the page (half day ≤ full day). */
  atMost?: string;
  /** time kind: must be later than this other setting on the page (visitors until > from). */
  after?: string;
  /** list kind: a column that can't go below another column (Your value ≥ Legal minimum). */
  minColumn?: { value: string; min: string };
}

export interface SettingsSectionDef {
  title: string;
  description?: string;
  /** 'danger': emergency controls, shown last with a red border. */
  tone?: 'danger';
  settings: SettingDef[];
}

export interface LastChange {
  by: string;
  role: string;
  /** ISO date-time, e.g. "2026-09-14T11:05". Never "now". */
  at: string;
  /** Plain words: "Changed notice period for Grade M1 from 60 to 90 days". */
  what: string;
}

export interface SettingsPageDef {
  /** "3.6" */
  id: string;
  group: number;
  title: string;
  /** One or two sentences: what this page controls. */
  summary: string;
  /** Owning doc(s), e.g. ["M02"]. */
  owner: string[];
  /** Docs that contribute settings to the page. */
  contributes?: string[];
  /** Permission needed to edit (P02), e.g. "attendance.settings.manage". */
  permission: string;
  /** Who holds that permission, for the read-only message. */
  permissionHolder: string;
  sections: SettingsSectionDef[];
  lastChange: LastChange;
  /** Related screens (by §2 ID) opened from this page. */
  related?: { label: string; screenId: string }[];
  /** Page-level notes, e.g. "Payroll pages need a second approver (P03 YX-WF-16)". */
  note?: string;
  /** Scopes this page can be overridden at. */
  scopes?: string[];
  /** Sections that hold one item's rules (e.g. earned leave), with a picker to switch item. */
  typePicker?: { label: string; options: string[]; sections: string[]; editorScreenId: string; editorLabel: string };
}

export interface SettingsGroupDef {
  id: number;
  title: string;
  summary: string;
  pages: SettingsPageDef[];
}
