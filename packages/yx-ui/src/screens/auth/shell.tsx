import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Activity, BookUser, Building2, CalendarClock, ClipboardCheck, Eye, FileStack, GitFork, History, House, IdCard, KeyRound, MapPin, MessageSquare, Network, Settings, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Logo, Monogram } from '../../components/brand';
import { AppShell, MobileTabBar, PanelGroup, PanelLink, ProfileMenu, SidePanel, SideRail, type DensityChoice, type ThemeChoice } from '../../components/shell';

export type SecurityPage = 'me' | 'activity' | 'settings' | 'sms' | 'entities' | 'locations' | 'structure' | 'directory' | 'org-chart' | 'team' | 'job-history' | 'job-changes' | 'probation' | 'bulk-changes' | 'profile' | 'profile-requests' | 'access' | 'privacy';

export interface SecurityShellLink {
  id: SecurityPage;
  label: string;
  href: string;
  /** Panel group heading, e.g. Organisation; links without one come first. */
  group?: string;
}

export interface SecurityShellProps {
  active: SecurityPage;
  /** Only the pages this person may open. */
  links: SecurityShellLink[];
  homeHref: string;
  /** Panel and rail name (default Security). */
  title?: string;
  /** Profile and notification preferences. */
  profileHref: string;
  name: string;
  email?: string;
  onSignOut: () => void;
  /** Client-side navigation; plain links when omitted. */
  onNavigate?: (href: string) => void;
  children: ReactNode;
}

const ICONS = { me: ShieldCheck, activity: Activity, settings: Settings, sms: MessageSquare, entities: Building2, locations: MapPin, structure: Network, directory: BookUser, 'org-chart': GitFork, team: Users, 'job-history': History, 'job-changes': CalendarClock, probation: ClipboardCheck, 'bulk-changes': FileStack, profile: UserRound, 'profile-requests': IdCard, access: KeyRound, privacy: Eye } as const;

/** App frame for the security pages: rail, "Security" panel, profile menu; bottom tabs on phones. */
export function SecurityShell({ active, links, homeHref, title = 'Security', profileHref, name, email, onSignOut, onNavigate, children }: SecurityShellProps) {
  const groups = [...new Set(links.map((l) => l.group))];
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
  return (
    <AppShell
      rail={
        <SideRail
          items={[
            { id: 'home', label: 'Home', icon: House, href: homeHref },
            { id: 'security', label: title, icon: title === 'Security' ? ShieldCheck : Settings, href: links[0]?.href },
          ]}
          activeId="security"
          logo={<Monogram />}
        />
      }
      panel={
        <SidePanel title={title}>
          {groups.map((group) => (
            <PanelGroup key={group ?? ''} label={group}>
              {links
                .filter((l) => l.group === group)
                .map((l) => (
                  <PanelLink key={l.id} href={l.href} icon={ICONS[l.id]} active={l.id === active} onClick={go(l.href)}>
                    {l.label}
                  </PanelLink>
                ))}
            </PanelGroup>
          ))}
        </SidePanel>
      }
      topBar={
        <header className="yx-topbar">
          <a href={homeHref} className="yx-auth__home" onClick={go(homeHref)}>
            <Logo size="md" />
          </a>
          <div className="yx-topbar__end">
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
          </div>
        </header>
      }
      mobileTabBar={
        links.length > 1 ? (
          <MobileTabBar items={links.map((l) => ({ id: l.id, label: l.label, icon: ICONS[l.id], href: l.href }))} activeId={active} />
        ) : undefined
      }
    >
      {children}
    </AppShell>
  );
}
