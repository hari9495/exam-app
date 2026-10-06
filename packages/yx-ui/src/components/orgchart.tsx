import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowLeft, Building2, ChevronDown, ChevronRight, Crosshair, Download, Maximize, Minus, Plus, UserPlus, ZoomIn, ZoomOut } from 'lucide-react';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu';
import { Button, ButtonGroup, IconButton } from './button';
import { Avatar } from './display';
import { Icon } from './foundations';
import { FormField } from './field';
import { TextField } from './inputs';
import { useControllable } from './overlay';
import { useNarrow } from './stepper';

export interface OrgPerson {
  id: string;
  name: string;
  role: string;
  department: string;
  managerId?: string | null;
  photo?: string | null;
  /** An open position. Shown dashed as "Vacant · {role}" in the Position view only. */
  vacant?: boolean;
  /** Dotted-line manager, drawn as a dashed connector. */
  dottedManagerId?: string;
}

export type OrgView = 'reporting' | 'department' | 'position';

export interface OrgNode {
  id: string;
  kind: 'person' | 'department';
  person?: OrgPerson;
  title: string;
  children: OrgNode[];
  /** People below this node (vacancies not counted). */
  size: number;
}

const DEPT = 'dept:';

function sized(n: Omit<OrgNode, 'size'>): OrgNode {
  const size = n.children.reduce((a, c) => a + c.size + (c.person && !c.person.vacant ? 1 : 0), 0);
  return { ...n, size };
}

/** Builds the tree for a view. Exported for tests. */
export function buildOrgTree(people: OrgPerson[], view: OrgView): OrgNode[] {
  const list = view === 'position' ? people : people.filter((p) => !p.vacant);
  const ids = new Set(list.map((p) => p.id));
  const reports = new Map<string, OrgPerson[]>();
  for (const p of list) if (p.managerId && ids.has(p.managerId)) reports.set(p.managerId, [...(reports.get(p.managerId) ?? []), p]);
  const node = (p: OrgPerson, keep: (r: OrgPerson) => boolean): OrgNode =>
    sized({
      id: p.id,
      kind: 'person',
      person: p,
      title: p.vacant ? `Vacant · ${p.role}` : p.name,
      children: (reports.get(p.id) ?? []).filter(keep).map((r) => node(r, keep)),
    });
  const isRoot = (p: OrgPerson) => !p.managerId || !ids.has(p.managerId);
  if (view !== 'department') return list.filter(isRoot).map((p) => node(p, () => true));

  const byId = new Map(list.map((p) => [p.id, p]));
  const depts = [...new Set(list.map((p) => p.department))];
  return depts.map((d) => {
    const same = (r: OrgPerson) => r.department === d;
    const tops = list.filter((p) => same(p) && (isRoot(p) || byId.get(p.managerId!)!.department !== d));
    return sized({ id: DEPT + d, kind: 'department', title: d, children: tops.map((p) => node(p, same)) });
  });
}

function indexTree(roots: OrgNode[]) {
  const byId = new Map<string, OrgNode>();
  const parent = new Map<string, string | null>();
  const walk = (n: OrgNode, p: string | null) => {
    byId.set(n.id, n);
    parent.set(n.id, p);
    n.children.forEach((c) => walk(c, n.id));
  };
  roots.forEach((r) => walk(r, null));
  const ancestors = (id: string) => {
    const out: string[] = [];
    for (let p = parent.get(id); p; p = parent.get(p)) out.unshift(p);
    return out;
  };
  return { byId, parent, ancestors };
}

export interface OrgChartProps {
  people: OrgPerson[];
  view?: OrgView;
  defaultView?: OrgView;
  onViewChange?: (view: OrgView) => void;
  /** Enter on a card, or "View profile" in the list. */
  onOpenPerson?: (person: OrgPerson) => void;
  /** Adds Export PNG / Export PDF buttons. */
  onExport?: (format: 'png' | 'pdf') => void;
  /** 'list' forces the phone drill-down. Default: tree, list below 768 px. */
  layout?: 'auto' | 'tree' | 'list';
  /** Expanded node ids, or 'all'. Default: top two levels. */
  defaultExpanded?: string[] | 'all';
  /** Jump to a person on first render (stories, deep links). */
  defaultSelected?: string;
  /** Company name for the list view's first crumb. */
  rootLabel?: string;
  /** The signed-in person: the chart opens on them and offers "Show me". */
  meId?: string;
  /** Adds "Request a hire" on vacant positions (HR). */
  onRequestHire?: (position: OrgPerson) => void;
  /** Open the desktop tree on `meId` (employees). HR opens on the top of the company. */
  openOnMe?: boolean;
}

const VIEWS: { id: OrgView; label: string }[] = [
  { id: 'reporting', label: 'Reporting lines' },
  { id: 'department', label: 'Department' },
  { id: 'position', label: 'Position' },
];
const MIN = 0.4;
const MAX = 1.6;
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n * 10) / 10));
const team = (n: number) => (n === 1 ? '1 person in team' : `${n} people in team`);

/** Org chart (§21): tree with search, zoom, pan and views; list drill-down on phones. */
export function OrgChart({
  people,
  view: viewProp,
  defaultView = 'reporting',
  onViewChange,
  onOpenPerson,
  onExport,
  layout = 'auto',
  defaultExpanded,
  defaultSelected,
  rootLabel = 'Organisation',
  meId,
  onRequestHire,
  openOnMe = true,
}: OrgChartProps) {
  // Open on the signed-in person when there is one (founder review 1 Oct 2026).
  const startAt = defaultSelected ?? (openOnMe ? meId : undefined);
  const [view, setView] = useControllable(viewProp, defaultView, onViewChange);
  const roots = useMemo(() => buildOrgTree(people, view), [people, view]);
  const tree = useMemo(() => indexTree(roots), [roots]);
  const narrow = useNarrow();
  const asList = layout === 'list' || (layout === 'auto' && narrow);

  const initialExpanded = () => {
    if (defaultExpanded === 'all') return new Set(tree.byId.keys());
    if (defaultExpanded) return new Set(defaultExpanded);
    // A single top person (the MD) opens showing only the next level, so it fits at a readable size.
    if (roots.length === 1) return new Set(roots.map((r) => r.id));
    return new Set([...roots.map((r) => r.id), ...roots.flatMap((r) => r.children.map((c) => c.id))]);
  };
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = initialExpanded();
    if (startAt) tree.ancestors(startAt).forEach((a) => s.add(a));
    return s;
  });
  const [focused, setFocused] = useState<string | null>(startAt ?? roots[0]?.id ?? null);
  const [highlight, setHighlight] = useState<string | null>(startAt ?? null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [scale, setScale] = useState(1);
  // Phone: open at my manager, so I see my manager, my teammates and myself.
  const [listAt, setListAt] = useState<string | null>(defaultSelected ?? (meId ? tree.parent.get(meId) ?? null : null));
  const [announce, setAnnounce] = useState('');
  const refs = useRef(new Map<string, HTMLLIElement>());
  const pendingFocus = useRef<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  // Changing the view rebuilds the tree; reset to its top two levels.
  const firstView = useRef(view);
  useEffect(() => {
    if (firstView.current === view) return;
    firstView.current = view;
    setExpanded(initialExpanded());
    setFocused(roots[0]?.id ?? null);
    setHighlight(null);
    setListAt(null);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = refs.current.get(pendingFocus.current);
    pendingFocus.current = null;
    el?.focus();
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  });

  useEffect(() => {
    if (startAt) {
      refs.current.get(startAt)?.scrollIntoView?.({ block: 'center', inline: 'center' });
      // Keep my manager on screen too: centre between me and my manager.
      const vp = viewportRef.current;
      const mgr = tree.parent.get(startAt);
      const a = refs.current.get(startAt)?.querySelector('.yx-org__card')?.getBoundingClientRect();
      const b = mgr ? refs.current.get(mgr)?.querySelector('.yx-org__card')?.getBoundingClientRect() : undefined;
      if (vp && a && b) {
        const box = vp.getBoundingClientRect();
        vp.scrollLeft += (a.left + a.width / 2 + b.left + b.width / 2) / 2 - (box.left + box.width / 2);
        vp.scrollTop += (a.top + b.top) / 2 - (box.top + box.height / 2) + a.height / 2;
      }
    } else {
      // The top of the organisation starts fitted to the screen, nobody cut off at the edges.
      fit();
      const vp = viewportRef.current;
      if (vp) vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const moveTo = (id: string | null | undefined) => {
    if (!id) return;
    setFocused(id);
    pendingFocus.current = id;
  };
  const toggle = (id: string, open?: boolean) => {
    const next = new Set(expanded);
    if (open ?? !next.has(id)) next.add(id);
    else next.delete(id);
    setExpanded(next);
  };

  const jump = (id: string) => {
    const next = new Set(expanded);
    tree.ancestors(id).forEach((a) => next.add(a));
    setExpanded(next);
    setHighlight(id);
    setQuery('');
    setListAt(id);
    moveTo(id);
    setAnnounce(`Showing ${tree.byId.get(id)?.title}`);
  };

  const siblings = (id: string) => {
    const p = tree.parent.get(id);
    return p ? tree.byId.get(p)!.children : roots;
  };

  const onTreeKey = (e: KeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).getAttribute('role') !== 'treeitem' || !focused) return;
    const node = tree.byId.get(focused);
    if (!node) return;
    const sib = siblings(focused);
    const i = sib.findIndex((s) => s.id === focused);
    switch (e.key) {
      case 'ArrowUp':
        moveTo(tree.parent.get(focused));
        break;
      case 'ArrowDown':
        if (!node.children.length) return;
        if (!expanded.has(focused)) toggle(focused, true);
        moveTo(node.children[0].id);
        break;
      case 'ArrowLeft':
        moveTo(sib[i - 1]?.id);
        break;
      case 'ArrowRight':
        moveTo(sib[i + 1]?.id);
        break;
      case 'Enter':
        if (node.person && !node.person.vacant) onOpenPerson?.(node.person);
        else toggle(focused);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const fit = () => {
    const vp = viewportRef.current;
    const ct = contentRef.current;
    if (!vp || !ct || !ct.scrollWidth) return;
    const w = ct.scrollWidth / scale;
    const h = ct.scrollHeight / scale;
    setScale(Math.max(MIN, Math.min(1, Math.floor(Math.min(vp.clientWidth / w, vp.clientHeight / h) * 10) / 10)));
  };
  const onZoomKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === '+' || e.key === '=') setScale((s) => clamp(s + 0.1));
    else if (e.key === '-' || e.key === '−') setScale((s) => clamp(s - 0.1));
    else return;
    e.preventDefault();
  };

  // Pan by dragging the empty canvas.
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, a') || e.button !== 0) return;
    const vp = viewportRef.current!;
    drag.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop };
    vp.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const vp = viewportRef.current!;
    vp.scrollLeft = d.left - (e.clientX - d.x);
    vp.scrollTop = d.top - (e.clientY - d.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  // Dotted-line connectors are measured after layout.
  const [dotted, setDotted] = useState<{ id: string; d: string }[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const ct = contentRef.current;
    if (!ct || asList || view === 'department') return setDotted([]);
    const base = ct.getBoundingClientRect();
    const k = scale || 1;
    const card = (id: string) => refs.current.get(id)?.querySelector('.yx-org__card')?.getBoundingClientRect();
    const out: { id: string; d: string }[] = [];
    const active = hovered ?? highlight ?? focused;
    for (const p of people) {
      if (!p.dottedManagerId) continue;
      // Only the selected or hovered person's dotted line, so lines don't cross the whole chart.
      if (active !== p.id && active !== p.dottedManagerId) continue;
      const a = card(p.dottedManagerId);
      const b = card(p.id);
      if (!a || !b || !a.width || !b.width) continue;
      const x1 = (a.left + a.width / 2 - base.left) / k;
      const y1 = (a.bottom - base.top) / k;
      const x2 = (b.left + b.width / 2 - base.left) / k;
      const y2 = (b.top - base.top) / k;
      const bend = Math.max(24, Math.abs(y2 - y1) / 2);
      out.push({ id: p.id, d: `M${x1} ${y1} C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}` });
    }
    setDotted(out);
    setBox({ w: ct.scrollWidth / k, h: ct.scrollHeight / k });
  }, [expanded, view, scale, people, asList, hovered, highlight, focused]);

  const matches = query.trim()
    ? people
        .filter((p) => (view === 'position' || !p.vacant) && tree.byId.has(p.id))
        .filter((p) => `${p.name} ${p.role} ${p.department}`.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 8)
    : [];
  const hasDotted = view !== 'department' && people.some((p) => p.dottedManagerId);
  const vacancies = view === 'position' ? people.filter((p) => p.vacant).length : 0;
  const showMe = meId && tree.byId.has(meId) && (
    <Button size="sm" icon={Crosshair} onClick={() => jump(meId)}>
      Show me
    </Button>
  );
  const nameOf = (id?: string) => people.find((p) => p.id === id)?.name;

  const search = (
    <div className="yx-org__search">
      <FormField label="Find a person" hideLabel>
        <TextField type="search" placeholder="Find a person" value={query} onChange={setQuery} size="sm" aria-controls={query.trim() ? `${uid}-results` : undefined} />
      </FormField>
      {query.trim() && (
        <ul className="yx-org__results" id={`${uid}-results`} aria-label="Matching people">
          {matches.length ? (
            matches.map((p) => (
              <li key={p.id}>
                <button type="button" className="yx-org__result" onClick={() => jump(p.id)}>
                  <span className="yx-org__rname">{p.vacant ? `Vacant · ${p.role}` : p.name}</span>
                  <span className="yx-org__rrole">
                    {p.vacant ? p.department : `${p.role} · ${p.department}`}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="yx-org__none">No one matches "{query.trim()}". Check the spelling or search by role.</li>
          )}
        </ul>
      )}
    </div>
  );

  const viewSwitch = (
    <ButtonGroup aria-label="Chart view" className="yx-org__views">
      {VIEWS.map((v) => (
        <Button key={v.id} size="sm" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
          {v.label}
        </Button>
      ))}
    </ButtonGroup>
  );

  const cardBody = (n: OrgNode) => {
    const p = n.person;
    if (n.kind === 'department')
      return (
        <>
          <span className="yx-org__dicon">
            <Icon icon={Building2} />
          </span>
          <span className="yx-org__text">
            <span className="yx-org__name">{n.title}</span>
            <span className="yx-org__meta">{n.size === 1 ? '1 person' : `${n.size} people`}</span>
          </span>
        </>
      );
    if (p!.vacant)
      return (
        <>
          <span className="yx-org__dicon">
            <Icon icon={UserPlus} />
          </span>
          <span className="yx-org__text">
            <span className="yx-org__name">Vacant · {p!.role}</span>
            <span className="yx-org__role">{p!.department}</span>
            {onRequestHire && (
              <span>
                <Button
                  size="sm"
                  icon={UserPlus}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestHire(p!);
                  }}
                >
                  Request a hire
                </Button>
              </span>
            )}
          </span>
        </>
      );
    const position = view === 'position';
    return (
      <>
        <Avatar name={p!.name} src={p!.photo} size={40} />
        <span className="yx-org__text">
          <span className="yx-org__name">{position ? p!.role : p!.name}</span>
          <span className="yx-org__role">{position ? p!.name : p!.role}</span>
          {n.size > 0 && <span className="yx-org__meta">{team(n.size)}</span>}
          {p!.dottedManagerId && view !== 'department' && nameOf(p!.dottedManagerId) && (
            <span className="yx-org__meta">Dotted line to {nameOf(p!.dottedManagerId)}</span>
          )}
        </span>
      </>
    );
  };

  /* ---------- phone: list drill-down ---------- */
  if (asList) {
    const at = listAt ? tree.byId.get(listAt) : undefined;
    const trail = at ? [...tree.ancestors(at.id), at.id] : [];
    const kids = at ? at.children : roots;
    const back = at ? tree.parent.get(at.id) ?? null : null;
    return (
      <div className="yx-org" data-layout="list">
        <div className="yx-org__toolbar">
          {search}
          {viewSwitch}
          {showMe}
        </div>
        <nav aria-label="Org chart path" className="yx-org__crumbs">
          {at && (
            <Button size="sm" icon={ArrowLeft} onClick={() => setListAt(back)}>
              Back
            </Button>
          )}
          <ol className="yx-org__trail">
            <li>
              {at ? (
                <button type="button" className="yx-org__crumb" onClick={() => setListAt(null)}>
                  {rootLabel}
                </button>
              ) : (
                <span aria-current="page">{rootLabel}</span>
              )}
            </li>
            {trail.map((id, i) => (
              <li key={id}>
                <Icon icon={ChevronRight} />
                {i === trail.length - 1 ? (
                  <span aria-current="page">{tree.byId.get(id)!.title}</span>
                ) : (
                  <button type="button" className="yx-org__crumb" onClick={() => setListAt(id)}>
                    {tree.byId.get(id)!.title}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {at && (
          <div className="yx-org__card" data-kind={at.kind} data-vacant={at.person?.vacant || undefined} data-highlight={highlight === at.id || undefined} data-size="lg">
            {cardBody(at)}
            {at.person && !at.person.vacant && onOpenPerson && (
              <Button size="sm" onClick={() => onOpenPerson(at.person!)}>
                View profile
              </Button>
            )}
          </div>
        )}
        <h3 className="yx-org__lhead">
          {at ? (at.kind === 'department' ? `People (${kids.length})` : `Direct reports (${kids.length})`) : `Top of the organisation (${kids.length})`}
        </h3>
        {kids.length ? (
          <ul className="yx-org__list">
            {kids.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  className="yx-org__litem"
                  data-vacant={k.person?.vacant || undefined}
                  data-highlight={highlight === k.id || undefined}
                  aria-current={k.id === meId ? 'true' : undefined}
                  onClick={() => (k.children.length ? setListAt(k.id) : k.person && !k.person.vacant ? onOpenPerson?.(k.person) : undefined)}
                >
                  {cardBody(k)}
                  {k.children.length > 0 && <Icon icon={ChevronRight} />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="yx-org__empty">No direct reports.</p>
        )}
        <span className="yx-visually-hidden" aria-live="polite">
          {announce}
        </span>
      </div>
    );
  }

  /* ---------- desktop: tree ---------- */
  const renderNode = (n: OrgNode, level: number) => {
    const open = expanded.has(n.id);
    const hasKids = n.children.length > 0;
    const isFocused = focused === n.id;
    return (
      <li
        key={n.id}
        role="treeitem"
        aria-level={level}
        aria-expanded={hasKids ? open : undefined}
        aria-selected={highlight === n.id}
        aria-label={`${n.title}${n.person && !n.person.vacant ? `, ${n.person.role}` : ''}${n.size ? `, ${team(n.size)}` : ''}`}
        tabIndex={isFocused ? 0 : -1}
        className="yx-org__node"
        data-id={n.id}
        ref={(el) => {
          if (el) refs.current.set(n.id, el);
          else refs.current.delete(n.id);
        }}
        onFocus={(e) => {
          if (e.target === e.currentTarget) setFocused(n.id);
        }}
      >
        <div
          className="yx-org__card"
          data-kind={n.kind}
          data-vacant={n.person?.vacant || undefined}
          data-highlight={highlight === n.id || undefined}
          data-toggle={hasKids || undefined}
          onClick={() => {
            setFocused(n.id);
            setHighlight(n.id);
          }}
          onMouseEnter={() => setHovered(n.id)}
          onMouseLeave={() => setHovered(null)}
        >
          {cardBody(n)}
          {hasKids && (
            <IconButton
              icon={open ? Minus : Plus}
              variant="secondary"
              size="sm"
              className="yx-org__toggle"
              label={open ? `Hide team of ${n.title}` : `Show team of ${n.title}`}
              aria-expanded={open}
              tabIndex={isFocused ? 0 : -1}
              onClick={(e) => {
                e.stopPropagation();
                toggle(n.id);
              }}
            />
          )}
        </div>
        {hasKids && open && <ul role="group">{n.children.map((c) => renderNode(c, level + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="yx-org" data-layout="tree" onKeyDown={onZoomKey}>
      <div className="yx-org__toolbar">
        {search}
        {viewSwitch}
        <div className="yx-org__tools">
          <IconButton icon={ZoomOut} variant="secondary" size="sm" label="Zoom out (−)" onClick={() => setScale((s) => clamp(s - 0.1))} disabled={scale <= MIN} />
          <span className="yx-org__zoom" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <IconButton icon={ZoomIn} variant="secondary" size="sm" label="Zoom in (+)" onClick={() => setScale((s) => clamp(s + 0.1))} disabled={scale >= MAX} />
          <IconButton icon={Maximize} variant="secondary" size="sm" label="Fit to screen" onClick={fit} />
          {showMe}
          {onExport && (
            <Menu>
              <MenuTrigger asChild>
                <Button size="sm" icon={Download}>
                  Export
                  <Icon icon={ChevronDown} />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => onExport('png')}>Image (PNG)</MenuItem>
                <MenuItem onSelect={() => onExport('pdf')}>PDF</MenuItem>
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>
      <div className="yx-org__legend" aria-label="Legend">
        <span className="yx-org__key" data-line="solid">Reports to</span>
        {hasDotted && <span className="yx-org__key" data-line="dashed">Dotted-line manager (select a person to see it)</span>}
        {vacancies > 0 && <span className="yx-org__key" data-line="vacant">Vacant position ({vacancies})</span>}
      </div>
      <div
        className="yx-org__viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="yx-org__content" ref={contentRef} style={{ zoom: scale }}>
          {dotted.length > 0 && (
            <svg className="yx-org__svg" width={box.w} height={box.h} aria-hidden="true">
              {dotted.map((l) => (
                <path key={l.id} d={l.d} className="yx-org__dotted" />
              ))}
            </svg>
          )}
          <ul role="tree" aria-label="Org chart" className="yx-org__tree" onKeyDown={onTreeKey}>
            {roots.map((r) => renderNode(r, 1))}
          </ul>
        </div>
      </div>
      <p className="yx-org__hint">Arrow keys move between people, Enter opens a profile, + and − zoom. Drag the empty space to move around.</p>
      <span className="yx-visually-hidden" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
