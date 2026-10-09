// Shared frames for product screens (APX-D templates). Every screen story renders inside one of these
// so all 423 screens look like one product. Owned by the lead; builders use, never edit.
import { useState, type ReactNode } from 'react';
import { Bell, DoorOpen, FolderKanban, HardHat, MessageCircleQuestionMark, MessagesSquare, ShieldCheck } from 'lucide-react';
import {
  AppShell,
  ScopePicker,
  type ScopePeriod,
  MobileTabBar,
  MOBILE_TABS,
  PanelGroup,
  PanelLink,
  ProfileMenu,
  RAIL_ITEMS,
  SidePanel,
  SideRail,
  TopBar,
} from '../../components/shell';
import { IconButton } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { AssistantPanel, type AssistantMessage } from '../../components/notify';
import { Monogram, PoweredBy } from '../../components/brand';
import { ENTITIES, ME } from './data';
import { timeCounts } from '../time/time-data';
import './frames.css';

export type AreaId =
  | 'home' | 'people' | 'time' | 'pay' | 'compliance' | 'hire' | 'assess' | 'performance' | 'learning' | 'helpdesk'
  | 'engage' | 'projects' | 'contract' | 'visitors' | 'analytics' | 'settings';

/** Full rail for screens (APX-D §1.2 modules). Role-filter it per persona with `railItems`. */
export const SCREEN_RAIL = [
  ...RAIL_ITEMS.filter((r) => !r.pinBottom).slice(0, 4),
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  ...RAIL_ITEMS.filter((r) => !r.pinBottom).slice(4),
  { id: 'engage', label: 'Engage', icon: MessagesSquare },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'contract', label: 'Contract labour', short: 'Contract', icon: HardHat },
  { id: 'visitors', label: 'Visitors', icon: DoorOpen },
  ...RAIL_ITEMS.filter((r) => r.pinBottom),
];

/** Rail for an employee with no reports and no admin role (e.g. a Line Operator): own records only. */
export const EMPLOYEE_RAIL = SCREEN_RAIL.filter((r) => ['home', 'time', 'pay', 'learning', 'helpdesk', 'engage'].includes(r.id));

/** Payroll periods for the top-bar scope button. */
export const PERIODS: ScopePeriod[] = [
  { value: '2026-09', label: 'Sep 2026' },
  { value: '2026-08', label: 'Aug 2026', locked: true },
  { value: '2026-07', label: 'Jul 2026', locked: true },
  { value: 'fy', label: 'FY 2026-27 to date' },
];

export interface PanelItem {
  label: string;
  count?: number;
  active?: boolean;
}
export interface PanelSection {
  label?: string;
  items: PanelItem[];
}

export interface DesktopFrameProps {
  /** Rail area that is active. */
  area: AreaId;
  /** Panel title, e.g. "Time". */
  panelTitle: string;
  /** Panel links for the area; mark the current page active. */
  panel: PanelSection[];
  children: ReactNode;
  /** Role-filtered rail (default: all areas). */
  railItems?: typeof RAIL_ITEMS;
  panelCollapsed?: boolean;
  /** Signed-in person for the profile menu (default: ME, the employee). */
  user?: { name: string; email: string };
  /**
   * Company / period button in the top bar (founder review 30 Sep 2026). Employees and managers never get it; HR,
   * payroll and finance get it when they can see more than one entity. Default: 'none' on self-service pages
   * (the Me section or "My …"), otherwise 'entity'.
   */
  scope?: 'none' | 'entity' | 'full';
  /** The person sees every legal entity (System Admin): the entity button reads "All entities". */
  allEntities?: boolean;
  /** Legal entity shown in the entity button (ENTITIES id). Default: the first entity. */
  entityId?: string;
}

/** T1–T7 desktop frame: rail + panel + top bar. Content area gets 24 px page padding. */
export function DesktopFrame({ area, panelTitle, panel, children, railItems = SCREEN_RAIL, panelCollapsed, user = ME, scope, allEntities, entityId = ENTITIES[0].id }: DesktopFrameProps) {
  const selfService = panel.some((sec) => sec.items.some((it) => it.active && (sec.label === 'Me' || /^My /.test(it.label))));
  const shown = scope ?? (selfService ? 'none' : 'entity');
  // Phone tabs follow the role-filtered rail (no Time tab for finance), and Settings has no bottom tab of its own.
  const mobileTabs = MOBILE_TABS.filter((t) => t.id === 'requests' || t.id === 'me' || railItems.some((r) => r.id === t.id));
  const mobileActive = area === 'time' || area === 'pay' || area === 'home' ? area : area === 'settings' ? undefined : 'me';
  return (
    <AppShell
      rail={<SideRail items={railItems} activeId={area} logo={<Monogram size="sm" />} />}
      panel={
        <SidePanel title={panelTitle}>
          {panel.map((sec, i) => (
            <PanelGroup key={i} label={sec.label}>
              {sec.items.map((it) => (
                <PanelLink key={it.label} active={it.active} count={it.count}>
                  {it.label}
                </PanelLink>
              ))}
            </PanelGroup>
          ))}
        </SidePanel>
      }
      topBar={
        <TopBar
          onSearch={() => {}}
          entity={shown === 'none' ? undefined : <ScopePicker entities={ENTITIES} entity={allEntities ? null : entityId} allLabel="All entities" onEntityChange={() => {}} periods={shown === 'full' ? PERIODS : undefined} period={PERIODS[0].value} />}
          onAsk={() => {}}
          notifications={<IconButton icon={Bell} label="Notifications, 3 unread" />}
          onHelp={() => {}}
          profile={<ProfileMenu name={user.name} email={user.email} />}
        />
      }
      mobileTabBar={<MobileTabBar items={mobileTabs} activeId={mobileActive} badges={{ requests: timeCounts(user).Requests }} />}
      defaultPanelCollapsed={panelCollapsed}
    >
      <div className="yx-screen">{children}</div>
    </AppShell>
  );
}

export interface PhoneFrameProps {
  /** Bottom tab that is active: home | time | requests | pay | me. */
  tab: 'home' | 'time' | 'requests' | 'pay' | 'me';
  /** Screen title shown in the phone header. */
  title: string;
  /** Optional left action (e.g. a back IconButton) and right actions. */
  back?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Hide the tab bar for full-screen flows (check-in, camera). */
  hideTabs?: boolean;
  /** Signed-in person (default ME): the Requests badge is their count, the same one the desktop Time nav shows. */
  user?: { name: string; email: string };
  /** Ask AI in the header. Default: opens the assistant in a full-screen sheet about this screen. */
  onAsk?: () => void;
}

/** T8 mobile frame (M04): phone-width column with header and bottom tabs. Use with the mobile viewport global. */
export function PhoneFrame({ tab, title, back, actions, children, hideTabs, user = ME, onAsk }: PhoneFrameProps) {
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: 'hi', role: 'assistant', text: `Ask me about ${title}. I answer from your own records and policies, and I never change anything without asking you first.` },
  ]);
  const send = (text: string) =>
    setMessages((m) => [
      ...m,
      { id: `u${m.length}`, role: 'user', text },
      { id: `a${m.length}`, role: 'assistant', text: `I've looked at ${title}. Open the line you're asking about to see how it was worked out, or raise a query and the team will reply.` },
    ]);
  return (
    <div className="yx-phone">
      <header className="yx-phone__head">
        {back}
        <h1 className="yx-phone__title">{title}</h1>
        <div className="yx-phone__actions">
          {actions}
          {/* Ask AI sits in the header, never floating over the content (R8); full-screen tasks without tabs never show it. */}
          {!hideTabs && <IconButton icon={MessageCircleQuestionMark} label="Ask AI" variant="secondary" className="yx-ask-fab" onClick={onAsk ?? (() => setAsking(true))} />}
        </div>
      </header>
      {!onAsk && (
        <Drawer open={asking} onOpenChange={setAsking} title="Ask YukthiX" size="full">
          <AssistantPanel messages={messages} onSend={send} />
        </Drawer>
      )}
      <main className="yx-phone__body">{children}</main>
      {!hideTabs && (
        <div className="yx-phone__tabs">
          <MobileTabBar activeId={tab} badges={{ requests: timeCounts(user).Requests }} />
        </div>
      )}
    </div>
  );
}

export interface PortalFrameProps {
  /** Tenant company name shown in the header (tenant brand, §38). */
  tenant: string;
  /** Portal name, e.g. "Candidate portal", "Client portal". */
  portal: string;
  nav?: { label: string; active?: boolean }[];
  user?: string;
  children: ReactNode;
  whiteLabel?: boolean;
}

/** T9 external-portal shell (APX-D §4): tenant header, simple top nav, Powered by YukthiX footer. */
export function PortalFrame({ tenant, portal, nav = [], user, children, whiteLabel }: PortalFrameProps) {
  return (
    <div className="yx-portal">
      <header className="yx-portal__head">
        <span className="yx-portal__tenant">{tenant}</span>
        <span className="yx-portal__name">{portal}</span>
        <nav className="yx-portal__nav" aria-label={portal}>
          {nav.map((n) => (
            <a key={n.label} href="#" aria-current={n.active ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        {user && <span className="yx-portal__user">{user}</span>}
      </header>
      <main className="yx-portal__body">{children}</main>
      <footer className="yx-portal__foot">
        <PoweredBy whiteLabel={whiteLabel} />
      </footer>
    </div>
  );
}

/** Kiosk / shared-device frame (TIM-13): large targets, no navigation, tenant name. */
export function KioskFrame({ tenant, children }: { tenant: string; children: ReactNode }) {
  return (
    <div className="yx-kiosk">
      <header className="yx-kiosk__head">{tenant}</header>
      <main className="yx-kiosk__body">{children}</main>
    </div>
  );
}

/** YukthiX internal console frame (YX-*): same shell, distinct "YukthiX console" panel title and no tenant switcher. */
export function ConsoleFrame({ panel, children }: { panel: PanelSection[]; children: ReactNode }) {
  return (
    <AppShell
      rail={<SideRail items={RAIL_ITEMS.filter((r) => ['home', 'analytics', 'settings'].includes(r.id))} activeId="home" logo={<Monogram size="sm" />} />}
      panel={
        <SidePanel title="YukthiX console">
          {panel.map((sec, i) => (
            <PanelGroup key={i} label={sec.label}>
              {sec.items.map((it) => (
                <PanelLink key={it.label} active={it.active} count={it.count}>
                  {it.label}
                </PanelLink>
              ))}
            </PanelGroup>
          ))}
        </SidePanel>
      }
      topBar={<TopBar onSearch={() => {}} onHelp={() => {}} profile={<ProfileMenu name="Anand Iyer" email="anand.i@yukthix.com" />} />}
    >
      <div className="yx-screen">{children}</div>
    </AppShell>
  );
}
