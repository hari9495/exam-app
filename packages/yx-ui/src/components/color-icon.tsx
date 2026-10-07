// Colour icons (§8): Fluent UI System Icons, Color variant (MIT, © Microsoft — see THIRD-PARTY-NOTICES.md).
// Big, friendly icons for areas, Home tiles, empty states, the setup hub and help. Everything small and dense
// stays on Lucide outline (<Icon>). Screens never import Fluent icons directly: add a meaning here, then use
// <ColorIcon name="area.people" />. One icon per meaning.
// Per-icon imports (`/svg/<name>`) so only the icons listed here reach the bundle.
import type { FluentIcon } from '@fluentui/react-icons';
import { ApprovalsApp20Color, ApprovalsApp24Color, ApprovalsApp32Color } from '@fluentui/react-icons/svg/approvals-app';
import { Beach20Color, Beach24Color, Beach32Color, Beach48Color } from '@fluentui/react-icons/svg/beach';
import { BookOpen20Color, BookOpen24Color, BookOpen32Color, BookOpen48Color } from '@fluentui/react-icons/svg/book-open';
import { Briefcase20Color, Briefcase24Color, Briefcase32Color, Briefcase48Color } from '@fluentui/react-icons/svg/briefcase';
import { Calendar20Color, Calendar24Color, Calendar32Color, Calendar48Color } from '@fluentui/react-icons/svg/calendar';
import { CalendarClock20Color, CalendarClock24Color } from '@fluentui/react-icons/svg/calendar-clock';
import { CheckmarkCircle20Color, CheckmarkCircle24Color, CheckmarkCircle32Color, CheckmarkCircle48Color } from '@fluentui/react-icons/svg/checkmark-circle';
import { ClipboardTextEdit20Color, ClipboardTextEdit24Color, ClipboardTextEdit32Color } from '@fluentui/react-icons/svg/clipboard-text-edit';
import { CoinMultiple20Color, CoinMultiple24Color, CoinMultiple32Color, CoinMultiple48Color } from '@fluentui/react-icons/svg/coin-multiple';
import { DataTrending20Color, DataTrending24Color, DataTrending32Color, DataTrending48Color } from '@fluentui/react-icons/svg/data-trending';
import { DocumentText20Color, DocumentText24Color, DocumentText32Color, DocumentText48Color } from '@fluentui/react-icons/svg/document-text';
import { Headset20Color, Headset24Color, Headset32Color, Headset48Color } from '@fluentui/react-icons/svg/headset';
import { Home20Color, Home24Color, Home32Color, Home48Color } from '@fluentui/react-icons/svg/home';
import { MegaphoneLoud20Color, MegaphoneLoud24Color, MegaphoneLoud32Color } from '@fluentui/react-icons/svg/megaphone-loud';
import { Org20Color, Org24Color, Org32Color, Org48Color } from '@fluentui/react-icons/svg/org';
import { People20Color, People24Color, People32Color, People48Color } from '@fluentui/react-icons/svg/people';
import { PersonAdd20Color, PersonAdd24Color, PersonAdd32Color, PersonAdd48Color } from '@fluentui/react-icons/svg/person-add';
import { PersonStarburst20Color, PersonStarburst24Color, PersonStarburst32Color, PersonStarburst48Color } from '@fluentui/react-icons/svg/person-starburst';
import { QuestionCircle20Color, QuestionCircle24Color, QuestionCircle32Color, QuestionCircle48Color } from '@fluentui/react-icons/svg/question-circle';
import { Settings20Color, Settings24Color, Settings32Color, Settings48Color } from '@fluentui/react-icons/svg/settings';
import { Toolbox20Color, Toolbox24Color, Toolbox32Color } from '@fluentui/react-icons/svg/toolbox';
import { Trophy20Color, Trophy24Color, Trophy32Color, Trophy48Color } from '@fluentui/react-icons/svg/trophy';
import { cx } from '../lib/cx';

export type ColorIconSize = 20 | 24 | 32 | 48;

export interface ColorIconEntry {
  /** What the icon means, in the product's words. */
  meaning: string;
  /** Fluent icon name, for the registry table and the notices file. */
  fluent: string;
  /** Hand-drawn art per size; a missing size scales the nearest drawing. */
  art: Partial<Record<ColorIconSize, FluentIcon>>;
  /** Too dark for dark surfaces (measured, §8): sits on a light neutral tile in dark mode. */
  darkTile?: boolean;
}

const e = (meaning: string, fluent: string, art: ColorIconEntry['art'], darkTile?: boolean): ColorIconEntry => ({ meaning, fluent, art, darkTile });

/** The icon registry: one meaning → one icon. Add here, never ad hoc in a screen. */
export const COLOR_ICONS = {
  // Navigation areas (rail, 20 px)
  'area.home': e('Home', 'Home', { 20: Home20Color, 24: Home24Color, 32: Home32Color, 48: Home48Color }),
  'area.people': e('People', 'People', { 20: People20Color, 24: People24Color, 32: People32Color, 48: People48Color }),
  'area.time': e('Time and leave', 'CalendarClock', { 20: CalendarClock20Color, 24: CalendarClock24Color }),
  'area.payroll': e('Payroll', 'CoinMultiple', { 20: CoinMultiple20Color, 24: CoinMultiple24Color, 32: CoinMultiple32Color, 48: CoinMultiple48Color }),
  'area.hiring': e('Hiring', 'PersonAdd', { 20: PersonAdd20Color, 24: PersonAdd24Color, 32: PersonAdd32Color, 48: PersonAdd48Color }),
  'area.assessments': e('Assessments', 'ClipboardTextEdit', { 20: ClipboardTextEdit20Color, 24: ClipboardTextEdit24Color, 32: ClipboardTextEdit32Color }),
  'area.serviceDesk': e('Service desk', 'Headset', { 20: Headset20Color, 24: Headset24Color, 32: Headset32Color, 48: Headset48Color }, true),
  'area.performance': e('Performance', 'Trophy', { 20: Trophy20Color, 24: Trophy24Color, 32: Trophy32Color, 48: Trophy48Color }),
  'area.learning': e('Learning', 'BookOpen', { 20: BookOpen20Color, 24: BookOpen24Color, 32: BookOpen32Color, 48: BookOpen48Color }),
  'area.analytics': e('Analytics', 'DataTrending', { 20: DataTrending20Color, 24: DataTrending24Color, 32: DataTrending32Color, 48: DataTrending48Color }),
  'area.settings': e('Settings', 'Settings', { 20: Settings20Color, 24: Settings24Color, 32: Settings32Color, 48: Settings48Color }),
  // Home tiles, empty states, setup and help
  'leave': e('Leave', 'Beach', { 20: Beach20Color, 24: Beach24Color, 32: Beach32Color, 48: Beach48Color }),
  'holidays': e('Holiday calendar', 'Calendar', { 20: Calendar20Color, 24: Calendar24Color, 32: Calendar32Color, 48: Calendar48Color }),
  'approvals': e('Approvals', 'ApprovalsApp', { 20: ApprovalsApp20Color, 24: ApprovalsApp24Color, 32: ApprovalsApp32Color }),
  'announcements': e('Announcements', 'MegaphoneLoud', { 20: MegaphoneLoud20Color, 24: MegaphoneLoud24Color, 32: MegaphoneLoud32Color }),
  'orgChart': e('Org chart', 'Org', { 20: Org20Color, 24: Org24Color, 32: Org32Color, 48: Org48Color }),
  'documents': e('Documents', 'DocumentText', { 20: DocumentText20Color, 24: DocumentText24Color, 32: DocumentText32Color, 48: DocumentText48Color }),
  'jobOpening': e('Job opening', 'Briefcase', { 20: Briefcase20Color, 24: Briefcase24Color, 32: Briefcase32Color, 48: Briefcase48Color }),
  'allDone': e('All done', 'CheckmarkCircle', { 20: CheckmarkCircle20Color, 24: CheckmarkCircle24Color, 32: CheckmarkCircle32Color, 48: CheckmarkCircle48Color }),
  'onboarding': e('Onboarding', 'PersonStarburst', { 20: PersonStarburst20Color, 24: PersonStarburst24Color, 32: PersonStarburst32Color, 48: PersonStarburst48Color }),
  'setup': e('Setup hub', 'Toolbox', { 20: Toolbox20Color, 24: Toolbox24Color, 32: Toolbox32Color }),
  'help': e('Help', 'QuestionCircle', { 20: QuestionCircle20Color, 24: QuestionCircle24Color, 32: QuestionCircle32Color, 48: QuestionCircle48Color }),
} satisfies Record<string, ColorIconEntry>;

export type ColorIconName = keyof typeof COLOR_ICONS;

/** HR meanings Fluent Color does not cover: commissioned from the brand designer in the same style (§8). */
export const COLOR_ICONS_TO_COMMISSION = [
  'Payslip',
  'Attendance punch',
  'Statutory filing',
  'Proctoring',
  'Offer letter',
  'Org unit',
  'Rule builder',
  'Workflow',
] as const;

const SIZES: ColorIconSize[] = [20, 24, 32, 48];

/** The drawing for a size: exact, else the nearest larger, else the largest there is. */
export function pickArt(art: ColorIconEntry['art'], size: ColorIconSize): FluentIcon {
  const have = SIZES.filter((s) => art[s]);
  const s = have.find((h) => h >= size) ?? have[have.length - 1];
  return art[s] as FluentIcon;
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
  const Art = pickArt(entry.art, size);
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
      <Art focusable="false" aria-hidden />
    </span>
  );
}
