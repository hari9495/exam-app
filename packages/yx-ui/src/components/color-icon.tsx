// Colour icons (§8): Fluent UI System Icons, Color variant (MIT, © Microsoft — see THIRD-PARTY-NOTICES.md).
// Vendored SVG copies (src/icons/color), not the npm package: Microsoft deprecated the *Color React exports (§8).
// Big, friendly icons for areas, Home tiles, empty states, the setup hub and help. Everything small and dense
// stays on Lucide outline (<Icon>). Screens never import Fluent icons directly: add a meaning here, then use
// <ColorIcon name="area.people" />. One icon per meaning.
import * as F from '../icons/color/fluent-color';
import { cx } from '../lib/cx';

export type ColorIconSize = 20 | 24 | 32 | 48;

export interface ColorIconEntry {
  /** What the icon means, in the product's words. */
  meaning: string;
  /** Fluent icon name, for the registry table and the notices file. */
  fluent: string;
  /** Hand-drawn art per size; a missing size scales the nearest drawing. */
  art: Partial<Record<ColorIconSize, string>>;
  /** Too dark for dark surfaces (measured, §8): sits on a light neutral tile in dark mode. */
  darkTile?: boolean;
  /** Approved stand-in until the designer delivers a composite (§8 brief). */
  standIn?: boolean;
}

const e = (meaning: string, fluent: string, art: ColorIconEntry['art'], darkTile?: boolean, standIn?: boolean): ColorIconEntry => ({ meaning, fluent, art, darkTile, standIn });

/** The icon registry: one meaning → one icon. Add here, never ad hoc in a screen. */
export const COLOR_ICONS = {
  // Navigation areas (rail, 20 px)
  'area.home': e('Home', 'Home', { 20: F.home20, 24: F.home24, 32: F.home32, 48: F.home48 }),
  'area.people': e('People', 'People', { 20: F.people20, 24: F.people24, 32: F.people32, 48: F.people48 }),
  'area.time': e('Time and leave', 'CalendarClock', { 20: F.calendarClock20, 24: F.calendarClock24 }),
  'area.payroll': e('Payroll', 'CoinMultiple', { 20: F.coinMultiple20, 24: F.coinMultiple24, 32: F.coinMultiple32, 48: F.coinMultiple48 }),
  'area.hiring': e('Hiring', 'PersonAdd', { 20: F.personAdd20, 24: F.personAdd24, 32: F.personAdd32, 48: F.personAdd48 }),
  'area.assessments': e('Assessments', 'ClipboardTextEdit', { 20: F.clipboardTextEdit20, 24: F.clipboardTextEdit24, 32: F.clipboardTextEdit32 }),
  'area.serviceDesk': e('Service desk', 'Headset', { 20: F.headset20, 24: F.headset24, 32: F.headset32, 48: F.headset48 }, true),
  'area.performance': e('Performance', 'Trophy', { 20: F.trophy20, 24: F.trophy24, 32: F.trophy32, 48: F.trophy48 }),
  'area.learning': e('Learning', 'BookOpen', { 20: F.bookOpen20, 24: F.bookOpen24, 32: F.bookOpen32, 48: F.bookOpen48 }),
  'area.analytics': e('Analytics', 'DataTrending', { 20: F.dataTrending20, 24: F.dataTrending24, 32: F.dataTrending32, 48: F.dataTrending48 }),
  'area.settings': e('Settings', 'Settings', { 20: F.settings20, 24: F.settings24, 32: F.settings32, 48: F.settings48 }),
  // Workspace rail areas (the live app's sidebar groups)
  'area.access': e('Roles and access', 'PersonKey', { 20: F.personKey20, 24: F.personKey24, 32: F.personKey32 }),
  'area.security': e('Security', 'ShieldCheckmark', { 20: F.shieldCheckmark20, 24: F.shieldCheckmark24, 48: F.shieldCheckmark48 }),
  'area.me': e('Me', 'Person', { 20: F.person20, 24: F.person24, 32: F.person32, 48: F.person48 }),
  // Home tiles, empty states, setup and help
  'leave': e('Leave', 'Beach', { 20: F.beach20, 24: F.beach24, 32: F.beach32, 48: F.beach48 }),
  'holidays': e('Holiday calendar', 'Calendar', { 20: F.calendar20, 24: F.calendar24, 32: F.calendar32, 48: F.calendar48 }),
  'approvals': e('Approvals', 'ApprovalsApp', { 20: F.approvalsApp20, 24: F.approvalsApp24, 32: F.approvalsApp32 }),
  'announcements': e('Announcements', 'MegaphoneLoud', { 20: F.megaphoneLoud20, 24: F.megaphoneLoud24, 32: F.megaphoneLoud32 }),
  'orgChart': e('Org chart', 'Org', { 20: F.org20, 24: F.org24, 32: F.org32, 48: F.org48 }),
  'documents': e('Documents', 'DocumentText', { 20: F.documentText20, 24: F.documentText24, 32: F.documentText32, 48: F.documentText48 }),
  'jobOpening': e('Job opening', 'Briefcase', { 20: F.briefcase20, 24: F.briefcase24, 32: F.briefcase32, 48: F.briefcase48 }),
  'allDone': e('All done', 'CheckmarkCircle', { 20: F.checkmarkCircle20, 24: F.checkmarkCircle24, 32: F.checkmarkCircle32, 48: F.checkmarkCircle48 }),
  'onboarding': e('Onboarding', 'PersonStarburst', { 20: F.personStarburst20, 24: F.personStarburst24, 32: F.personStarburst32, 48: F.personStarburst48 }),
  'setup': e('Setup hub', 'Toolbox', { 20: F.toolbox20, 24: F.toolbox24, 32: F.toolbox32 }),
  'help': e('Help', 'QuestionCircle', { 20: F.questionCircle20, 24: F.questionCircle24, 32: F.questionCircle32, 48: F.questionCircle48 }),
  // HR meanings Fluent has no icon for: founder-approved stand-ins (7 Oct 2026). standIn = composite brief sent to the designer.
  'payslip': e('Payslip', 'Receipt', { 20: F.receipt20, 24: F.receipt24, 32: F.receipt32 }, false, true),
  'attendancePunch': e('Attendance punch', 'Shifts', { 20: F.shifts20, 24: F.shifts24, 32: F.shifts32 }, false, true),
  'statutoryFiling': e('Statutory filing', 'BuildingGovernment', { 20: F.buildingGovernment20, 24: F.buildingGovernment24, 32: F.buildingGovernment32 }),
  'proctoring': e('Proctoring', 'ScanPerson', { 20: F.scanPerson20, 24: F.scanPerson24, 48: F.scanPerson48 }),
  'offerLetter': e('Offer letter', 'Mail', { 20: F.mail20, 24: F.mail24, 32: F.mail32, 48: F.mail48 }, false, true),
  'orgUnit': e('Org unit', 'Org', { 20: F.org20, 24: F.org24, 32: F.org32, 48: F.org48 }),
  'ruleBuilder': e('Rule builder', 'Options', { 20: F.options20, 24: F.options24, 32: F.options32, 48: F.options48 }),
  'workflow': e('Workflow', 'ApprovalsApp', { 20: F.approvalsApp20, 24: F.approvalsApp24, 32: F.approvalsApp32 }, false, true),
} satisfies Record<string, ColorIconEntry>;

export type ColorIconName = keyof typeof COLOR_ICONS;

const SIZES: ColorIconSize[] = [20, 24, 32, 48];

/** The drawing for a size: exact, else the nearest larger, else the largest there is. */
export function pickArt(art: ColorIconEntry['art'], size: ColorIconSize): string {
  const have = SIZES.filter((s) => art[s]);
  const s = have.find((h) => h >= size) ?? have[have.length - 1];
  return art[s] as string;
}

export interface ColorIconProps {
  name: ColorIconName;
  /** 20 nav · 24–32 tiles · 48 empty states. */
  size?: ColorIconSize;
  /** Only when the icon stands alone without a visible label (rare: labels are always visible, §8). */
  label?: string;
  /** Sit on a subtle neutral tile (used on dark surfaces and Home tiles). */
  tile?: boolean;
  className?: string;
}

export function ColorIcon({ name, size = 24, label, tile, className }: ColorIconProps) {
  const entry: ColorIconEntry = COLOR_ICONS[name];
  // An <img> keeps each icon's gradient ids private and needs no innerHTML.
  const src = `data:image/svg+xml,${encodeURIComponent(pickArt(entry.art, size))}`;
  return (
    <span
      className={cx('yx-color-icon', className)}
      data-size={size}
      data-tile={tile || undefined}
      data-dark-tile={entry.darkTile || undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <img src={src} alt="" draggable={false} />
    </span>
  );
}
