import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import * as RD from '@radix-ui/react-dialog';
import * as DM from '@radix-ui/react-dropdown-menu';
import * as RT from '@radix-ui/react-tabs';
import { Command } from 'cmdk';
import {
  Briefcase,
  ChartColumn,
  Check,
  ChevronDown,
  Lock as LockIcon,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  ClipboardCheck,
  Clock,
  Copy,
  GraduationCap,
  House,
  Inbox,
  LifeBuoy,
  LogOut,
  Menu as MenuIcon,
  MoreHorizontal,
  PanelLeftClose,
  Search,
  Settings,
  SlidersHorizontal,
  Target,
  User,
  Users,
  Wallet,
  X,
  MessageCircleQuestionMark,
} from 'lucide-react';
import { cx } from '../lib/cx';
import { Heading, Icon, Kbd, type IconComponent } from './foundations';
import { Button, IconButton } from './button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './menu';
import { Tooltip } from './tooltip';
import { Avatar, Tag } from './display';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Select, type SelectProps } from './select';
import { useFieldControl } from './field';

/* ------------------------------------------------------------------ helpers */

function useControlled<T>(value: T | undefined, initial: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [inner, setInner] = useState(initial);
  const controlled = value !== undefined;
  const set = useCallback(
    (v: T) => {
      if (!controlled) setInner(v);
      onChange?.(v);
    },
    [controlled, onChange],
  );
  return [controlled ? value : inner, set];
}

/** Below this the side panel folds away and opens as a slide-over sheet (phone and tablet). */
const MOBILE_QUERY = '(max-width: 1199px)';

/* Resizable side panel (founder review 30 Sep 2026): drag, arrow keys, double-click to reset; remembered per browser. */
const PANEL_DEFAULT = 240;
const PANEL_MIN = 200;
const PANEL_MAX = 420;
/** Dragging narrower than this collapses the panel to the rail. */
const PANEL_COLLAPSE_AT = 150;
const PANEL_STORE = 'yx-panel-width';
const clampPanel = (w: number) => Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(w)));
function readPanelWidth() {
  try {
    const v = Number(window.localStorage.getItem(PANEL_STORE));
    return v ? clampPanel(v) : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}
function savePanelWidth(w: number) {
  try {
    window.localStorage.setItem(PANEL_STORE, String(w));
  } catch {
    /* private window: width just isn't remembered */
  }
}

/** "⋯" menu: icon-only trigger with tooltip. */
function OverflowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Menu>
      <Tooltip content={label}>
        <MenuTrigger asChild>
          <IconButton icon={MoreHorizontal} label={label} noTooltip />
        </MenuTrigger>
      </Tooltip>
      <MenuContent align="end">{children}</MenuContent>
    </Menu>
  );
}

/* ------------------------------------------------------------------ AppShell (§12, §37) */

interface ShellContextValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /** Desktop: expand the panel. Mobile: open it as a slide-in sheet. */
  openNav: () => void;
  closeSheet?: () => void;
}
const ShellContext = createContext<ShellContextValue | null>(null);

export interface AppShellProps {
  /** <SideRail>. */
  rail: ReactNode;
  /** <SidePanel> for the selected area. */
  panel?: ReactNode;
  /** <TopBar>. */
  topBar: ReactNode;
  /** <MobileTabBar>, shown below 768 px instead of the rail and panel. */
  mobileTabBar?: ReactNode;
  children: ReactNode;
  /** Panel collapsed to rail-only. Store it per user and pass it back (§12). */
  panelCollapsed?: boolean;
  defaultPanelCollapsed?: boolean;
  onPanelCollapsedChange?: (collapsed: boolean) => void;
  /** Start with the mobile navigation sheet open (docs and screenshot tests). */
  defaultNavOpen?: boolean;
  /** id of the main region, target of the skip link. */
  mainId?: string;
}

/** Two-tier layout: 56 px rail + 240 px panel + top bar and content (§12). Bottom tabs on mobile (§37). */
export function AppShell({
  rail,
  panel,
  topBar,
  mobileTabBar,
  children,
  panelCollapsed,
  defaultPanelCollapsed = false,
  onPanelCollapsedChange,
  defaultNavOpen = false,
  mainId = 'yx-main',
}: AppShellProps) {
  const [collapsed, setCollapsed] = useControlled(panelCollapsed, defaultPanelCollapsed, onPanelCollapsedChange);
  const [sheetOpen, setSheetOpen] = useState(defaultNavOpen);
  const ctx = useMemo<ShellContextValue>(
    () => ({
      collapsed,
      setCollapsed,
      openNav: () => {
        if (typeof window !== 'undefined' && window.matchMedia?.(MOBILE_QUERY).matches) setSheetOpen(true);
        else setCollapsed(false);
      },
    }),
    [collapsed, setCollapsed],
  );
  const sheetCtx = useMemo<ShellContextValue>(() => ({ ...ctx, closeSheet: () => setSheetOpen(false) }), [ctx]);
  const hasPanel = panel != null;
  const [panelWidth, setPanelWidthState] = useState(() => (typeof window === 'undefined' ? PANEL_DEFAULT : readPanelWidth()));
  const [dragging, setDragging] = useState(false);
  const setPanelWidth = (w: number) => {
    setPanelWidthState(w);
    savePanelWidth(w);
  };
  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => setPanelWidthState(clampPanel(startW + ev.clientX - startX));
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setDragging(false);
      const raw = startW + ev.clientX - startX;
      if (raw < PANEL_COLLAPSE_AT) {
        setPanelWidthState(startW);
        setCollapsed(true);
      } else setPanelWidth(clampPanel(raw));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const onResizeKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    const next = { ArrowLeft: panelWidth - step, ArrowRight: panelWidth + step, Home: PANEL_MIN, End: PANEL_MAX }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setPanelWidth(clampPanel(next));
  };

  return (
    <ShellContext.Provider value={ctx}>
      <div
        className="yx-shell"
        data-panel={!hasPanel ? 'none' : collapsed ? 'collapsed' : 'open'}
        data-resizing={dragging || undefined}
        style={{ '--yx-shell-panel': `${panelWidth}px` } as CSSProperties}
      >
        <a className="yx-shell__skip" href={`#${mainId}`}>
          Skip to content
        </a>
        <div className="yx-shell__rail">{rail}</div>
        {hasPanel && (
          <div className="yx-shell__panel" hidden={collapsed}>
            {panel}
            <div
              className="yx-shell__resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side panel. Drag, or use the arrow keys. Double-click to reset."
              aria-valuemin={PANEL_MIN}
              aria-valuemax={PANEL_MAX}
              aria-valuenow={panelWidth}
              tabIndex={0}
              onPointerDown={onResizeStart}
              onKeyDown={onResizeKey}
              onDoubleClick={() => setPanelWidth(PANEL_DEFAULT)}
            />
          </div>
        )}
        <div className="yx-shell__main">
          {topBar}
          <main id={mainId} tabIndex={-1} className="yx-shell__content">
            {children}
          </main>
        </div>
        {mobileTabBar && <div className="yx-shell__tabs">{mobileTabBar}</div>}
        {hasPanel && (
          <RD.Root open={sheetOpen} onOpenChange={setSheetOpen}>
            <RD.Portal>
              <RD.Overlay className="yx-shell__scrim" />
              <RD.Content
                className="yx-shell__sheet"
                aria-describedby={undefined}
                tabIndex={-1}
                // Focus the sheet, not the Close button, so its tooltip doesn't pop up on open.
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).focus();
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.yx-panel__link')) setSheetOpen(false);
                }}
              >
                <RD.Title className="yx-visually-hidden">Navigation</RD.Title>
                <ShellContext.Provider value={sheetCtx}>{panel}</ShellContext.Provider>
              </RD.Content>
            </RD.Portal>
          </RD.Root>
        )}
      </div>
    </ShellContext.Provider>
  );
}

/* ------------------------------------------------------------------ SideRail */

export interface RailItem {
  id: string;
  label: string;
  icon: IconComponent;
  href?: string;
  /** Settings sits at the bottom of the rail. */
  pinBottom?: boolean;
  /** Shorter name under the icon when the full one doesn't fit, e.g. "Contract" for "Contract labour". */
  short?: string;
}

/** Every area, in order (§12). Filter by role before passing to <SideRail items>. */
export const RAIL_ITEMS: RailItem[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'people', label: 'People', icon: Users },
  { id: 'time', label: 'Time', icon: Clock },
  { id: 'pay', label: 'Pay', icon: Wallet },
  { id: 'hire', label: 'Hire', icon: Briefcase },
  { id: 'assess', label: 'Assess', icon: ClipboardCheck },
  { id: 'performance', label: 'Performance', icon: Target },
  { id: 'learning', label: 'Learning', icon: GraduationCap },
  { id: 'helpdesk', label: 'Helpdesk', icon: LifeBuoy },
  { id: 'analytics', label: 'Analytics', icon: ChartColumn },
  { id: 'settings', label: 'Settings', icon: Settings, pinBottom: true },
];

export interface SideRailProps {
  /** Only the areas this role can see. */
  items: RailItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** X monogram (from the designer's files, §1). */
  logo?: ReactNode;
  'aria-label'?: string;
}

/** 80 px product rail with a name under every icon (founder review 30 Sep 2026). Arrow keys move between areas (roving tabindex). */
export function SideRail({ items, activeId, onSelect, logo, 'aria-label': ariaLabel = 'Areas' }: SideRailProps) {
  const ordered = [...items.filter((i) => !i.pinBottom), ...items.filter((i) => i.pinBottom)];
  const activeIndex = Math.max(0, ordered.findIndex((i) => i.id === activeId));
  const [focusIndex, setFocusIndex] = useState(activeIndex);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => setFocusIndex(activeIndex), [activeIndex]);

  const onKeyDown = (e: KeyboardEvent) => {
    const last = ordered.length - 1;
    const next =
      e.key === 'ArrowDown' ? (focusIndex >= last ? 0 : focusIndex + 1)
      : e.key === 'ArrowUp' ? (focusIndex <= 0 ? last : focusIndex - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next == null) return;
    e.preventDefault();
    setFocusIndex(next);
    refs.current[next]?.focus();
  };

  const renderItem = (item: RailItem, i: number) => {
    const active = item.id === activeId;
    const common = {
      ref: (el: HTMLElement | null) => {
        refs.current[i] = el;
      },
      className: 'yx-rail__item',
      'aria-label': item.label,
      'aria-current': active ? ('page' as const) : undefined,
      'data-active': active || undefined,
      tabIndex: i === focusIndex ? 0 : -1,
      onFocus: () => setFocusIndex(i),
      onClick: () => onSelect?.(item.id),
    };
    return (
      <li key={item.id} data-pin={item.pinBottom || undefined}>
        {item.href ? (
          <a href={item.href} {...common}>
            <Icon icon={item.icon} size="md" />
            <span className="yx-rail__label" aria-hidden="true">{item.short ?? item.label}</span>
          </a>
        ) : (
          <button type="button" {...common}>
            <Icon icon={item.icon} size="md" />
            <span className="yx-rail__label" aria-hidden="true">{item.short ?? item.label}</span>
          </button>
        )}
      </li>
    );
  };

  return (
    <nav className="yx-rail" aria-label={ariaLabel}>
      {logo && <div className="yx-rail__logo">{logo}</div>}
      <ul className="yx-rail__list" onKeyDown={onKeyDown}>
        {ordered.map(renderItem)}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ SidePanel */

export interface SidePanelProps {
  /** Area name, e.g. "People". */
  title: ReactNode;
  children: ReactNode;
}

/** 240 px panel with the pages of the selected area (§12). Collapses to rail-only inside <AppShell>. */
export function SidePanel({ title, children }: SidePanelProps) {
  const shell = useContext(ShellContext);
  return (
    <nav className="yx-panel" aria-label={typeof title === 'string' ? title : 'Pages'}>
      <div className="yx-panel__head">
        <Heading level={3} as="h2" className="yx-panel__title">
          {title}
        </Heading>
        {shell?.closeSheet ? (
          <IconButton icon={X} label="Close navigation" onClick={shell.closeSheet} />
        ) : (
          shell && <IconButton icon={PanelLeftClose} label="Collapse panel" className="yx-panel__collapse" onClick={() => shell.setCollapsed(true)} />
        )}
      </div>
      <div className="yx-panel__body">{children}</div>
    </nav>
  );
}

/** A labelled group of links, e.g. "Favourites", "Saved views", "Records". Omit label for the first group. */
export function PanelGroup({ label, children }: { label?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <div className="yx-panel__group" role="group" aria-labelledby={label ? id : undefined}>
      {label && (
        <div className="yx-panel__group-label" id={id}>
          {label}
        </div>
      )}
      <ul className="yx-panel__list">{children}</ul>
    </div>
  );
}

export interface PanelLinkProps extends Omit<HTMLAttributes<HTMLAnchorElement>, 'children'> {
  href?: string;
  active?: boolean;
  icon?: IconComponent;
  /** Counter, e.g. Approvals 12. */
  count?: number;
  children: ReactNode;
}

export function PanelLink({ href, active, icon, count, children, className, ...rest }: PanelLinkProps) {
  return (
    <li>
      <a
        href={href ?? '#'}
        className={cx('yx-panel__link', className)}
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
        {...rest}
      >
        {icon && <Icon icon={icon} />}
        <span className="yx-panel__text">{children}</span>
        {count != null && count > 0 && <>{' '}<span className="yx-panel__count">{count}</span></>}
      </a>
    </li>
  );
}

/* ------------------------------------------------------------------ TopBar */

export interface TopBarProps {
  /** Before the search, e.g. the logo and company on pages without a command palette. */
  start?: ReactNode;
  /** Opens the command palette. The search button shows only with it. */
  onSearch?: () => void;
  searchText?: string;
  /** Shortcut hint; "⌘ K" on Mac. */
  shortcut?: string;
  /** Legal entity switcher, usually <EntityPicker size="sm">. */
  entity?: ReactNode;
  /** Opens the AI assistant panel (§45). Shown as a round button in the bottom-right corner, not in the bar. */
  onAsk?: () => void;
  /** Notification bell. */
  notifications?: ReactNode;
  onHelp?: () => void;
  /** <ProfileMenu>. */
  profile?: ReactNode;
}

export function TopBar({
  start,
  onSearch,
  searchText = 'Search people, requests, actions',
  shortcut = 'Ctrl K',
  entity,
  onAsk,
  notifications,
  onHelp,
  profile,
}: TopBarProps) {
  const shell = useContext(ShellContext);
  return (
    <header className="yx-topbar">
      {shell && <IconButton icon={MenuIcon} label="Open navigation" className="yx-topbar__menu" onClick={shell.openNav} />}
      {start}
      {/* Below 600 px the search collapses to its icon (the label stays as the accessible name). */}
      {onSearch && (
        <button type="button" className="yx-topbar__search" onClick={onSearch} aria-haspopup="dialog" aria-label={searchText}>
          <Icon icon={Search} />
          <span className="yx-topbar__search-text" aria-hidden="true">{searchText}</span>
          <span className="yx-topbar__kbd">
            <Kbd>{shortcut}</Kbd>
          </span>
        </button>
      )}
      <div className="yx-topbar__end">
        {entity && <div className="yx-topbar__entity">{entity}</div>}
        {/* Ask AI sits in the bar with the other tools, never floating over the page (R8). */}
        {onAsk && <IconButton icon={MessageCircleQuestionMark} label="Ask AI" variant="secondary" className="yx-ask-fab" onClick={onAsk} />}
        {notifications}
        {onHelp && <IconButton icon={CircleHelp} label="Help" onClick={onHelp} />}
        {profile}
      </div>
    </header>
  );
}

export type ThemeChoice = 'light' | 'dark' | 'system';
export type DensityChoice = 'comfortable' | 'compact';

export interface ProfileMenuProps {
  name: string;
  email?: string;
  photoUrl?: string | null;
  onProfile?: () => void;
  onPreferences?: () => void;
  onSignOut?: () => void;
  theme?: ThemeChoice;
  onThemeChange?: (t: ThemeChoice) => void;
  density?: DensityChoice;
  onDensityChange?: (d: DensityChoice) => void;
  defaultOpen?: boolean;
}

function RadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <DM.RadioItem value={value} className="yx-menu__item">
      <span className="yx-menu__check">
        <DM.ItemIndicator>
          <Icon icon={Check} />
        </DM.ItemIndicator>
      </span>
      <span className="yx-menu__text">{children}</span>
    </DM.RadioItem>
  );
}

/** Avatar menu in the top bar: profile, preferences, density, theme, sign out. */
export function ProfileMenu({
  name,
  email,
  photoUrl,
  onProfile,
  onPreferences,
  onSignOut,
  theme,
  onThemeChange,
  density,
  onDensityChange,
  defaultOpen,
}: ProfileMenuProps) {
  return (
    <Menu defaultOpen={defaultOpen} modal={false}>
      <MenuTrigger className="yx-topbar__profile" aria-label={`Account menu for ${name}`}>
        <Avatar name={name} src={photoUrl} size={32} />
      </MenuTrigger>
      <MenuContent align="end">
        <div className="yx-profile-menu__who">
          <span className="yx-profile-menu__name">{name}</span>
          {email && <span className="yx-profile-menu__email">{email}</span>}
        </div>
        <MenuSeparator />
        <MenuItem icon={User} onSelect={onProfile}>
          My profile
        </MenuItem>
        <MenuItem icon={SlidersHorizontal} onSelect={onPreferences}>
          Preferences
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Density</MenuLabel>
        <DM.RadioGroup value={density} onValueChange={(v) => onDensityChange?.(v as DensityChoice)}>
          <RadioItem value="comfortable">Comfortable</RadioItem>
          <RadioItem value="compact">Compact</RadioItem>
        </DM.RadioGroup>
        <MenuSeparator />
        <MenuLabel>Theme</MenuLabel>
        <DM.RadioGroup value={theme} onValueChange={(v) => onThemeChange?.(v as ThemeChoice)}>
          <RadioItem value="light">Light</RadioItem>
          <RadioItem value="dark">Dark</RadioItem>
          <RadioItem value="system">Same as system</RadioItem>
        </DM.RadioGroup>
        <MenuSeparator />
        <MenuItem icon={LogOut} onSelect={onSignOut}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/* ------------------------------------------------------------------ CommandPalette (§30) */

export interface PaletteItem {
  id: string;
  label: string;
  /** Role and department, request dates, the settings path… */
  secondary?: string;
  icon?: IconComponent;
  /** e.g. "G P". */
  shortcut?: string;
  /** Extra words that should match (employee ID, email). */
  keywords?: string[];
}

export interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
  /** Shown only before the user types (recent items). */
  recent?: boolean;
  /** Search scope this group answers (APX-D PLT-20): @ people · # references · > actions · ? help and settings. */
  prefix?: PalettePrefix;
}

export type PalettePrefix = '@' | '#' | '>' | '?';
const PREFIX_LABEL: Record<PalettePrefix, string> = { '@': 'People', '#': 'References', '>': 'Actions', '?': 'Help and settings' };

export interface CommandPaletteProps {
  groups: PaletteGroup[];
  onSelect: (item: PaletteItem) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  /** Start with this search text (docs and screenshot tests). */
  defaultSearch?: string;
  /** No results: "Search everything for …" opens the full results page. */
  onSearchAll?: (query: string) => void;
  /** No results: hand the question to the assistant. */
  onAsk?: (query: string) => void;
  /** Recent items are cleared (shared and kiosk computers). */
  onClearRecent?: () => void;
}

/** Global search and actions, opened with Ctrl/Cmd+K (see useCommandPaletteShortcut). */
export function CommandPalette({
  groups,
  onSelect,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  placeholder = 'Search people, requests, actions',
  defaultSearch = '',
  onSearchAll,
  onAsk,
  onClearRecent,
}: CommandPaletteProps) {
  const [open, setOpen] = useControlled(openProp, defaultOpen, onOpenChange);
  const [q, setQ] = useState(defaultSearch);
  const [recentCleared, setRecentCleared] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  // Prefix scopes: only when groups declare them (otherwise the text is searched as typed).
  const scoped = groups.some((g) => g.prefix);
  const first = q.trimStart()[0] as PalettePrefix | undefined;
  const scope = scoped && first && first in PREFIX_LABEL ? first : null;
  // Own filtering so an empty result can be a plain message instead of an empty listbox (a11y).
  const term = (scope ? q.trimStart().slice(1) : q).trim().toLowerCase();
  // Each result once (founder review 30 Sep 2026): something in Recent isn't repeated in a later group.
  const seen = new Set<string>();
  const shown = groups
    .filter((g) => !scope || g.prefix === scope)
    .filter((g) => !(g.recent && (term || scope || recentCleared)))
    .map((g) => ({
      ...g,
      items: (term
        ? g.items.filter((it) => [it.label, it.secondary ?? '', ...(it.keywords ?? [])].some((t) => t.toLowerCase().includes(term)))
        : g.items
      ).filter((it) => {
        const key = `${it.label}|${it.secondary ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }))
    .filter((g) => g.items.length > 0);
  const showingRecent = shown.some((g) => g.recent);

  return (
    <RD.Root open={open} onOpenChange={setOpen}>
      <RD.Portal>
        <RD.Overlay className="yx-palette__scrim" />
        <RD.Content
          className="yx-palette"
          aria-describedby={undefined}
          // Focus the search box with the cursor after the text; Radix would select it all and the next key would wipe it.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const el = inputRef.current;
            if (el) {
              el.focus();
              el.setSelectionRange(el.value.length, el.value.length);
            }
          }}
        >
          <RD.Title className="yx-visually-hidden">Search and actions</RD.Title>
          <Command label="Search and actions" loop shouldFilter={false}>
            <div className="yx-palette__search">
              <Icon icon={Search} size="md" />
              <Command.Input ref={inputRef} value={q} onValueChange={setQ} placeholder={placeholder} aria-label={placeholder} />
            </div>
            {scoped && (
              <div className="yx-palette__scopes" role="group" aria-label="Search in">
                {scope ? (
                  <Tag onRemove={() => setQ(q.trimStart().slice(1).trimStart())} removeLabel="Search everything">
                    Searching {PREFIX_LABEL[scope].toLowerCase()}
                  </Tag>
                ) : (
                  (Object.keys(PREFIX_LABEL) as PalettePrefix[]).map((p) => (
                    <Button key={p} size="sm" onClick={() => setQ(`${p}${q.trimStart()}`)}>
                      <span className="yx-mono" aria-hidden="true">{p}</span> {PREFIX_LABEL[p]}
                    </Button>
                  ))
                )}
                {showingRecent && (
                  <Button
                    size="sm"
                    className="yx-palette__clear"
                    onClick={() => {
                      setRecentCleared(true);
                      onClearRecent?.();
                    }}
                  >
                    Clear recent
                  </Button>
                )}
              </div>
            )}
            {shown.length === 0 && (
              <div className="yx-palette__empty">
                <p role="status">No results for “{q.trim()}”. Check the spelling or try a name, employee ID or action.</p>
                {(onSearchAll || onAsk) && q.trim() && (
                  <div className="yx-palette__empty-actions">
                    {onSearchAll && (
                      <Button size="sm" icon={Search} onClick={() => onSearchAll(q.trim())}>
                        Search everything for “{q.trim()}”
                      </Button>
                    )}
                    {onAsk && (
                      <Button size="sm" icon={MessageCircleQuestionMark} onClick={() => onAsk(q.trim())}>
                        Ask AI
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Kept in the page (hidden when empty) so the search box's aria-controls stays valid. */}
            <Command.List className="yx-palette__list" hidden={shown.length === 0}>
              {shown.map((g) => (
                  <Command.Group key={g.heading} heading={g.heading} className="yx-palette__group">
                    {g.items.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${g.heading}/${item.id}`}
                        keywords={[item.label, item.secondary ?? '', ...(item.keywords ?? [])]}
                        onSelect={() => {
                          onSelect(item);
                          setOpen(false);
                        }}
                        className="yx-palette__item"
                      >
                        {item.icon && <Icon icon={item.icon} />}
                        <span className="yx-palette__label">{item.label}</span>
                        {item.secondary && <span className="yx-palette__secondary">{item.secondary}</span>}
                        {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
            </Command.List>
            <div className="yx-palette__foot" aria-hidden="true">
              <span>
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
              </span>
              <span>
                <Kbd>Enter</Kbd> to open
              </span>
              <span>
                <Kbd>Esc</Kbd> to close
              </span>
            </div>
          </Command>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/**
 * Two-key shortcuts such as "N L" (new leave) or "N E" (new expense), shown next to palette actions.
 * Ignored while typing in a field; the second key must follow within 1.5 seconds.
 */
export function useKeySequences(map: Record<string, () => void>) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    let first: string | null = null;
    let at = 0;
    const handler = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      const k = e.key.toUpperCase();
      if (first && Date.now() - at < 1500) {
        const fn = ref.current[`${first} ${k}`];
        first = null;
        if (fn) {
          e.preventDefault();
          fn();
          return;
        }
      }
      first = k;
      at = Date.now();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

/** Calls `onToggle` on Ctrl+K / Cmd+K anywhere on the page. */
export function useCommandPaletteShortcut(onToggle: () => void) {
  const ref = useRef(onToggle);
  ref.current = onToggle;
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

/* ------------------------------------------------------------------ Breadcrumbs */

export interface Crumb {
  label: string;
  href?: string;
}

/** Deep pages only (object → sub-object, §12). Last item is the current page. More than 4 collapses the middle into "…". */
export function Breadcrumbs({ items, max = 4 }: { items: Crumb[]; max?: number }) {
  const collapse = items.length > max;
  const head = collapse ? items.slice(0, 1) : items.slice(0, -1);
  const hidden = collapse ? items.slice(1, -2) : [];
  const tail = collapse ? items.slice(-2, -1) : [];
  const current = items[items.length - 1];
  const link = (c: Crumb) => (
    <li key={`${c.label}-${c.href}`} className="yx-crumbs__item">
      <a className="yx-crumbs__link" href={c.href}>
        {c.label}
      </a>
      <Icon icon={ChevronRight} className="yx-crumbs__sep" />
    </li>
  );
  if (!current) return null;
  return (
    <nav className="yx-crumbs" aria-label="Breadcrumb">
      <ol className="yx-crumbs__list">
        {head.map(link)}
        {collapse && (
          <li className="yx-crumbs__item">
            <Menu>
              <Tooltip content={`Show ${hidden.length} more`}>
                <MenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} label={`Show ${hidden.length} more pages`} size="sm" noTooltip />
                </MenuTrigger>
              </Tooltip>
              <MenuContent align="start">
                {hidden.map((c) => (
                  <DM.Item key={`${c.label}-${c.href}`} asChild className="yx-menu__item">
                    <a href={c.href}>{c.label}</a>
                  </DM.Item>
                ))}
              </MenuContent>
            </Menu>
            <Icon icon={ChevronRight} className="yx-crumbs__sep" />
          </li>
        )}
        {tail.map(link)}
        <li className="yx-crumbs__item">
          <span className="yx-crumbs__current" aria-current="page">
            {current.label}
          </span>
        </li>
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------ Tabs */

/** Radix tabs. Keep `value` in the URL (`/…/{id}/{tab}`, §10) via value / onValueChange. */
export const Tabs = forwardRef<ElementRef<typeof RT.Root>, ComponentPropsWithoutRef<typeof RT.Root>>(function Tabs(
  { className, ...rest },
  ref,
) {
  return <RT.Root ref={ref} className={cx('yx-tabs', className)} {...rest} />;
});

/**
 * When the tab row scrolls sideways (phones), the side that has more tabs fades out (`data-more`), so a cut-off label
 * reads as "more this way"; the active tab is kept in view (see TabsTrigger).
 */
export const TabsList = forwardRef<ElementRef<typeof RT.List>, ComponentPropsWithoutRef<typeof RT.List>>(function TabsList(
  { className, onScroll, ...rest },
  ref,
) {
  const local = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState<'start' | 'end' | 'both' | undefined>(undefined);
  const measure = () => {
    const el = local.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore(start && end ? 'both' : start ? 'start' : end ? 'end' : undefined);
  };
  useEffect(() => {
    measure();
    const el = local.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <RT.List
      ref={(n) => {
        local.current = n;
        if (typeof ref === 'function') ref(n);
        else if (ref) ref.current = n;
      }}
      className={cx('yx-tabs__list', className)}
      data-more={more}
      onScroll={(e) => {
        measure();
        onScroll?.(e);
      }}
      {...rest}
    />
  );
});

export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof RT.Trigger> {
  /** Shown after the label, e.g. Documents 4. */
  count?: number;
}

export const TabsTrigger = forwardRef<ElementRef<typeof RT.Trigger>, TabsTriggerProps>(function TabsTrigger(
  { className, count, children, ...rest },
  ref,
) {
  const local = useRef<HTMLButtonElement | null>(null);
  // Keep the active tab in view when the row scrolls sideways: on mount and whenever it becomes active.
  // Only the tab row scrolls (scrollLeft), never the page.
  useEffect(() => {
    const el = local.current;
    const list = el?.parentElement;
    if (!el || !list || el.dataset.state !== 'active' || list.scrollWidth <= list.clientWidth) return;
    const r = el.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    const left = r.left - box.left + list.scrollLeft;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (left + r.width > list.scrollLeft + list.clientWidth) list.scrollLeft = left + r.width - list.clientWidth;
  });
  return (
    <RT.Trigger
      ref={(n) => {
        local.current = n;
        if (typeof ref === 'function') ref(n);
        else if (ref) ref.current = n;
      }}
      className={cx('yx-tabs__trigger', className)}
      {...rest}
    >
      {children}
      {count != null && <>{' '}<span className="yx-tabs__count">{count}</span></>}
    </RT.Trigger>
  );
});

export const TabsContent = forwardRef<ElementRef<typeof RT.Content>, ComponentPropsWithoutRef<typeof RT.Content>>(function TabsContent(
  { className, ...rest },
  ref,
) {
  return <RT.Content ref={ref} className={cx('yx-tabs__content', className)} {...rest} />;
});

/* ------------------------------------------------------------------ PageHeader, ObjectHeader (§11, §13) */

export interface PageHeaderProps {
  /** The one 22 px page title (h1). */
  title: ReactNode;
  description?: ReactNode;
  /** <Breadcrumbs> on deep pages only. */
  breadcrumbs?: ReactNode;
  /** Status <Badge>. */
  status?: ReactNode;
  /** Short facts line, e.g. "248 people · 3 locations". */
  facts?: ReactNode;
  /** Secondary buttons first, then at most ONE primary on the right (§15). */
  actions?: ReactNode;
}

export function PageHeader({ title, description, breadcrumbs, status, facts, actions }: PageHeaderProps) {
  return (
    <header className="yx-page-header">
      {breadcrumbs}
      <div className="yx-page-header__row">
        <div className="yx-page-header__titles">
          <div className="yx-page-header__title-row">
            <Heading level={1}>{title}</Heading>
            {status}
          </div>
          {description && <p className="yx-page-header__desc">{description}</p>}
          {facts && <div className="yx-page-header__facts">{facts}</div>}
        </div>
        {actions && <div className="yx-page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}

export interface ObjectFact {
  label: string;
  value: ReactNode;
}

export interface ObjectHeaderProps {
  /** Name for the avatar's initials when the title is not just the name (e.g. "Kavya Reddy · onboarding"). */
  avatarName?: string;
  name: string;
  /** Role · department, or pay period. */
  secondary?: ReactNode;
  /** Person: photo url (or null for initials). Omit and pass `icon` for non-person objects. */
  photoUrl?: string | null;
  person?: boolean;
  icon?: IconComponent;
  /** Status badges, e.g. On probation, Notice period. */
  status?: ReactNode;
  /** 3–5 key facts, shown inline (§10). */
  facts?: ObjectFact[];
  /** 2–3 buttons; at most one primary. */
  actions?: ReactNode;
  /** <MenuItem>s for the "⋯" menu. */
  menu?: ReactNode;
  breadcrumbs?: ReactNode;
}

/** Header for an object page: person, pay run, job (§10, §13). */
export function ObjectHeader({ name, avatarName, secondary, photoUrl, person, icon, status, facts, actions, menu, breadcrumbs }: ObjectHeaderProps) {
  return (
    <header className="yx-object-header">
      {breadcrumbs}
      <div className="yx-object-header__row">
        {person || photoUrl !== undefined ? (
          <Avatar name={avatarName ?? name} src={photoUrl} size={64} />
        ) : (
          icon && (
            <span className="yx-object-header__icon">
              <Icon icon={icon} size="md" />
            </span>
          )
        )}
        <div className="yx-object-header__titles">
          <div className="yx-page-header__title-row">
            <Heading level={1}>{name}</Heading>
            {status && <span className="yx-object-header__status">{status}</span>}
          </div>
          {secondary && <p className="yx-page-header__desc">{secondary}</p>}
        </div>
        {(actions || menu) && (
          <div className="yx-page-header__actions">
            {actions}
            {menu && <OverflowMenu label="More actions">{menu}</OverflowMenu>}
          </div>
        )}
      </div>
      {facts && facts.length > 0 && (
        <dl className="yx-object-header__facts">
          {facts.map((f) => (
            <div key={f.label} className="yx-object-header__fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ MobileTabBar (§12, §37) */

export interface MobileTab {
  id: string;
  label: string;
  icon: IconComponent;
  href?: string;
}

export const MOBILE_TABS: MobileTab[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'time', label: 'Time', icon: Clock },
  { id: 'requests', label: 'Requests', icon: Inbox },
  { id: 'pay', label: 'Pay', icon: Wallet },
  { id: 'me', label: 'Me', icon: CircleUserRound },
];

export interface MobileTabBarProps {
  items?: MobileTab[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Counts per tab id, e.g. { requests: 3 }. */
  badges?: Partial<Record<string, number>>;
}

/** Bottom tabs on phones: Home · Time · Requests · Pay · Me. The rail's areas live under Me › More. */
export function MobileTabBar({ items = MOBILE_TABS, activeId, onSelect, badges = {} }: MobileTabBarProps) {
  return (
    <nav className="yx-mobile-tabs" aria-label="Main">
      <ul className="yx-mobile-tabs__list">
        {items.map((t) => {
          const active = t.id === activeId;
          const n = badges[t.id];
          const inner = (
            <>
              <span className="yx-mobile-tabs__icon">
                <Icon icon={t.icon} size="md" />
                {n != null && n > 0 && (
                  <span className="yx-mobile-tabs__badge" aria-hidden="true">
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </span>
              <span className="yx-mobile-tabs__label">{t.label}</span>
              {n != null && n > 0 && <span className="yx-visually-hidden">, {n} new</span>}
            </>
          );
          const common = {
            className: 'yx-mobile-tabs__item',
            'aria-current': active ? ('page' as const) : undefined,
            'data-active': active || undefined,
            onClick: () => onSelect?.(t.id),
          };
          return (
            <li key={t.id}>
              {t.href ? (
                <a href={t.href} {...common}>
                  {inner}
                </a>
              ) : (
                <button type="button" {...common}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ Card, DescriptionList */

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** Icon buttons or secondary buttons in the card head. */
  actions?: ReactNode;
  footer?: ReactNode;
}

/** Flat card with a hairline border (§5, §6). Use only when grouping genuinely helps (§11). */
export function Card({ title, actions, footer, children, className, ...rest }: CardProps) {
  const id = useId();
  return (
    <section className={cx('yx-card', className)} aria-labelledby={title ? id : undefined} {...rest}>
      {(title || actions) && (
        <div className="yx-card__head">
          {title && (
            <Heading level={3} id={id} className="yx-card__title">
              {title}
            </Heading>
          )}
          {actions && <div className="yx-card__actions">{actions}</div>}
        </div>
      )}
      <div className="yx-card__body">{children}</div>
      {footer && <div className="yx-card__foot">{footer}</div>}
    </section>
  );
}

export interface DescriptionItem {
  label: string;
  value: ReactNode;
  /** IDs and codes in Plex Mono. */
  mono?: boolean;
  /** Adds a copy button that copies this text. */
  copyValue?: string;
}

/** Key–value facts, 1 or 2 columns; always 1 column on phones. */
export function DescriptionList({ items, columns = 1 }: { items: DescriptionItem[]; columns?: 1 | 2 }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (item: DescriptionItem) => {
    try {
      await navigator.clipboard.writeText(item.copyValue!);
      setCopied(item.label);
    } catch {
      setCopied(null);
    }
  };
  return (
    <>
      <dl className="yx-dl" data-columns={columns}>
        {items.map((it) => (
          <div key={it.label} className="yx-dl__row">
            <dt className="yx-dl__label">{it.label}</dt>
            <dd className="yx-dl__value" data-mono={it.mono || undefined}>
              <span className="yx-dl__text">{it.value}</span>
              {it.copyValue && (
                <IconButton
                  icon={copied === it.label ? Check : Copy}
                  label={copied === it.label ? `${it.label} copied` : `Copy ${it.label}`}
                  size="sm"
                  onClick={() => copy(it)}
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
      <span className="yx-visually-hidden" aria-live="polite">
        {copied ? `${copied} copied` : ''}
      </span>
    </>
  );
}

/* ------------------------------------------------------------------ OrgUnitPicker, EntityPicker, LocationPicker (§16) */

export interface OrgUnit {
  id: string;
  name: string;
  children?: OrgUnit[];
}

interface UnitInfo {
  node: OrgUnit;
  parentId: string | null;
  path: string[];
}

function indexUnits(units: OrgUnit[]) {
  const map = new Map<string, UnitInfo>();
  const walk = (list: OrgUnit[], parentId: string | null, path: string[]) => {
    for (const u of list) {
      map.set(u.id, { node: u, parentId, path });
      if (u.children) walk(u.children, u.id, [...path, u.name]);
    }
  };
  walk(units, null, []);
  return map;
}

interface Row {
  id: string;
  depth: number;
  hasChildren: boolean;
}

/** Visible rows: the expanded tree, or (while searching) every match flat with its path. Exported for tests. */
export function orgUnitRows(units: OrgUnit[], expanded: Set<string>, query: string): Row[] {
  const rows: Row[] = [];
  const q = query.trim().toLowerCase();
  const walk = (list: OrgUnit[], depth: number) => {
    for (const u of list) {
      const hasChildren = !!u.children?.length;
      if (q) {
        if (u.name.toLowerCase().includes(q)) rows.push({ id: u.id, depth: 0, hasChildren: false });
        if (hasChildren) walk(u.children!, depth + 1);
      } else {
        rows.push({ id: u.id, depth, hasChildren });
        if (hasChildren && expanded.has(u.id)) walk(u.children!, depth + 1);
      }
    }
  };
  walk(units, 0);
  return rows;
}

export interface OrgUnitPickerProps {
  units: OrgUnit[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Expanded on first open. Default: the top level and the path to the current value. */
  defaultExpanded?: string[];
  defaultOpen?: boolean;
  /** Start with this search text (docs and screenshot tests). */
  defaultSearch?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

/** Tree select for departments, teams and plants. Arrow keys move, Right / Left expand and collapse, Enter picks; search shows matches with their path. */
export function OrgUnitPicker({
  units,
  value,
  onChange,
  placeholder = 'Select org unit',
  defaultExpanded,
  defaultOpen = false,
  defaultSearch = '',
  disabled,
  required,
  id,
  size = 'md',
  'aria-label': ariaLabel,
}: OrgUnitPickerProps) {
  const index = useMemo(() => indexUnits(units), [units]);
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState(defaultSearch);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (defaultExpanded) return new Set(defaultExpanded);
    const s = new Set(units.map((u) => u.id));
    for (let p = value ? index.get(value)?.parentId : null; p; p = index.get(p)?.parentId ?? null) s.add(p);
    return s;
  });
  const rows = useMemo(() => orgUnitRows(units, expanded, query), [units, expanded, query]);
  const [active, setActive] = useState<string | null>(value);
  const activeId = rows.some((r) => r.id === active) ? active : (rows[0]?.id ?? null);
  const baseId = useId();
  const treeId = `${baseId}-tree`;
  const optId = (uid: string) => `${baseId}-${uid}`;
  const { controlProps } = useFieldControl({ id, required, disabled });
  const selected = value ? index.get(value) : undefined;

  useEffect(() => {
    if (open && activeId) document.getElementById(optId(activeId))?.scrollIntoView({ block: 'nearest' });
  });

  const toggle = (uid: string, to?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (to ?? !next.has(uid)) next.add(uid);
      else next.delete(uid);
      return next;
    });

  const pick = (uid: string) => {
    onChange(uid);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const i = rows.findIndex((r) => r.id === activeId);
    const row = rows[i];
    const move = (to: number) => {
      e.preventDefault();
      const r = rows[Math.max(0, Math.min(rows.length - 1, to))];
      if (r) setActive(r.id);
    };
    if (e.key === 'ArrowDown') move(i + 1);
    else if (e.key === 'ArrowUp') move(i - 1);
    else if (e.key === 'Enter' && row) {
      e.preventDefault();
      pick(row.id);
    } else if (!query && row && e.key === 'ArrowRight') {
      e.preventDefault();
      if (row.hasChildren && !expanded.has(row.id)) toggle(row.id, true);
      else if (row.hasChildren) setActive(rows[i + 1].id);
    } else if (!query && row && e.key === 'ArrowLeft') {
      e.preventDefault();
      if (row.hasChildren && expanded.has(row.id)) toggle(row.id, false);
      else {
        const parent = index.get(row.id)?.parentId;
        if (parent) setActive(parent);
      }
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="tree"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="yx-select"
          data-size={size}
          data-placeholder={selected ? undefined : true}
          data-invalid={controlProps['aria-invalid']}
          {...controlProps}
        >
          <span className="yx-select__value">
            {selected ? (
              <>
                {selected.node.name}
                {selected.path.length > 0 && <span className="yx-org-picker__path">{selected.path.join(' › ')}</span>}
              </>
            ) : (
              placeholder
            )}
          </span>
          <Icon icon={ChevronDown} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="yx-select__popover yx-org-picker">
        <div className="yx-listbox__search">
          <Icon icon={Search} />
          <input
            role="combobox"
            aria-label="Search org units"
            aria-expanded="true"
            aria-controls={treeId}
            aria-autocomplete="list"
            aria-activedescendant={activeId ? optId(activeId) : undefined}
            placeholder="Search org units"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul className="yx-org-picker__tree" role="tree" id={treeId} aria-label={ariaLabel ?? 'Org units'}>
          {rows.map((r) => {
            const info = index.get(r.id)!;
            const isOpen = expanded.has(r.id);
            return (
              <li
                key={r.id}
                id={optId(r.id)}
                role="treeitem"
                aria-level={r.depth + 1}
                aria-expanded={r.hasChildren ? isOpen : undefined}
                aria-selected={r.id === value}
                data-active={r.id === activeId || undefined}
                className="yx-org-picker__item"
                style={{ paddingInlineStart: `calc(var(--yx-space-2) + ${r.depth} * var(--yx-space-5))` }}
                onMouseMove={() => r.id !== activeId && setActive(r.id)}
                onClick={() => pick(r.id)}
              >
                <span
                  className="yx-org-picker__toggle"
                  data-open={isOpen || undefined}
                  aria-hidden="true"
                  onClick={(e) => {
                    if (!r.hasChildren) return;
                    e.stopPropagation();
                    toggle(r.id);
                  }}
                >
                  {r.hasChildren && <Icon icon={ChevronRight} />}
                </span>
                <span className="yx-listbox__content">
                  <span>{info.node.name}</span>
                  {query && info.path.length > 0 && <span className="yx-listbox__desc">{info.path.join(' › ')}</span>}
                </span>
                <span className="yx-listbox__check" aria-hidden="true">
                  {r.id === value && <Icon icon={Check} />}
                </span>
              </li>
            );
          })}
        </ul>
        {rows.length === 0 && <div className="yx-listbox__empty">No org units match “{query.trim()}”</div>}
      </PopoverContent>
    </Popover>
  );
}

export interface LegalEntity {
  id: string;
  name: string;
  gstin: string;
  state: string;
}

type PickerBase = Omit<SelectProps, 'options' | 'renderOption' | 'renderValue'>;

/** Legal entity choice with GSTIN and state (§16). Also the top-bar entity switcher. */
export function EntityPicker({ entities, placeholder = 'Select legal entity', ...rest }: PickerBase & { entities: LegalEntity[] }) {
  return (
    <Select
      {...rest}
      placeholder={placeholder}
      options={entities.map((e) => ({ value: e.id, label: e.name, description: `GSTIN ${e.gstin} · ${e.state}`, keywords: [e.gstin, e.state] }))}
    />
  );
}

export interface ScopePeriod {
  value: string;
  /** "Sep 2026", "FY 2026-27 to date". */
  label: string;
  /** Payroll is locked for this period: everything is read only. */
  locked?: boolean;
}

export interface ScopePickerProps {
  entities: LegalEntity[];
  entity: string | null;
  onEntityChange: (id: string | null) => void;
  /** Leave out for people who only see their own records (no period switch). */
  periods?: ScopePeriod[];
  period?: string | null;
  onPeriodChange?: (value: string | null) => void;
  defaultOpen?: boolean;
  /** Shown when `entity` is null and the person sees every entity, e.g. "All entities" for a System Admin. */
  allLabel?: string;
}

/**
 * One top-bar button for company and period (founder review 30 Sep 2026), e.g. "All entities · Sep 2026".
 * A locked period shows "Read only" on the button, so nobody wonders why edits don't save.
 */
export function ScopePicker({ entities, entity, onEntityChange, periods, period, onPeriodChange, defaultOpen, allLabel }: ScopePickerProps) {
  const ent = entities.find((e) => e.id === entity);
  const per = periods?.find((p) => p.value === period);
  const entityId = useId();
  const periodId = useId();
  // Only people with access to more than one legal entity get the entity choice; with nothing to choose, no button.
  const pickEntity = entities.length > 1;
  const name = pickEntity ? (ent?.name ?? (entity == null && allLabel ? allLabel : 'Select legal entity')) : '';
  if (!pickEntity && !periods) return null;
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="yx-scope"
          data-locked={per?.locked || undefined}
          aria-label={`Showing ${[name, per?.label].filter(Boolean).join(', ')}${per?.locked ? ', locked period, read only' : ''}. Change ${pickEntity ? 'company or period' : 'period'}`}
        >
          <span className="yx-scope__text">
            {pickEntity && <span className="yx-scope__name">{name}</span>}
            {per && <span className="yx-scope__period">{pickEntity ? <>&nbsp;· </> : null}{per.label}</span>}
          </span>
          {per?.locked && (
            <span className="yx-scope__lock">
              <Icon icon={LockIcon} /> Read only
            </span>
          )}
          <Icon icon={ChevronDown} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="yx-scope__panel" aria-label={pickEntity ? 'Company and period' : 'Period'}>
        {pickEntity && (
          <>
            <label className="yx-scope__field" htmlFor={entityId}>
              <span>Legal entity</span>
            </label>
            <EntityPicker id={entityId} size="sm" aria-label="Legal entity" entities={entities} value={entity} onChange={onEntityChange} />
          </>
        )}
        {periods && (
          <>
            <label className="yx-scope__field" htmlFor={periodId}>
              <span>Period</span>
            </label>
            <Select
              id={periodId}
              size="sm"
              aria-label="Period"
              value={period ?? null}
              onChange={(v) => onPeriodChange?.(v)}
              options={periods.map((p) => ({ value: p.value, label: p.label, description: p.locked ? 'Locked · read only' : 'Open' }))}
            />
          </>
        )}
        {per?.locked && <p className="yx-scope__note">{per.label} is locked. You can view everything but not change it. Ask payroll to reopen the period if something must change.</p>}
      </PopoverContent>
    </Popover>
  );
}

export interface WorkLocation {
  id: string;
  name: string;
  address: string;
  state: string;
}

/** Work location choice with address and state (§16). */
export function LocationPicker({ locations, placeholder = 'Select location', ...rest }: PickerBase & { locations: WorkLocation[] }) {
  return (
    <Select
      {...rest}
      placeholder={placeholder}
      options={locations.map((l) => ({ value: l.id, label: l.name, description: `${l.address} · ${l.state}`, keywords: [l.address, l.state] }))}
    />
  );
}
