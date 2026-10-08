import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Activity, ChartColumn, BookOpen,BookUser,Briefcase, Contact, Megaphone, ShieldAlert, Building2, CalendarClock, CalendarDays, CircleHelp, ClipboardCheck, Eye, FileStack, GitFork, Headset, History, IdCard, KeyRound, LifeBuoy, ListChecks, LockKeyhole, Mail, MapPin, MessageSquare, Network, Settings, ShieldCheck, SlidersHorizontal, Ticket, UserRound, UserSearch, Users } from 'lucide-react';
import { Logo, Monogram } from '../../components/brand';
import type { IconComponent } from '../../components/foundations';
import { AppShell, PanelGroup, PanelLink, ProfileMenu, SidePanel, SideRail, TopBar, type DensityChoice, type RailItem, type ThemeChoice } from '../../components/shell';

export type WorkspacePage = 'me' | 'activity' | 'settings' | 'sms' | 'entities' | 'locations' | 'structure' | 'directory' | 'org-chart' | 'team' | 'job-history' | 'job-changes' | 'probation' | 'bulk-changes' | 'profile' | 'profile-requests' | 'access' | 'privacy' | 'company-rules' | 'access-settings' | 'support-access' | 'yukthix-support' | 'emails' | 'desk-help' | 'desk-tickets' | 'desk-setup' | 'desk-calendar' | 'desk-people' | 'desk-customers' | 'desk-reports' |'desk-knowledge' | 'desk-people-list' | 'desk-privacy' | 'desk-known-issues';
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

const ICONS: Record<WorkspacePage, IconComponent> = { me: ShieldCheck, activity: Activity, settings: Settings, sms: MessageSquare, entities: Building2, locations: MapPin, structure: Network, directory: BookUser, 'org-chart': GitFork, team: Users, 'job-history': History, 'job-changes': CalendarClock, probation: ClipboardCheck, 'bulk-changes': FileStack, profile: UserRound, 'profile-requests': IdCard, access: KeyRound, privacy: Eye, 'company-rules': ListChecks, 'access-settings': LockKeyhole, 'support-access': LifeBuoy, 'yukthix-support': Headset, emails: Mail, 'desk-help': CircleHelp, 'desk-tickets': Ticket, 'desk-setup': SlidersHorizontal, 'desk-calendar': CalendarDays, 'desk-people': UserSearch, 'desk-customers': Briefcase, 'desk-reports': ChartColumn,'desk-knowledge': BookOpen, 'desk-people-list': Contact, 'desk-privacy': ShieldAlert, 'desk-known-issues': Megaphone };
const GROUP_ICONS: Record<WorkspaceGroup, IconComponent> = { People: Users, 'Service desk': Headset, Organisation: Building2, Access: KeyRound, Security: ShieldCheck, Me: UserRound };

/**
 * Product frame for the YukthiX workspace pages: rail with one area per group, a side panel with that area's pages
 * (the menu sheet on phones lists every area, since there is no rail), top bar with the company and the account menu.
 */
export function WorkspaceShell({ active, links, company, hiringHref, profileHref, name, email, onSignOut, onNavigate, children }: WorkspaceShellProps) {
  const groups = GROUPS.filter((g) => links.some((l) => l.group === g));
  const activeGroup = links.find((l) => l.id === active)?.group;
  const [theme, setTheme] = useState<ThemeChoice>('light');
  const [density, setDensity] = useState<DensityChoice>('comfortable');
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
    ...groups.map((g) => ({ id: g, label: g, short: g === 'Organisation' ? 'Org' : g === 'Service desk' ? 'Desk' : undefined, icon: GROUP_ICONS[g], href: links.find((l) => l.group === g)!.href })),
    ...(hiringHref ? [{ id: 'hiring', label: 'Hiring', icon: Briefcase, href: hiringHref }] : []),
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
              onThemeChange={setTheme}
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
