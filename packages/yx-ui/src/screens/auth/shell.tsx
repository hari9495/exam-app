import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Activity, BookUser, Briefcase, Building2, CalendarClock, ClipboardCheck, Eye, FileStack, GitFork, History, IdCard, KeyRound, ListChecks, LockKeyhole, MapPin, MessageSquare, Network, Settings, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Logo, Monogram } from '../../components/brand';
import type { IconComponent } from '../../components/foundations';
import { AppShell, PanelGroup, PanelLink, ProfileMenu, SidePanel, SideRail, TopBar, type DensityChoice, type RailItem, type ThemeChoice } from '../../components/shell';

export type WorkspacePage = 'me' | 'activity' | 'settings' | 'sms' | 'entities' | 'locations' | 'structure' | 'directory' | 'org-chart' | 'team' | 'job-history' | 'job-changes' | 'probation' | 'bulk-changes' | 'profile' | 'profile-requests' | 'access' | 'privacy' | 'company-rules' | 'access-settings';
/** Sidebar groups, in this order. */
export type WorkspaceGroup = 'People' | 'Organisation' | 'Access' | 'Security' | 'Me';
const GROUPS: WorkspaceGroup[] = ['People', 'Organisation', 'Access', 'Security', 'Me'];

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

const ICONS: Record<WorkspacePage, IconComponent> = { me: ShieldCheck, activity: Activity, settings: Settings, sms: MessageSquare, entities: Building2, locations: MapPin, structure: Network, directory: BookUser, 'org-chart': GitFork, team: Users, 'job-history': History, 'job-changes': CalendarClock, probation: ClipboardCheck, 'bulk-changes': FileStack, profile: UserRound, 'profile-requests': IdCard, access: KeyRound, privacy: Eye, 'company-rules': ListChecks, 'access-settings': LockKeyhole };
const GROUP_ICONS: Record<WorkspaceGroup, IconComponent> = { People: Users, Organisation: Building2, Access: KeyRound, Security: ShieldCheck, Me: UserRound };

/**
 * Product frame for the YukthiX workspace pages: rail with one area per group, a grouped side panel (all groups, so the
 * menu sheet on tablets and phones reaches every page), top bar with the company and the account menu.
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
    ...groups.map((g) => ({ id: g, label: g, short: g === 'Organisation' ? 'Org' : undefined, icon: GROUP_ICONS[g], href: links.find((l) => l.group === g)!.href })),
    ...(hiringHref ? [{ id: 'hiring', label: 'Hiring', icon: Briefcase, href: hiringHref }] : []),
  ];
  const home = links[0]?.href ?? profileHref;
  return (
    <AppShell
      rail={<SideRail items={rail} activeId={activeGroup} logo={<Monogram />} />}
      panel={
        <SidePanel title="Menu">
          {groups.map((group) => (
            <PanelGroup key={group} label={group}>
              {links
                .filter((l) => l.group === group)
                .map((l) => (
                  <PanelLink key={l.id} href={l.href} icon={ICONS[l.id]} active={l.id === active} onClick={go(l.href)}>
                    {l.label}
                  </PanelLink>
                ))}
            </PanelGroup>
          ))}
          {hiringHref && (
            <PanelGroup label="Other apps">
              <PanelLink href={hiringHref} icon={Briefcase}>
                Hiring and assessments
              </PanelLink>
            </PanelGroup>
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
