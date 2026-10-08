import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Building2, FileClock, Inbox, LifeBuoy, MessageSquare, ReceiptIndianRupee, ScrollText, ShieldCheck, Tags } from 'lucide-react';
import { Logo, Monogram } from '../../components/brand';
import type { IconComponent } from '../../components/foundations';
import { AppShell, PanelGroup, PanelLink, ProfileMenu, SidePanel, SideRail, TopBar, type DensityChoice, type RailItem, type ThemeChoice } from '../../components/shell';

export type ConsolePageId = 'companies' | 'support-desk' | 'support' | 'plans' | 'channels' | 'audit';
type ConsoleGroup = 'Customers' | 'Catalogue' | 'Channels' | 'Security';

interface ConsoleLink {
  id: ConsolePageId;
  label: string;
  href: string;
  group: ConsoleGroup;
  icon: IconComponent;
}

/** The console's pages (P14 §7); billing, incidents and customer success come later. */
export const CONSOLE_LINKS: ConsoleLink[] = [
  { id: 'companies', label: 'Companies', href: '/staff/companies', group: 'Customers', icon: Building2 },
  // Before Support sessions: the layout picks the first link whose href starts the path.
  { id: 'support-desk', label: 'Support desk', href: '/staff/support-desk', group: 'Customers', icon: Inbox },
  { id: 'support', label: 'Support sessions', href: '/staff/support', group: 'Customers', icon: LifeBuoy },
  { id: 'plans', label: 'Plans and prices', href: '/staff/plans', group: 'Catalogue', icon: Tags },
  { id: 'channels', label: 'Shared SMS account', href: '/staff/channels', group: 'Channels', icon: MessageSquare },
  { id: 'audit', label: 'Audit log', href: '/staff/audit', group: 'Security', icon: ScrollText },
];
const GROUPS: ConsoleGroup[] = ['Customers', 'Catalogue', 'Channels', 'Security'];
const GROUP_ICONS: Record<ConsoleGroup, IconComponent> = { Customers: Building2, Catalogue: ReceiptIndianRupee, Channels: MessageSquare, Security: ShieldCheck };

export interface ConsoleShellProps {
  active: ConsolePageId;
  name: string;
  email?: string;
  /** My security (the staff member's security keys). */
  securityHref: string;
  onSignOut: () => void;
  /** Client-side navigation; plain links when omitted. */
  onNavigate?: (href: string) => void;
  children: ReactNode;
}

/** Frame for the YukthiX platform console: YukthiX staff only, never a company's name or branding. */
export function ConsoleShell({ active, name, email, securityHref, onSignOut, onNavigate, children }: ConsoleShellProps) {
  const activeGroup = CONSOLE_LINKS.find((l) => l.id === active)?.group;
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
  const rail: RailItem[] = GROUPS.map((g) => ({ id: g, label: g, icon: GROUP_ICONS[g], href: CONSOLE_LINKS.find((l) => l.group === g)!.href }));
  return (
    <AppShell
      rail={<SideRail items={rail} activeId={activeGroup} logo={<Monogram />} onSelect={(id) => open(CONSOLE_LINKS.find((l) => l.group === id)!.href)} />}
      panel={
        <SidePanel title="YukthiX console">
          {GROUPS.map((group) => (
            <div key={group} className="yx-workspace__area" data-other-area={group !== activeGroup || undefined}>
              <PanelGroup label={group}>
                {CONSOLE_LINKS.filter((l) => l.group === group).map((l) => (
                  <PanelLink key={l.id} href={l.href} icon={l.icon} active={l.id === active} onClick={go(l.href)}>
                    {l.label}
                  </PanelLink>
                ))}
              </PanelGroup>
            </div>
          ))}
          <div className="yx-workspace__area" data-other-area>
            <PanelGroup label="Me">
              <PanelLink href={securityHref} icon={FileClock} onClick={go(securityHref)}>
                My security keys
              </PanelLink>
            </PanelGroup>
          </div>
        </SidePanel>
      }
      topBar={
        <TopBar
          start={
            <a href={CONSOLE_LINKS[0].href} className="yx-workspace__home" onClick={go(CONSOLE_LINKS[0].href)}>
              <Logo size="md" />
              <span className="yx-workspace__company">Console</span>
            </a>
          }
          profile={
            <ProfileMenu
              name={name}
              email={email}
              onSignOut={onSignOut}
              onProfile={() => open(securityHref)}
              onPreferences={() => open(securityHref)}
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
