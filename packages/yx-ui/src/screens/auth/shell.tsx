import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Activity, BookOpen, BookUser, Briefcase, Building2, CalendarClock, CalendarDays, ChartColumn, CheckCheck, CircleHelp, ClipboardCheck, Contact, Eye, FileStack, Fingerprint, GitFork, Headphones, Headset, History, IdCard, KeyRound, LifeBuoy, ListChecks, LockKeyhole, Mail, MapPin, Megaphone, MessageSquare, MessagesSquare, Network, Settings, ShieldAlert, ShieldCheck, ShoppingBag, SlidersHorizontal, Ticket, UserCog, UserRound, UserSearch, Users } from 'lucide-react';
import { Logo, Monogram } from '../../components/brand';
import { ColorIcon, type ColorIconName } from '../../components/color-icon';
import type { IconComponent } from '../../components/foundations';
import { AppShell, PanelGroup, PanelLink, ProfileMenu, SidePanel, SideRail, TopBar, type DensityChoice, type RailItem, type ThemeChoice } from '../../components/shell';

export type WorkspacePage = 'me' | 'activity' | 'settings' | 'sms' | 'identity-providers' | 'entities' | 'locations' | 'structure' | 'directory' | 'org-chart' | 'team' | 'job-history' | 'job-changes' | 'probation' | 'bulk-changes' | 'profile' | 'profile-requests' | 'access' | 'privacy' | 'company-rules' | 'access-settings' | 'support-access' | 'yukthix-support' | 'emails' | 'desk-help' | 'desk-tickets' | 'desk-setup' | 'desk-calendar' | 'desk-people' | 'desk-customers' | 'desk-reports' | 'desk-knowledge' | 'desk-people-list' | 'desk-privacy' | 'desk-known-issues' | 'desk-catalog' | 'desk-chat' | 'desk-live-chat' | 'desk-team' | 'approvals';
/** Sidebar groups, in this order. */
export type WorkspaceGroup = 'People' | 'Service desk' | 'Organisation' | 'Access' | 'Security' | 'Me';
const GROUPS: WorkspaceGroup[] = ['People', 'Service desk', 'Organisation', 'Access', 'Security', 'Me'];

export interface WorkspaceLink {
  id: WorkspacePage;
  label: string;
  href: string;
  group: WorkspaceGroup;
}

export interface WorkspaceShellProps {
  active: WorkspacePage;
  /** Only the pages this person may open. */
  links: WorkspaceLink[];
  /** Company shown in the top bar. */
  company?: string;
  /** The hiring and assessment app, only for people who hold its permissions. */
  hiringHref?: string;
  /** Profile and notification preferences. */
  profileHref: string;
  name: string;
  email?: string;
  onSignOut: () => void;
  /** Client-side navigation; plain links when omitted. */
  onNavigate?: (href: string) => void;
  children: ReactNode;
}

const ICONS: Record<WorkspacePage, IconComponent> = { me: ShieldCheck, activity: Activity, settings: Settings, sms: MessageSquare, 'identity-providers': Fingerprint, entities: Building2, locations: MapPin, structure: Network, directory: BookUser, 'org-chart': GitFork, team: Users, 'job-history': History, 'job-changes': CalendarClock, probation: ClipboardCheck, 'bulk-changes': FileStack, profile: UserRound, 'profile-requests': IdCard, access: KeyRound, privacy: Eye, 'company-rules': ListChecks, 'access-settings': LockKeyhole, 'support-access': LifeBuoy, 'yukthix-support': Headset, emails: Mail, 'desk-help': CircleHelp, 'desk-tickets': Ticket, 'desk-setup': SlidersHorizontal, 'desk-calendar': CalendarDays, 'desk-people': UserSearch, 'desk-customers': Briefcase, 'desk-reports': ChartColumn, 'desk-knowledge': BookOpen, 'desk-people-list': Contact, 'desk-privacy': ShieldAlert, 'desk-known-issues': Megaphone, 'desk-catalog': ShoppingBag, 'desk-chat': MessagesSquare, 'desk-live-chat': Headphones, 'desk-team': UserCog, approvals: CheckCheck };
const GROUP_ICONS: Record<WorkspaceGroup, IconComponent> = { People: Users, 'Service desk': Headset, Organisation: Building2, Access: KeyRound, Security: ShieldCheck, Me: UserRound };
// The rail draws colour icons (§8); the panel's page links stay Lucide outline.
const GROUP_ART: Record<WorkspaceGroup, ColorIconName> = { People: 'area.people', 'Service desk': 'area.serviceDesk', Organisation: 'orgUnit', Access: 'area.access', Security: 'area.security', Me: 'area.me' };

/** localStorage key of an explicit light / dark choice; absent = follow the OS. */
export const THEME_STORAGE_KEY = 'yx-theme';
export function readThemeChoice(): ThemeChoice {
  try {
    const t = window.localStorage.getItem(THEME_STORAGE_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Product frame for the YukthiX workspace pages: rail with one area per group, a side panel with that area's pages
 * (the menu sheet on phones lists every area, since there is no rail), top bar with the company and the account menu.
 */
export function WorkspaceShell({ active, links, company, hiringHref, profileHref, name, email, onSignOut, onNavigate, children }: WorkspaceShellProps) {
  const groups = GROUPS.filter((g) => links.some((l) => l.group === g));
  const activeGroup = links.find((l) => l.id === active)?.group;
  // The OS setting unless the person chose light or dark here; the choice is kept per browser and the host's
  // sign-in pages read the same key before they paint (apps/web lib/theme-script).
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [density, setDensity] = useState<DensityChoice>('comfortable');
  useEffect(() => {
    setTheme(readThemeChoice());
  }, []);
  const chooseTheme = (t: ThemeChoice) => {
    setTheme(t);
    try {
      if (t === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* private mode: this visit only */
    }
  };
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    root.dataset.density = density;
  }, [theme, density]);
  const open = (href: string) => (onNavigate ? onNavigate(href) : window.location.assign(href));
  const go = (href: string) => (e: MouseEvent) => {
    if (!onNavigate || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    onNavigate(href);
  };
  const rail: RailItem[] = [
    ...groups.map((g) => ({ id: g, label: g, short: g === 'Organisation' ? 'Org' : g === 'Service desk' ? 'Desk' : undefined, icon: GROUP_ICONS[g], art: <ColorIcon name={GROUP_ART[g]} size={20} />, href: links.find((l) => l.group === g)!.href })),
    ...(hiringHref ? [{ id: 'hiring', label: 'Hiring', icon: Briefcase, art: <ColorIcon name="area.hiring" size={20} />, href: hiringHref }] : []),
  ];
  const home = links[0]?.href ?? profileHref;
  return (
    <AppShell
      rail={<SideRail items={rail} activeId={activeGroup} logo={<Monogram />} />}
      panel={
        <SidePanel title="Menu">
          {groups.map((group) => (
            // Desktop panel: only the area picked in the rail (§12). The phone sheet keeps every area (no rail there).
            <div key={group} className="yx-workspace__area" data-other-area={group !== activeGroup || undefined}>
            <PanelGroup label={group}>
              {links
                .filter((l) => l.group === group)
                .map((l) => (
                  <PanelLink key={l.id} href={l.href} icon={ICONS[l.id]} active={l.id === active} onClick={go(l.href)}>
                    {l.label}
                  </PanelLink>
                ))}
            </PanelGroup>
            </div>
          ))}
          {hiringHref && (
            <div className="yx-workspace__area" data-other-area>
            <PanelGroup label="Other apps">
              <PanelLink href={hiringHref} icon={Briefcase}>
                Hiring and assessments
              </PanelLink>
            </PanelGroup>
            </div>
          )}
        </SidePanel>
      }
      topBar={
        <TopBar
          start={
            <a href={home} className="yx-workspace__home" onClick={go(home)}>
              <Logo size="md" />
              {company && <span className="yx-workspace__company">{company}</span>}
            </a>
          }
          profile={
            <ProfileMenu
              name={name}
              email={email}
              onSignOut={onSignOut}
              onProfile={() => open(profileHref)}
              onPreferences={() => open(profileHref)}
              theme={theme}
              onThemeChange={chooseTheme}
              density={density}
              onDensityChange={setDensity}
            />
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
