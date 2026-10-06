import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, GripVertical, MoreHorizontal, Pencil, Plus, RotateCcw, RotateCw, Undo2, X } from 'lucide-react';
import { cx } from '../lib/cx';
import { formatDate, groupIndian } from '../lib/format';
import { Heading, Icon, VisuallyHidden } from './foundations';
import { Button, IconButton, Link } from './button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './menu';
import { Badge, PersonLabel } from './display';
import { EmptyState, Skeleton } from './feedback';

/* ------------------------------------------------------------------ */
/* Widget                                                               */
/* ------------------------------------------------------------------ */

/** Columns out of 12 (§4). Below 1024 px, 3 and 4 become half width; below 768 px everything is full width. */
export type WidgetSize = 3 | 4 | 6 | 8 | 12;

export interface WidgetProps {
  title: string;
  size?: WidgetSize;
  /** <MenuItem>s for the "⋯" menu. */
  menu?: ReactNode;
  /** Small controls next to the title (e.g. a period select). */
  actions?: ReactNode;
  /** When set, shown instead of the content: one sentence, e.g. "No trainings due this month." */
  empty?: ReactNode;
  /** Hide the header when the content has its own title (a chart or stat card). */
  bare?: boolean;
  /** Content is still loading (aria-busy). */
  busy?: boolean;
  /** Edit mode: buttons and links inside the widget are switched off (inert) so nothing is triggered by accident. */
  locked?: boolean;
  /** Edit mode: widget can be dragged to a new place. */
  drag?: { dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onDrop: () => void };
  /** Edit mode note for pinned widgets, e.g. "Always shown". */
  pinnedNote?: string;
  children?: ReactNode;
  className?: string;
}

/** Flat bordered card on the dashboard grid (§6, §22). */
export function Widget({ title, size = 6, menu, actions, empty, bare, busy, locked, drag, pinnedNote, children, className }: WidgetProps) {
  const id = useId();
  const [over, setOver] = useState(false);
  return (
    <section
      className={cx('yx-widget', className)}
      data-size={size}
      data-bare={bare || undefined}
      data-dragging={drag?.dragging || undefined}
      data-drop={over || undefined}
      aria-busy={busy || undefined}
      draggable={drag ? true : undefined}
      onDragStart={
        drag
          ? (e) => {
              e.dataTransfer.effectAllowed = 'move';
              drag.onDragStart();
            }
          : undefined
      }
      onDragEnd={drag ? () => { setOver(false); drag.onDragEnd(); } : undefined}
      onDragOver={
        drag
          ? (e) => {
              e.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={drag ? () => setOver(false) : undefined}
      onDrop={
        drag
          ? (e) => {
              e.preventDefault();
              setOver(false);
              drag.onDrop();
            }
          : undefined
      } aria-labelledby={bare ? undefined : id} aria-label={bare ? title : undefined}>
      {(!bare || menu || pinnedNote) && (
        <div className="yx-widget__header">
          {drag && <Icon icon={GripVertical} className="yx-widget__grip" aria-hidden="true" />}
          {!bare && (
            <Heading level={4} as="h2" id={id} className="yx-widget__title">
              {title}
            </Heading>
          )}
          <div className="yx-widget__actions">
            {actions}
            {pinnedNote && <span className="yx-widget__pinned">{pinnedNote}</span>}
            {menu && (
              <Menu>
                <MenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} label={`Options for ${title}`} size="sm" noTooltip />
                </MenuTrigger>
                <MenuContent align="end">{menu}</MenuContent>
              </Menu>
            )}
          </div>
        </div>
      )}
      {/* inert: in edit mode nothing inside the widget can be clicked or tabbed to (React 18 has no inert prop type). */}
      <div className="yx-widget__body" {...(locked ? { inert: '' } : {})}>
        {empty ? <EmptyState compact title={empty} /> : children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* DashboardGrid                                                        */
/* ------------------------------------------------------------------ */

export interface DashboardWidget {
  id: string;
  title: string;
  size?: WidgetSize;
  content: ReactNode;
  empty?: ReactNode;
  actions?: ReactNode;
  /** Content has its own title (chart, stat card). */
  bare?: boolean;
  /** Always first and cannot be moved or removed, e.g. "Needs your action" (§22). */
  pinned?: boolean;
  /**
   * Each widget loads on its own (founder review 30 Sep 2026): 'loading' shows a placeholder shaped like the content,
   * 'slow' adds "Taking longer than usual" + Retry (after ~8 s), 'error' shows "Couldn't load" + Retry while the rest
   * of the page keeps working. Bare widgets (stat cards, charts) draw their own loading placeholder.
   */
  state?: 'loading' | 'slow' | 'error';
  onRetry?: () => void;
  /** One line in the Add widget list: what it shows. */
  description?: string;
  /** Marked "Suggested" in Add widget: fits this person's role. */
  suggested?: boolean;
}

/** Placeholder rows shaped like a widget list: avatar, a line and a shorter line. */
function WidgetSkeleton() {
  return (
    <div className="yx-widget__skeleton" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="yx-widget__skeleton-row">
          <Skeleton width="var(--yx-space-8)" height="var(--yx-space-8)" className="yx-skeleton--round" />
          <div className="yx-widget__skeleton-lines">
            <Skeleton width={i === 1 ? '45%' : '60%'} />
            <Skeleton width="35%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface DashboardGridProps {
  /** Accessible name, e.g. "Manager home". */
  label: string;
  /** Every widget this role may see. */
  widgets: DashboardWidget[];
  /** Ids of the widgets shown, in order. Pinned widgets are always shown first. */
  value?: string[];
  defaultValue?: string[];
  onChange?: (ids: string[]) => void;
  editing?: boolean;
  defaultEditing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** False when the company doesn't let this person personalise their home: no Edit button, no widget menus. */
  customisable?: boolean;
}

/** Sizes a person can pick for a widget (stat cards and pinned widgets keep theirs). */
const SIZE_CHOICES: { size: WidgetSize; label: string }[] = [
  { size: 4, label: 'Small (a third)' },
  { size: 6, label: 'Medium (half)' },
  { size: 12, label: 'Wide (full row)' },
];

/**
 * 12-column role home (§22, §36). Edit mode (founder review 30 Sep 2026): a clear bar, widget buttons switched off,
 * drag handles plus Move up / Move down for keyboards, size per widget, undo after remove, reset to the company layout.
 */
export function DashboardGrid({
  label,
  widgets,
  value,
  defaultValue,
  onChange,
  editing: editingProp,
  defaultEditing = false,
  onEditingChange,
  customisable = true,
}: DashboardGridProps) {
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const companyIds = defaultValue ?? widgets.map((w) => w.id);
  const [ownIds, setOwnIds] = useState(companyIds);
  const [sizes, setSizes] = useState<Record<string, WidgetSize>>({});
  const [ownEditing, setOwnEditing] = useState(defaultEditing);
  const [announce, setAnnounce] = useState('');
  const [undo, setUndo] = useState<{ text: string; ids: string[] } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const editing = customisable && (editingProp ?? ownEditing);
  const pinned = widgets.filter((w) => w.pinned);
  const ids = (value ?? ownIds).filter((id) => byId.has(id) && !byId.get(id)!.pinned);
  const available = widgets.filter((w) => !w.pinned && !ids.includes(w.id));

  const commit = (next: string[], message: string) => {
    setOwnIds(next);
    onChange?.(next);
    setAnnounce(message);
  };
  const setEditing = (e: boolean) => {
    setOwnEditing(e);
    onEditingChange?.(e);
    if (!e) setUndo(null);
  };
  const moveTo = (id: string, j: number) => {
    const next = ids.filter((x) => x !== id);
    next.splice(j, 0, id);
    commit(next, `${byId.get(id)!.title} moved. Position ${j + 1} of ${ids.length}.`);
  };
  const move = (id: string, by: -1 | 1) => {
    const j = ids.indexOf(id) + by;
    if (j >= 0 && j < ids.length) moveTo(id, j);
  };
  const remove = (w: DashboardWidget) => {
    setUndo({ text: `${w.title} removed.`, ids });
    commit(
      ids.filter((x) => x !== w.id),
      `${w.title} removed. Select Undo, or add it again from Add widget.`,
    );
  };
  const reset = () => {
    setUndo({ text: 'Home reset to the company layout.', ids });
    setSizes({});
    commit(companyIds.filter((id) => byId.has(id)), 'Home reset to the company layout.');
  };

  const addMenu = (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" icon={Plus}>
          Add widget
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="yx-dashboard__add">
        {available.length === 0 ? (
          <MenuLabel>All widgets are already on your home</MenuLabel>
        ) : (
          [...available]
            .sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)))
            .map((w) => (
              <MenuItem key={w.id} onSelect={() => commit([...ids, w.id], `${w.title} added at the end.`)}>
                <span className="yx-dashboard__add-item">
                  <span className="yx-dashboard__add-title">
                    {w.title}
                    {w.suggested && <Badge tone="info">Suggested</Badge>}
                  </span>
                  {w.description && <span className="yx-dashboard__add-desc">{w.description}</span>}
                </span>
              </MenuItem>
            ))
        )}
      </MenuContent>
    </Menu>
  );

  const busy = widgets.some((w) => w.state === 'loading' || w.state === 'slow');
  // One announcement for the whole page, not one per widget.
  const wasBusy = useRef(busy);
  const [loadNote, setLoadNote] = useState(busy ? `Loading ${label.toLowerCase()}` : '');
  useEffect(() => {
    if (busy) setLoadNote(`Loading ${label.toLowerCase()}`);
    else if (wasBusy.current) setLoadNote(`${label} loaded`);
    wasBusy.current = busy;
  }, [busy, label]);

  const body = (w: DashboardWidget) => {
    const retry = (
      <Button size="sm" icon={RotateCw} onClick={w.onRetry}>
        Retry
      </Button>
    );
    if (w.state === 'error')
      return <EmptyState compact title={`Couldn't load ${w.title.toLowerCase()}.`} description="The rest of your home is working. Try again in a moment." action={retry} />;
    const placeholder = w.bare ? w.content : <WidgetSkeleton />;
    if (w.state === 'loading') return placeholder;
    if (w.state === 'slow')
      return (
        <>
          {placeholder}
          <div className="yx-widget__slow">
            <span>Taking longer than usual.</span>
            {retry}
          </div>
        </>
      );
    return w.content;
  };

  const render = (w: DashboardWidget, i: number | null) => {
    const size = sizes[w.id] ?? w.size;
    const movable = editing && i !== null;
    return (
      <Widget
        key={w.id}
        title={w.title}
        size={size}
        actions={w.state || editing ? undefined : w.actions}
        empty={w.state ? undefined : w.empty}
        bare={w.bare && w.state !== 'error'}
        busy={w.state === 'loading' || w.state === 'slow'}
        locked={editing}
        pinnedNote={editing && i === null && !w.bare ? 'Always shown' : undefined}
        drag={
          movable
            ? {
                dragging: dragId === w.id,
                onDragStart: () => setDragId(w.id),
                onDragEnd: () => setDragId(null),
                onDrop: () => {
                  if (dragId && dragId !== w.id) moveTo(dragId, ids.indexOf(w.id));
                  setDragId(null);
                },
              }
            : undefined
        }
        menu={
          !movable ? undefined : (
            <>
              <MenuItem icon={ArrowUp} disabled={i === 0} onSelect={() => move(w.id, -1)}>
                Move up
              </MenuItem>
              <MenuItem icon={ArrowDown} disabled={i === ids.length - 1} onSelect={() => move(w.id, 1)}>
                Move down
              </MenuItem>
              {!w.bare && (
                <>
                  <MenuSeparator />
                  <MenuLabel>Size</MenuLabel>
                  {SIZE_CHOICES.map((c) => (
                    <MenuItem
                      key={c.size}
                      icon={size === c.size ? Check : undefined}
                      onSelect={() => {
                        setSizes((s) => ({ ...s, [w.id]: c.size }));
                        setAnnounce(`${w.title} is now ${c.label.toLowerCase()}.`);
                      }}
                    >
                      {c.label}
                    </MenuItem>
                  ))}
                </>
              )}
              <MenuSeparator />
              <MenuItem icon={X} onSelect={() => remove(w)}>
                Remove widget
              </MenuItem>
            </>
          )
        }
      >
        {body(w)}
      </Widget>
    );
  };

  return (
    <div className="yx-dashboard" data-editing={editing || undefined} role="region" aria-label={label} aria-busy={busy || undefined}>
      {customisable &&
        (editing ? (
          <div className="yx-dashboard__editbar" role="group" aria-label="Editing your home">
            <p className="yx-dashboard__edittext">
              <strong>Editing your home.</strong> Drag widgets or use ⋯ to move, resize or remove them.
              {pinned.length > 0 && ` ${pinned.map((w) => w.title).join(' and ')} always stay${pinned.length === 1 ? 's' : ''} first.`} Changes are saved for you only.
            </p>
            <div className="yx-dashboard__editactions">
              <Button size="sm" icon={RotateCcw} onClick={reset}>
                Reset to company layout
              </Button>
              {addMenu}
              <Button size="sm" variant="primary" icon={Check} onClick={() => setEditing(false)}>
                Done
              </Button>
            </div>
            {undo && (
              <p className="yx-dashboard__undo">
                {undo.text}
                <Button
                  size="sm"
                  icon={Undo2}
                  onClick={() => {
                    commit(undo.ids, 'Undone.');
                    setUndo(null);
                  }}
                >
                  Undo
                </Button>
              </p>
            )}
          </div>
        ) : (
          <div className="yx-dashboard__toolbar">
            <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>
              Edit home
            </Button>
          </div>
        ))}
      <div className="yx-dashboard__grid">
        {pinned.map((w) => render(w, null))}
        {ids.map((id, i) => render(byId.get(id)!, i))}
        {ids.length === 0 && (
          <div className="yx-dashboard__empty">
            <EmptyState title="No widgets on your home yet." description="Add the numbers and trends you check most." action={addMenu} />
          </div>
        )}
      </div>
      <VisuallyHidden>
        <div aria-live="polite">{announce}</div>
        <div role="status">{loadNote}</div>
      </VisuallyHidden>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NeedsActionList                                                      */
/* ------------------------------------------------------------------ */

export interface ActionItem {
  id: string;
  /** "Leave", "Expense", "Timesheet", "Offer"… */
  type: string;
  /** What is asked: "Casual leave, 2–3 Oct (2 days)". */
  title: string;
  /** Who it is from or about. */
  who: string;
  whoPhoto?: string | null;
  due?: Date;
  /** approve = inline Approve + Review; review = Review only. */
  kind?: 'approve' | 'review';
  /** Short context after the due date: why there is no Approve ("Above your ₹10,000 limit"), a clash ("2 others off these days"). */
  note?: string;
  /** Label of the main button when it isn't a review, e.g. "Start" for an onboarding task. */
  actionLabel?: string;
}

export interface NeedsActionListProps {
  items: ActionItem[];
  /** Total waiting (may exceed items shown). */
  total?: number;
  viewAllHref: string;
  onApprove?: (item: ActionItem) => void;
  onReview?: (item: ActionItem) => void;
  /** Reference date for "Overdue" / "Due today"; defaults to now. */
  today?: Date;
  loading?: boolean;
  title?: string;
}

const DAY = 86_400_000;
const dayNumber = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);

function DueText({ due, today }: { due: Date; today: Date }) {
  const diff = dayNumber(due) - dayNumber(today);
  if (diff < 0)
    return (
      <Badge tone="warning">
        Overdue since {formatDate(due)}
      </Badge>
    );
  if (diff === 0) return <Badge tone="warning">Due today</Badge>;
  return <span className="yx-actions__due">Due {formatDate(due)}</span>;
}

/** "Needs your action": first on every home (§22). Inline Approve / Review, then "View all". */
export function NeedsActionList({ items, total = items.length, viewAllHref, onApprove, onReview, today = new Date(), loading, title = 'Needs your action' }: NeedsActionListProps) {
  const id = useId();
  return (
    <section className="yx-actions" aria-labelledby={id} aria-busy={loading || undefined}>
      <div className="yx-actions__header">
        <Heading level={4} as="h2" id={id}>
          {title}
          {!loading && total > 0 && <span className="yx-actions__count"> {groupIndian(total)}</span>}
        </Heading>
        {!loading && total > 0 && (
          <Link href={viewAllHref} className="yx-actions__all">
            View all {groupIndian(total)}
          </Link>
        )}
      </div>
      {loading ? (
        <div className="yx-actions__list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="yx-actions__item" aria-hidden="true">
              <div className="yx-actions__main yx-actions__main--skeleton">
                <div className="yx-actions__line">
                  <Skeleton width="var(--yx-space-16)" height="var(--yx-badge-height)" />
                  <Skeleton width={i === 1 ? '40%' : '55%'} />
                </div>
                <div className="yx-actions__meta">
                  <Skeleton width="var(--yx-space-5)" height="var(--yx-space-5)" className="yx-skeleton--round" />
                  <Skeleton width="calc(var(--yx-space-16) * 1.5)" />
                  <Skeleton width="calc(var(--yx-space-16) * 1.25)" />
                </div>
              </div>
              <div className="yx-actions__buttons">
                <Skeleton width="calc(var(--yx-space-16) + var(--yx-space-6))" height="var(--yx-control-sm)" />
                <Skeleton width="var(--yx-space-16)" height="var(--yx-control-sm)" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState compact title="Nothing needs your action." description="Approvals, tasks and deadlines will show here." />
      ) : (
        <ul className="yx-actions__list">
          {items.map((it) => (
            <li key={it.id} className="yx-actions__item">
              <div className="yx-actions__main">
                <div className="yx-actions__line">
                  <Badge>{it.type}</Badge>
                  <span className="yx-actions__title">{it.title}</span>
                </div>
                <div className="yx-actions__meta">
                  <PersonLabel name={it.who} src={it.whoPhoto} size={20} />
                  {it.due && <DueText due={it.due} today={today} />}
                  {it.note && <span className="yx-actions__note">{it.note}</span>}
                </div>
              </div>
              <div className="yx-actions__buttons">
                {(it.kind ?? 'approve') === 'approve' && (
                  <Button variant="approve" size="sm" icon={Check} onClick={() => onApprove?.(it)} aria-label={`Approve ${it.type.toLowerCase()} for ${it.who}`}>
                    Approve
                  </Button>
                )}
                <Button variant="review" size="sm" onClick={() => onReview?.(it)} aria-label={it.actionLabel ? `${it.actionLabel}: ${it.title}` : `Review ${it.type.toLowerCase()} for ${it.who}`}>
                  {it.actionLabel ?? 'Review'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
