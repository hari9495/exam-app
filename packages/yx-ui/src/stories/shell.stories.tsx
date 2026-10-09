import '../components/shell.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  Inbox,
  IndianRupee,
  Mail,
  Pencil,
  Plus,
  Receipt,
  Settings,
  Star,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  AppShell,
  Breadcrumbs,
  Card,
  CommandPalette,
  DescriptionList,
  EntityPicker,
  LocationPicker,
  MobileTabBar,
  ObjectHeader,
  OrgUnitPicker,
  PageHeader,
  PanelGroup,
  PanelLink,
  ProfileMenu,
  RAIL_ITEMS,
  SidePanel,
  SideRail,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TopBar,
  useCommandPaletteShortcut,
  type DensityChoice,
  type LegalEntity,
  type OrgUnit,
  type PaletteGroup,
  type ThemeChoice,
  type WorkLocation,
} from '../components/shell';
import { Button, IconButton } from '../components/button';
import { MenuItem, MenuSeparator } from '../components/menu';
import { Badge } from '../components/display';
import { FormField } from '../components/field';
import { DataTable, type TableColumn } from '../components/table';
import { formatDate, formatINR } from '../lib/format';
import { makeEmployees, statusTone, type Employee } from './sample-data';
import { Section, Stack } from './story-kit';

const meta: Meta = { title: 'Shell/App shell and navigation', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const MOBILE = { viewport: { value: 'mobile2', isRotated: false } };

/* ---------------- sample data ---------------- */

const ENTITIES: LegalEntity[] = [
  { id: 'kf-ka', name: 'Kaveri Foods Pvt Ltd', gstin: '29AAACK4521M1Z6', state: 'Karnataka' },
  { id: 'kf-tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', gstin: '33AAACK4521M1Z2', state: 'Tamil Nadu' },
  { id: 'kl', name: 'Kaveri Logistics LLP', gstin: '29AAKFK7810C1Z9', state: 'Karnataka' },
];

const LOCATIONS: WorkLocation[] = [
  { id: 'blr', name: 'Bengaluru head office', address: '14 Residency Road, Bengaluru 560025', state: 'Karnataka' },
  { id: 'che', name: 'Chennai office', address: '221 Anna Salai, Teynampet, Chennai 600018', state: 'Tamil Nadu' },
  { id: 'hsr', name: 'Hosur plant', address: 'Plot 42, SIPCOT Phase II, Hosur 635109', state: 'Tamil Nadu' },
];

const UNITS: OrgUnit[] = [
  {
    id: 'kf',
    name: 'Kaveri Foods',
    children: [
      {
        id: 'eng',
        name: 'Engineering',
        children: [
          { id: 'qa', name: 'Quality assurance' },
          { id: 'plat', name: 'Platform' },
          { id: 'mob', name: 'Mobile apps' },
        ],
      },
      {
        id: 'ops',
        name: 'Operations',
        children: [
          { id: 'hosur', name: 'Hosur plant', children: [{ id: 'hosur-qc', name: 'Quality control' }, { id: 'hosur-pack', name: 'Packing line' }] },
          { id: 'wh', name: 'Warehouse, Chennai' },
        ],
      },
      { id: 'fin', name: 'Finance', children: [{ id: 'payroll', name: 'Payroll' }, { id: 'ap', name: 'Accounts payable' }] },
      { id: 'ppl', name: 'People' },
      { id: 'sales', name: 'Sales', children: [{ id: 'south', name: 'Sales, South' }, { id: 'west', name: 'Sales, West' }] },
    ],
  },
];

const PALETTE: PaletteGroup[] = [
  {
    heading: 'Recent',
    recent: true,
    items: [
      { id: 'r-divya', label: 'Divya Raghunathan', secondary: 'Person · viewed today', icon: Users },
      { id: 'r-payrun', label: 'Pay run September 2026', secondary: 'Pay · pending approval', icon: Receipt },
    ],
  },
  {
    heading: 'People',
    items: [
      { id: 'p-divya', label: 'Divya Raghunathan', secondary: 'Senior QA Engineer · Engineering', icon: Users, keywords: ['KF-0001'] },
      { id: 'p-arjun', label: 'Arjun Kulkarni', secondary: 'Plant Supervisor · Operations', icon: Users, keywords: ['KF-0002'] },
      { id: 'p-sana', label: 'Sana Nizami', secondary: 'Payroll Executive · Finance', icon: Users, keywords: ['KF-0003'] },
    ],
  },
  {
    heading: 'Requests',
    items: [
      { id: 'q-leave', label: 'Leave · Prakash Menon', secondary: '06 Oct 2026 to 08 Oct 2026 · pending', icon: CalendarDays },
      { id: 'q-exp', label: 'Expense claim · Meera Iyer', secondary: '₹4,850 · client visit, Mysuru', icon: IndianRupee },
    ],
  },
  {
    heading: 'Actions',
    items: [
      { id: 'a-leave', label: 'Apply leave', icon: CalendarDays },
      { id: 'a-payroll', label: 'Run payroll', icon: Receipt },
      { id: 'a-add', label: 'Add employee', icon: UserPlus, shortcut: 'N E' },
      { id: 'a-people', label: 'Go to People', icon: Users, shortcut: 'G P' },
    ],
  },
  {
    heading: 'Settings',
    items: [
      { id: 's-leave', label: 'Leave types', secondary: 'Settings › Time', icon: Settings },
      { id: 's-pay', label: 'Salary components', secondary: 'Settings › Pay', icon: Settings },
    ],
  },
];

const Monogram = () => (
  <span
    aria-label="YukthiX"
    role="img"
    style={{
      display: 'grid',
      placeItems: 'center',
      width: 32,
      height: 32,
      borderRadius: 'var(--yx-radius-control)',
      background: 'var(--yx-color-action-primary)',
      color: 'var(--yx-color-text-on-action)',
      fontWeight: 600,
    }}
  >
    X
  </span>
);

const PEOPLE_PANEL = (
  <SidePanel title="People">
    <PanelGroup label="Favourites">
      <PanelLink icon={Star} href="#">
        Probation due this month
      </PanelLink>
      <PanelLink icon={Star} href="#">
        Hosur plant, all shifts
      </PanelLink>
    </PanelGroup>
    <PanelGroup label="Records">
      <PanelLink icon={Users} href="#" active>
        Employees
      </PanelLink>
      <PanelLink icon={Inbox} href="#" count={12}>
        Approvals
      </PanelLink>
      <PanelLink icon={UserPlus} href="#" count={4}>
        Onboarding
      </PanelLink>
      <PanelLink icon={UserMinus} href="#">
        Exits
      </PanelLink>
      <PanelLink icon={FileText} href="#">
        Documents
      </PanelLink>
    </PanelGroup>
    <PanelGroup label="Saved views">
      <PanelLink href="#">Engineering, Bengaluru</PanelLink>
      <PanelLink href="#">Notice period</PanelLink>
      <PanelLink href="#">Contractors whose agreements end in October 2026</PanelLink>
    </PanelGroup>
  </SidePanel>
);

const EMPLOYEES = makeEmployees(40);
const COLS: TableColumn<Employee>[] = [
  { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }), width: 260 },
  { key: 'code', header: 'ID', type: 'id', value: (r) => r.code, width: 110 },
  { key: 'department', header: 'Department', value: (r) => r.department, width: 140 },
  { key: 'location', header: 'Location', value: (r) => r.location, width: 140 },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone, width: 140 },
];

function Frame({
  collapsed: initialCollapsed = false,
  defaultNavOpen,
  children,
  paletteOpen = false,
}: {
  collapsed?: boolean;
  defaultNavOpen?: boolean;
  children?: ReactNode;
  paletteOpen?: boolean;
}) {
  const [area, setArea] = useState('people');
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [entity, setEntity] = useState<string | null>('kf-ka');
  const [open, setOpen] = useState(paletteOpen);
  const [tab, setTab] = useState('home');
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [density, setDensity] = useState<DensityChoice>('comfortable');
  useCommandPaletteShortcut(() => setOpen((o) => !o));
  return (
    <>
      <AppShell
        panelCollapsed={collapsed}
        onPanelCollapsedChange={setCollapsed}
        defaultNavOpen={defaultNavOpen}
        rail={<SideRail items={RAIL_ITEMS} activeId={area} onSelect={setArea} logo={<Monogram />} />}
        panel={PEOPLE_PANEL}
        topBar={
          <TopBar
            onSearch={() => setOpen(true)}
            entity={<EntityPicker entities={ENTITIES} value={entity} onChange={setEntity} size="sm" aria-label="Legal entity" />}
            onAsk={() => {}}
            notifications={<IconButton icon={Bell} label="Notifications, 3 unread" />}
            onHelp={() => {}}
            profile={
              <ProfileMenu
                name="Lakshmi Venkatesan"
                email="lakshmi.v@kaverifoods.in"
                theme={theme}
                onThemeChange={setTheme}
                density={density}
                onDensityChange={setDensity}
              />
            }
          />
        }
        mobileTabBar={<MobileTabBar activeId={tab} onSelect={setTab} badges={{ requests: 3 }} />}
      >
        {children ?? (
          <>
            <PageHeader
              title="Employees"
              facts="248 people · 3 locations · Kaveri Foods Pvt Ltd"
              actions={
                <>
                  <Button icon={Download}>Export</Button>
                  <Button variant="primary" icon={Plus}>
                    Add employee
                  </Button>
                </>
              }
            />
            <DataTable label="Employees" columns={COLS} rows={EMPLOYEES} getRowId={(r) => r.id} />
          </>
        )}
      </AppShell>
      <CommandPalette groups={PALETTE} onSelect={() => {}} open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ---------------- app frame ---------------- */

export const AppFrame: S = { name: 'App frame · Employees', render: () => <Frame /> };

export const CollapsedPanel: S = { name: 'App frame · panel collapsed', render: () => <Frame collapsed /> };

export const MobileFrame: S = { name: 'Mobile · bottom tabs', globals: MOBILE, render: () => <Frame /> };

export const MobileNavOpen: S = { name: 'Mobile · navigation sheet open', globals: MOBILE, render: () => <Frame defaultNavOpen /> };

export const EmptyContent: S = {
  name: 'App frame · simple card content',
  render: () => (
    <Frame>
      <PageHeader title="Home" description="Good morning, Lakshmi. 12 approvals need your action." />
      <Card title="Needs your action">
        <p style={{ margin: 0 }}>8 leave requests, 3 expense claims and 1 salary revision are waiting for you.</p>
      </Card>
    </Frame>
  ),
};

/* ---------------- rail, panel, top bar ---------------- */

export const RailAndPanel: S = {
  name: 'Side rail and panel',
  parameters: { pseudo: { hover: ['#rail-hover .yx-rail__item[aria-label="Time"]'], focusVisible: ['#rail-hover .yx-rail__item[aria-label="Pay"]'] } },
  render: () => (
    <div id="rail-hover" style={{ display: 'flex', height: 640 }}>
      <SideRail items={RAIL_ITEMS} activeId="people" logo={<Monogram />} />
      {PEOPLE_PANEL}
    </div>
  ),
};

export const RailRoleFiltered: S = {
  name: 'Side rail · employee role (filtered)',
  render: () => (
    <div style={{ display: 'flex', height: 480 }}>
      <SideRail items={RAIL_ITEMS.filter((i) => ['home', 'time', 'pay', 'learning', 'helpdesk', 'settings'].includes(i.id))} activeId="time" logo={<Monogram />} />
    </div>
  ),
};

export const TopBarAlone: S = {
  name: 'Top bar',
  render: () => (
    <TopBar
      onSearch={() => {}}
      entity={<EntityPicker entities={ENTITIES} value="kf-ka" onChange={() => {}} size="sm" aria-label="Legal entity" />}
      onAsk={() => {}}
      notifications={<IconButton icon={Bell} label="Notifications, 3 unread" />}
      onHelp={() => {}}
      profile={<ProfileMenu name="Lakshmi Venkatesan" />}
    />
  ),
};

export const ProfileMenuOpen: S = {
  name: 'Profile menu open',
  render: () => {
    const [theme, setTheme] = useState<ThemeChoice>('light');
    const [density, setDensity] = useState<DensityChoice>('compact');
    return (
      <div style={{ height: 480 }}>
        <TopBar
          onSearch={() => {}}
          onHelp={() => {}}
          profile={
            <ProfileMenu
              name="Lakshmi Venkatesan"
              email="lakshmi.v@kaverifoods.in"
              theme={theme}
              onThemeChange={setTheme}
              density={density}
              onDensityChange={setDensity}
              defaultOpen
            />
          }
        />
      </div>
    );
  },
};

/* ---------------- command palette ---------------- */

export const PaletteOpen: S = {
  name: 'Command palette · recent and all groups',
  render: () => <CommandPalette groups={PALETTE} onSelect={() => {}} defaultOpen />,
};

export const PaletteSearching: S = {
  name: 'Command palette · with results',
  render: () => <CommandPalette groups={PALETTE} onSelect={() => {}} defaultOpen defaultSearch="div" />,
};

export const PaletteNoResults: S = {
  name: 'Command palette · no results',
  render: () => <CommandPalette groups={PALETTE} onSelect={() => {}} defaultOpen defaultSearch="gratuity nomination" />,
};

export const PaletteMobile: S = {
  name: 'Command palette · mobile',
  globals: MOBILE,
  render: () => <CommandPalette groups={PALETTE} onSelect={() => {}} defaultOpen />,
};

/* ---------------- breadcrumbs and tabs ---------------- */

const pad = (children: ReactNode) => <div style={{ padding: 24 }}>{children}</div>;

export const BreadcrumbStates: S = {
  name: 'Breadcrumbs · short and collapsed',
  render: () =>
    pad(
      <Stack>
        <Section title="Short (3 items)">
          <Breadcrumbs items={[{ label: 'People', href: '#' }, { label: 'Divya Raghunathan', href: '#' }, { label: 'Documents' }]} />
        </Section>
        <Section title="Collapsed (6 items): middle in the … menu">
          <Breadcrumbs
            items={[
              { label: 'Pay', href: '#' },
              { label: 'Pay runs', href: '#' },
              { label: 'September 2026', href: '#' },
              { label: 'Hosur plant', href: '#' },
              { label: 'Arjun Kulkarni', href: '#' },
              { label: 'Payslip' },
            ]}
          />
        </Section>
      </Stack>,
    ),
};

function PersonTabs() {
  const [tab, setTab] = useState('overview');
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Divya Raghunathan">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="job">Job</TabsTrigger>
        <TabsTrigger value="pay">Pay</TabsTrigger>
        <TabsTrigger value="time">Time</TabsTrigger>
        <TabsTrigger value="documents" count={4}>
          Documents
        </TabsTrigger>
        <TabsTrigger value="performance">Performance</TabsTrigger>
        <TabsTrigger value="learning" count={2}>
          Learning
        </TabsTrigger>
        <TabsTrigger value="assets">Assets</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value={tab}>
        <p style={{ margin: 0 }}>Content for the {tab} tab. The tab value lives in the URL: /people/KF-0001/{tab}</p>
      </TabsContent>
    </Tabs>
  );
}

export const TabStates: S = {
  name: 'Tabs · default, counts, disabled',
  parameters: { pseudo: { hover: ['#tabs-states .yx-tabs__trigger[value="b"]'], focusVisible: ['#tabs-states .yx-tabs__trigger[value="c"]'] } },
  render: () =>
    pad(
      <Stack>
        <Section title="Default">
          <Tabs defaultValue="a">
            <TabsList aria-label="Leave">
              <TabsTrigger value="a">Requests</TabsTrigger>
              <TabsTrigger value="b">Balances</TabsTrigger>
              <TabsTrigger value="c">Calendar</TabsTrigger>
            </TabsList>
            <TabsContent value="a">Leave requests appear here.</TabsContent>
            <TabsContent value="b">Leave balances appear here.</TabsContent>
            <TabsContent value="c">The team leave calendar appears here.</TabsContent>
          </Tabs>
        </Section>
        <Section title="Person page with counts">
          <PersonTabs />
        </Section>
        <Section title="Hover, focus and disabled">
          <div id="tabs-states">
            <Tabs defaultValue="a">
              <TabsList aria-label="Pay run">
                <TabsTrigger value="a">Summary</TabsTrigger>
                <TabsTrigger value="b">Hover</TabsTrigger>
                <TabsTrigger value="c">Focus</TabsTrigger>
                <TabsTrigger value="d" disabled>
                  Bank file (after approval)
                </TabsTrigger>
              </TabsList>
              <TabsContent value="a">Pay run summary.</TabsContent>
              <TabsContent value="b">Hover state example.</TabsContent>
              <TabsContent value="c">Focus state example.</TabsContent>
              <TabsContent value="d">Bank file.</TabsContent>
            </Tabs>
          </div>
        </Section>
      </Stack>,
    ),
};

export const TabsOverflowMobile: S = { name: 'Tabs · overflow scrolls on mobile', globals: MOBILE, render: () => pad(<PersonTabs />) };

/* ---------------- headers ---------------- */

export const PageHeaders: S = {
  name: 'Page header variants',
  render: () =>
    pad(
      <Stack gap={8}>
        <PageHeader title="Employees" />
        <PageHeader
          title="Leave requests"
          description="Requests from your team that need a decision. Approve from here or open one to see balances."
          actions={<Button variant="primary">Apply leave</Button>}
        />
        <PageHeader
          breadcrumbs={<Breadcrumbs items={[{ label: 'Pay', href: '#' }, { label: 'Pay runs', href: '#' }, { label: 'September 2026' }]} />}
          title="Pay run September 2026"
          status={<Badge tone="warning">Pending approval</Badge>}
          facts={`248 employees · net pay ${formatINR(15432800)} · pay date ${formatDate(new Date(2026, 8, 30))}`}
          actions={
            <>
              <Button icon={Download}>Download register</Button>
              <Button>Send for review</Button>
              <Button variant="primary">Approve pay run</Button>
            </>
          }
        />
        <PageHeader
          title="Contract workers whose agreements end in the next 30 days across all plants and warehouses"
          description="Long titles wrap; the actions move below on narrow screens."
          status={<Badge tone="info">Saved view</Badge>}
          actions={
            <>
              <Button>Share view</Button>
              <Button variant="primary">Renew contracts</Button>
            </>
          }
        />
      </Stack>,
    ),
};

export const PageHeaderMobile: S = { ...PageHeaders, name: 'Page header · mobile wraps', globals: MOBILE };

const PERSON_HEADER = (
  <ObjectHeader
    person
    photoUrl={null}
    name="Divya Raghunathan"
    secondary="Senior QA Engineer · Engineering · Bengaluru"
    status={
      <>
        <Badge tone="warning">On probation</Badge>
        <Badge tone="neutral">Full time</Badge>
      </>
    }
    facts={[
      { label: 'Employee ID', value: <span className="yx-mono">KF-0001</span> },
      { label: 'Manager', value: 'Karthik Subramanian' },
      { label: 'Joined', value: formatDate(new Date(2026, 3, 6)) },
      { label: 'Probation ends', value: formatDate(new Date(2026, 9, 5)) },
      { label: 'Location', value: 'Bengaluru head office' },
    ]}
    actions={
      <>
        <Button icon={Mail}>Message</Button>
        <Button variant="primary">Start transfer</Button>
      </>
    }
    menu={
      <>
        <MenuItem icon={Pencil}>Edit details</MenuItem>
        <MenuItem icon={Download}>Download profile</MenuItem>
        <MenuItem icon={ClipboardList}>Confirm probation</MenuItem>
        <MenuSeparator />
        <MenuItem icon={UserMinus} destructive>
          Start exit
        </MenuItem>
      </>
    }
  />
);

export const ObjectHeaderPerson: S = {
  name: 'Object header · person',
  render: () =>
    pad(
      <>
        {PERSON_HEADER}
        <PersonTabs />
      </>,
    ),
};

export const ObjectHeaderPersonMobile: S = { ...ObjectHeaderPerson, name: 'Object header · person, mobile', globals: MOBILE };

export const ObjectHeaderPayRun: S = {
  name: 'Object header · pay run',
  render: () =>
    pad(
      <ObjectHeader
        icon={Receipt}
        name="Pay run September 2026"
        secondary="Kaveri Foods Pvt Ltd · 01 Sep 2026 to 30 Sep 2026"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Pay', href: '#' }, { label: 'Pay runs', href: '#' }, { label: 'September 2026' }]} />}
        status={<Badge tone="warning">Pending approval</Badge>}
        facts={[
          { label: 'Employees', value: '248' },
          { label: 'Gross pay', value: formatINR(18456300) },
          { label: 'Deductions', value: formatINR(3023500) },
          { label: 'Net pay', value: formatINR(15432800) },
          { label: 'Pay date', value: formatDate(new Date(2026, 8, 30)) },
        ]}
        actions={
          <>
            <Button icon={Download}>Download register</Button>
            <Button variant="primary">Approve pay run</Button>
          </>
        }
        menu={
          <>
            <MenuItem>View audit log</MenuItem>
            <MenuItem>Compare with August</MenuItem>
            <MenuSeparator />
            <MenuItem destructive>Discard pay run</MenuItem>
          </>
        }
      />,
    ),
};

/* ---------------- cards and description lists ---------------- */

export const CardsAndLists: S = {
  name: 'Cards and description lists',
  render: () =>
    pad(
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>
        <Card title="Job" actions={<IconButton icon={Pencil} label="Edit job details" />}>
          <DescriptionList
            items={[
              { label: 'Designation', value: 'Senior QA Engineer' },
              { label: 'Department', value: 'Engineering › Quality assurance' },
              { label: 'Manager', value: 'Karthik Subramanian' },
              { label: 'Employment type', value: 'Full time, permanent' },
              { label: 'Joined', value: formatDate(new Date(2026, 3, 6)) },
            ]}
          />
        </Card>
        <Card title="Statutory IDs" footer={<Button size="sm">Request change</Button>}>
          <DescriptionList
            items={[
              { label: 'Employee ID', value: 'KF-0001', mono: true, copyValue: 'KF-0001' },
              { label: 'PAN', value: 'ABCPR1234K', mono: true, copyValue: 'ABCPR1234K' },
              { label: 'UAN', value: '100 912 345 678', mono: true, copyValue: '100912345678' },
              { label: 'Aadhaar', value: 'XXXX XXXX 4821', mono: true },
            ]}
          />
        </Card>
        <Card title="Pay summary, September 2026">
          <DescriptionList
            columns={2}
            items={[
              { label: 'Gross', value: formatINR(96000) },
              { label: 'Deductions', value: formatINR(11840) },
              { label: 'Net pay', value: formatINR(84160) },
              { label: 'Paid on', value: formatDate(new Date(2026, 8, 30)) },
            ]}
          />
        </Card>
        <Card>
          <p style={{ margin: 0 }}>A card without a title: use only when grouping genuinely helps (§11).</p>
        </Card>
        <Card title="Address, with a long value">
          <DescriptionList
            items={[
              { label: 'Current address', value: 'Flat 4B, Sri Lakshmi Residency, 3rd Cross, 8th Main, Malleshwaram, Bengaluru, Karnataka 560003' },
              { label: 'Emergency contact', value: 'R. Raghunathan (father) · +91 98450 12345' },
            ]}
          />
        </Card>
      </div>,
    ),
};

export const CardsAndListsMobile: S = { ...CardsAndLists, name: 'Cards and description lists · mobile stacks', globals: MOBILE };

/* ---------------- mobile tab bar ---------------- */

export const MobileTabs: S = {
  name: 'Mobile tab bar',
  globals: MOBILE,
  render: () => {
    const [tab, setTab] = useState('requests');
    return (
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0 }}>
        <MobileTabBar activeId={tab} onSelect={setTab} badges={{ requests: 3, pay: 1 }} />
      </div>
    );
  },
};

/* ---------------- pickers ---------------- */

export const OrgUnitOpenSearch: S = {
  name: 'Org-unit picker · open with search',
  render: () => {
    const [v, setV] = useState<string | null>(null);
    return pad(
      <div style={{ maxWidth: 360, height: 420 }}>
        <FormField label="Department">
          <OrgUnitPicker units={UNITS} value={v} onChange={setV} defaultOpen defaultSearch="quality" />
        </FormField>
      </div>,
    );
  },
};

export const OrgUnitOpenTree: S = {
  name: 'Org-unit picker · open tree',
  render: () => {
    const [v, setV] = useState<string | null>('hosur-qc');
    return pad(
      <div style={{ maxWidth: 360, height: 420 }}>
        <FormField label="Department" helper="Right arrow expands, left arrow collapses, Enter picks.">
          <OrgUnitPicker units={UNITS} value={v} onChange={setV} defaultOpen />
        </FormField>
      </div>,
    );
  },
};

export const OrgUnitNoMatch: S = {
  name: 'Org-unit picker · no matches',
  render: () =>
    pad(
      <div style={{ maxWidth: 360, height: 240 }}>
        <FormField label="Department">
          <OrgUnitPicker units={UNITS} value={null} onChange={() => {}} defaultOpen defaultSearch="Marketing" />
        </FormField>
      </div>,
    ),
};

export const Pickers: S = {
  name: 'Entity and location pickers',
  render: () => {
    const [e, setE] = useState<string | null>('kf-ka');
    const [l, setL] = useState<string | null>(null);
    const [o, setO] = useState<string | null>('qa');
    return pad(
      <div style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 480 }}>
        <FormField label="Legal entity" required>
          <EntityPicker entities={ENTITIES} value={e} onChange={setE} defaultOpen />
        </FormField>
        <FormField label="Work location">
          <LocationPicker locations={LOCATIONS} value={l} onChange={setL} />
        </FormField>
        <FormField label="Department">
          <OrgUnitPicker units={UNITS} value={o} onChange={setO} />
        </FormField>
        <FormField label="Department" error="Choose the department Divya will move to">
          <OrgUnitPicker units={UNITS} value={null} onChange={() => {}} />
        </FormField>
        <FormField label="Work location" disabled>
          <LocationPicker locations={LOCATIONS} value="hsr" onChange={() => {}} disabled />
        </FormField>
      </div>,
    );
  },
};
