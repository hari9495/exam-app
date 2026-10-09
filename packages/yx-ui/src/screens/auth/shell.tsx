import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Activity, House, MessageSquare, Settings, ShieldCheck } from 'lucide-react';
import { Logo, Monogram } from '../../components/brand';
import { AppShell, MobileTabBar, PanelGroup, PanelLink, ProfileMenu, SidePanel, SideRail, type DensityChoice, type ThemeChoice } from '../../components/shell';

export type SecurityPage = 'me' | 'activity' | 'settings' | 'sms';

export interface SecurityShellLink {
  id: SecurityPage;
  label: string;
  href: string;
}

export interface SecurityShellProps {
  active: SecurityPage;
  /** Only the pages this person may open. */
  links: SecurityShellLink[];
  homeHref: string;
  /** Profile and notification preferences. */
  profileHref: string;
  name: string;
  email?: string;
  onSignOut: () => void;
  /** Client-side navigation; plain links when omitted. */
  onNavigate?: (href: string) => void;
  children: ReactNode;
}

const ICONS = { me: ShieldCheck, activity: Activity, settings: Settings, sms: MessageSquare } as const;

/** App frame for the security pages: rail, "Security" panel, profile menu; bottom tabs on phones. */
export function SecurityShell({ active, links, homeHref, profileHref, name, email, onSignOut, onNavigate, children }: SecurityShellProps) {
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
            { id: 'security', label: 'Security', icon: ShieldCheck, href: links[0]?.href },
          ]}
          activeId="security"
          logo={<Monogram />}
        />
      }
      panel={
        <SidePanel title="Security">
          <PanelGroup>
            {links.map((l) => (
              <PanelLink key={l.id} href={l.href} icon={ICONS[l.id]} active={l.id === active} onClick={go(l.href)}>
                {l.label}
              </PanelLink>
            ))}
          </PanelGroup>
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
