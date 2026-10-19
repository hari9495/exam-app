import { useEffect, useState } from 'react';
import { CalendarPlus, CheckSquare, FileText, HelpCircle, Receipt, Ticket, UserRound, Users } from 'lucide-react';
import { useKeySequences, type PaletteGroup, type PaletteItem } from '@yukthix/ui';
import { SCREEN_RAIL } from '@yukthix/ui/frame';
import { activeLink, type NavArea } from './yx-nav';
import { useWorkspaceSearch, type SearchResult } from './yx-shell';
import { addRecent, readRecent, recentKey, writeRecent, type RecentEntry, type RecentType } from './yx-recent';

export { clearAllRecent, MAX_RECENT, type RecentEntry } from './yx-recent';

// Ctrl K as designed (PLT-20, founder review 19 Oct 2026): Recent and Actions on open; people, requests and tickets
// from the server as the person types; pages and settings only when typed. Pure parts are unit-tested.

const ICON: Record<Exclude<RecentType, 'page'>, PaletteItem['icon']> = { person: UserRound, candidate: Users, request: FileText, ticket: Ticket };
const KIND: Record<Exclude<RecentType, 'page'>, string> = { person: 'Person', candidate: 'Candidate', request: 'Request', ticket: 'Ticket' };
const areaIcon = (a: NavArea) => SCREEN_RAIL.find((r) => r.id === a.id)?.icon;
/** Where a page sits: "People › Changes", "Time"; the Home area's own pages by their group ("Me"). */
const whereOf = (a: NavArea, section?: string) => (a.id === 'home' ? (section ?? 'Home') : [a.title, section].filter(Boolean).join(' › '));

export interface PaletteInput {
  nav: NavArea[];
  /** What was typed, prefix included ("@arj", ">approve"). */
  typed: string;
  search?: SearchResult;
  recent: RecentEntry[];
  /** Approvals waiting for the person (the side-menu count). */
  waiting?: number;
  /** Has their own employee record and is not on a support session: may apply for leave and claim expenses. */
  self: boolean;
  /** May ask the help desk (not on a support session). */
  help: boolean;
}

/** What choosing an item does: open a link (remembered in Recent when `recent` is set) or open the help panel. */
export interface PaletteTarget {
  href?: string;
  recent?: RecentEntry;
  help?: true;
}

export function buildPalette(p: PaletteInput): { groups: PaletteGroup[]; targets: Map<string, PaletteTarget>; shortcuts: Record<string, string> } {
  const targets = new Map<string, PaletteTarget>();
  const shortcuts: Record<string, string> = {};
  const term = p.typed.trim().replace(/^[@#>?]\s*/, '').trim();
  const links = p.nav.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => ({ a, s, l }))));
  const link = (id: string) => links.find((x) => x.l.id === id)?.l;
  const item = (it: PaletteItem, t: PaletteTarget) => (targets.set(it.id, t), it);

  // Recent: still-reachable pages (the menu decides), and records (their page checks access when opened).
  const recent = p.recent.flatMap((e, i) => {
    if (e.type === 'page') {
      const hit = activeLink(p.nav, e.href);
      if (!hit) return [];
      const s = hit.area.sections.find((x) => x.items.includes(hit.link));
      return [item({ id: `recent:${i}`, label: e.label, secondary: whereOf(hit.area, s?.label), icon: areaIcon(hit.area) }, { href: e.href, recent: e })];
    }
    return [item({ id: `recent:${i}`, label: e.label, secondary: KIND[e.type], icon: ICON[e.type] }, { href: e.href, recent: e })];
  });

  // Actions: only what the person may do (the same rule as their menu), with real shortcuts.
  const leave = p.self ? link('my-leave') : undefined;
  const approvals = link('approvals');
  const expenses = p.self ? link('expenses') : undefined;
  const actions: PaletteItem[] = [
    ...(leave ? [item({ id: 'act:leave', label: 'Apply leave', secondary: 'Opens the request sheet', icon: CalendarPlus, shortcut: 'N L', keywords: ['leave', 'time off', 'holiday'] }, { href: `${leave.href}?apply=1` })] : []),
    ...(approvals ? [item({ id: 'act:approve', label: 'Approve requests', secondary: p.waiting ? `Approvals · ${p.waiting} waiting` : 'Approvals · nothing waiting', icon: CheckSquare, keywords: ['approve', 'approvals', 'leave', 'expense'] }, { href: approvals.href })] : []),
    ...(expenses ? [item({ id: 'act:expense', label: 'New expense claim', secondary: 'Opens the request sheet', icon: Receipt, shortcut: 'N E', keywords: ['expense', 'claim', 'receipt', 'bill'] }, { href: `${expenses.href}?new=1` })] : []),
  ];
  if (leave) shortcuts['N L'] = `${leave.href}?apply=1`;
  if (expenses) shortcuts['N E'] = `${expenses.href}?new=1`;

  // Server results: each only what the person may open (the API decides). The typed words are a keyword, since the
  // server matched them on fields the row may not show (an email, a reference).
  const kw = term ? [term] : [];
  const r = p.search;
  const hit = (key: 'person' | 'candidate' | 'request' | 'ticket', h: { id: string; label: string; secondary: string; href: string }) =>
    item({ id: `${key}:${h.id}`, label: h.label, secondary: h.secondary, icon: ICON[key], keywords: kw }, { href: h.href, recent: { label: key === 'request' || key === 'ticket' ? `${h.label} · ${h.secondary.split(' · ')[0]}` : h.label, type: key, href: h.href } });
  const people = [...(r?.people ?? []).map((h) => hit('person', h)), ...(r?.candidates ?? []).map((h) => hit('candidate', h))];
  const requests = [...(r?.requests ?? []).map((h) => hit('request', h)), ...(r?.tickets ?? []).map((h) => hit('ticket', h))];

  // Pages and settings: only once something is typed, so opening Ctrl K is never a list of every menu page.
  const pageItem = ({ a, s, l }: (typeof links)[number]) => item({ id: `go:${l.href}`, label: l.label, secondary: whereOf(a, s.label), icon: areaIcon(a), keywords: [a.title, s.label ?? ''] }, { href: l.href, recent: { label: l.label, type: 'page', href: l.href } });
  const pages = term ? links.filter((x) => x.a.id !== 'settings').map(pageItem) : [];
  const settings = term ? links.filter((x) => x.a.id === 'settings').map(pageItem) : [];
  const helpItems = p.help ? [item({ id: 'help:desk', label: 'Ask for help', secondary: 'Help centre', icon: HelpCircle, keywords: ['help', 'question', 'how', 'ask'] }, { help: true })] : [];

  const groups: PaletteGroup[] = [
    { heading: 'Recent', recent: true, items: recent },
    { heading: 'Actions', prefix: '>', items: actions },
    { heading: 'People', prefix: '@', items: people },
    { heading: 'Requests and tickets', prefix: '#', items: requests },
    { heading: 'Pages', prefix: '>', items: pages },
    { heading: 'Help and settings', prefix: '?', items: [...settings, ...(term ? helpItems : [])] },
  ];
  return { groups: groups.filter((g) => g.items.length), targets, shortcuts };
}

export interface UseYxPalette {
  nav: NavArea[];
  pathname: string;
  open: boolean;
  userId?: string | null;
  orgId?: string | null;
  waiting?: number;
  self: boolean;
  help: boolean;
  go: (href: string) => void;
  openHelp: () => void;
}

/** The live palette's groups and handlers, and the N L / N E shortcuts (never while typing in a field). */
export function useYxPalette(o: UseYxPalette) {
  const [typed, setTyped] = useState('');
  const search = useWorkspaceSearch(o.open ? typed : '');
  const key = o.userId ? recentKey(o.userId, o.orgId) : null;
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  useEffect(() => setRecent(key ? readRecent(key) : []), [key]);
  const remember = (e: RecentEntry) => {
    if (!key) return;
    setRecent((prev) => {
      const next = addRecent(prev, e);
      writeRecent(key, next);
      return next;
    });
  };
  // Pages opened through the menu or a link count as recent too (Home itself is always one click away).
  const page = activeLink(o.nav, o.pathname)?.link;
  useEffect(() => {
    if (page && page.id !== 'home') remember({ label: page.label, type: 'page', href: page.href });
    // only when the page changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.href, key]);

  const { groups, targets, shortcuts } = buildPalette({ nav: o.nav, typed, search: search.data, recent, waiting: o.waiting, self: o.self, help: o.help });
  useKeySequences(Object.fromEntries(Object.entries(shortcuts).map(([k, href]) => [k, () => o.go(href)])));
  return {
    groups,
    loading: search.loading,
    onQueryChange: setTyped,
    reset: () => setTyped(''),
    onSelect: (it: PaletteItem) => {
      const t = targets.get(it.id);
      if (!t) return;
      if (t.help) return o.openHelp();
      if (t.recent) remember(t.recent);
      if (t.href) o.go(t.href);
    },
    onClearRecent: () => {
      setRecent([]);
      if (key) writeRecent(key, []);
    },
  };
}
