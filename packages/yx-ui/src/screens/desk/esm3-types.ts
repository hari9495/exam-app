// Service Desk 3b-2 batch 3 shapes (as the API returns them): messaging lines and linked phones, help widgets, the
// team (presence, capacity, languages), shifts, the staff forecast, the availability report and the agent mailbox.

export type MsgKind = 'whatsapp' | 'sms' | 'teams' | 'slack';
export type AgentPresence = 'available' | 'away' | 'busy' | 'offline';

export interface MsgTemplate {
  name?: string;
  language?: string;
  dltTemplateId?: string | null;
  body?: string;
  status?: string;
}

export interface MsgLine {
  id: string;
  deskId: string;
  kind: MsgKind;
  name: string;
  account: { id: string; name: string; sender: string | null } | null;
  templates: Record<string, MsgTemplate>;
  state: 'active' | 'paused';
  version: number;
  onThisDesk?: boolean;
}

export interface MsgSetup {
  channels: MsgLine[];
  accounts: { id: string; name: string; channel: string; sender: string | null; active: boolean }[];
  devTransport: boolean;
}

export interface LineSecret {
  webhookUrl: string;
  secret: string;
}

export interface WidgetView {
  id: string;
  portalId: string;
  key: string;
  name: string;
  allowedOrigins: string[];
  allowAnonymous: boolean;
  mobile: boolean;
  state: 'active' | 'paused';
  version: number;
  snippet: string;
}

export interface MyLine {
  kind: MsgKind;
  name: string;
  sendTo: string | null;
  linked: { masked: string; since: string } | null;
}

export interface MyChannels {
  devTransport: boolean;
  lines: MyLine[];
}

export interface DevOutboxItem {
  kind: MsgKind;
  text: string;
  template: string | null;
  at: string;
}

export interface TeamMember {
  userId: string;
  name: string;
  role: string;
  presence: AgentPresence;
  awayUntil: string | null;
  skills: string[];
  languages: string[];
  onShift: boolean;
  openTickets: number;
  activeChats: number;
  capacity: { ticket: number | null; chat: number | null; messaging: number | null };
}

export interface ShiftView {
  id: string;
  userId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
}

export interface ForecastView {
  perAgentPerDay: number;
  weeks: number;
  history: { day: string; created: number }[];
  days: { day: string; weekday: number; expected: number; staffNeeded: number; basis: number; rostered: number; short: number }[];
}

export interface AvailabilityRow {
  userId: string;
  name: string;
  minutes: Record<AgentPresence, number>;
  replies: number;
  notes: number;
  solved: number;
  avgHandleHours: number | null;
  repliesPerOnlineHour: number | null;
  timeLoggedMinutes: number;
}

export interface AgentMailbox {
  id: string;
  kind: 'm365' | 'gmail' | 'dev';
  address: string;
  status: 'active' | 'failing';
  lastSyncAt: string | null;
  lastError: string | null;
  imported: number;
  linkedAt: string;
}
