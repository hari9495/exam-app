import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, ChevronsLeftRight, ChevronsRightLeft, Clock, ListTodo, MoreHorizontal, Plus } from 'lucide-react';
import { Button, IconButton } from './button';
import { Avatar, Badge } from './display';
import { Icon } from './foundations';
import { FormField } from './field';
import { TextArea } from './inputs';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from './menu';
import { Popover, PopoverAnchor, PopoverContent } from './popover';
import { useControllable } from './overlay';

export interface KanbanCard {
  id: string;
  name: string;
  photo?: string | null;
  /** Two short facts: "Senior Accountant", "₹12,00,000 expected". */
  facts: [ReactNode, ReactNode?];
  daysInStage: number;
  /** The next open task, e.g. "Laptop from IT · due 3 Oct"; `overdue` shows it in red. */
  next?: { text: string; overdue?: boolean };
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
  /** Work-in-progress limit shown in the header; going over is flagged, not blocked. */
  wipLimit?: number;
  /** Days a card may sit here before it is flagged (SLA). */
  slaDays?: number;
  /** Moving a card here asks for a reason first (e.g. Rejected). */
  requiresReason?: boolean;
  /** Shows the add button (needs `onAddCard`). */
  addable?: boolean;
  emptyText?: string;
}

export interface KanbanBoardProps {
  /** "Hiring pipeline, Senior Accountant" */
  'aria-label': string;
  columns?: KanbanColumn[];
  defaultColumns?: KanbanColumn[];
  onColumnsChange?: (columns: KanbanColumn[]) => void;
  /** Fired after every move, by drag or by the "Move to" menu. */
  onMove?: (cardId: string, fromColumnId: string, toColumnId: string, reason?: string) => void;
  onOpenCard?: (cardId: string) => void;
  onAddCard?: (columnId: string) => void;
  /** "Add candidate", "Add ticket" */
  addCardLabel?: string;
  /** Singular noun for the empty text and the count: "candidate". */
  noun?: string;
  defaultCollapsed?: string[];
  /** Stories: open a card's "Move to" menu. */
  defaultMoveMenuFor?: string;
  /** Stories: open the reason popover for a move. */
  defaultReasonFor?: { cardId: string; to: string };
}

interface Pending {
  cardId: string;
  to: string;
  index?: number;
}

export function moveCard(columns: KanbanColumn[], cardId: string, to: string, index?: number): KanbanColumn[] {
  const card = columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
  if (!card) return columns;
  return columns.map((c) => {
    let cards = c.cards.filter((x) => x.id !== cardId);
    if (c.id === to) {
      // index is measured with the card still in place; adjust when moving down inside the same column
      const old = c.cards.findIndex((x) => x.id === cardId);
      let at = index ?? cards.length;
      if (old !== -1 && old < at) at -= 1;
      cards = [...cards.slice(0, at), card, ...cards.slice(at)];
    }
    return { ...c, cards };
  });
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** Board for hiring pipelines and helpdesk only (§29). Drag between columns, or use the "Move to" menu on each card. */
export function KanbanBoard({
  'aria-label': label,
  columns,
  defaultColumns,
  onColumnsChange,
  onMove,
  onOpenCard,
  onAddCard,
  addCardLabel = 'Add card',
  noun = 'card',
  defaultCollapsed = [],
  defaultMoveMenuFor,
  defaultReasonFor,
}: KanbanBoardProps) {
  const [cols, setCols] = useControllable(columns, defaultColumns ?? [], onColumnsChange);
  const [collapsed, setCollapsed] = useState<string[]>(defaultCollapsed);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ col: string; index: number } | null>(null);
  const [pending, setPending] = useState<Pending | null>(defaultReasonFor ?? null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [announce, setAnnounce] = useState('');
  const uid = useId();
  // Columns share the width; when they still don't fit, say so instead of silently cutting the last one off.
  const boardRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols.length, collapsed.length]);
  const jumpTo = (id: string) => document.getElementById(`${uid}-col-${id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });

  const columnOf = (cardId: string) => cols.find((c) => c.cards.some((x) => x.id === cardId))!;
  const cardOf = (cardId: string) => cols.flatMap((c) => c.cards).find((x) => x.id === cardId)!;

  const doMove = (cardId: string, to: string, index?: number, why?: string) => {
    const from = columnOf(cardId);
    if (!from) return;
    setCols(moveCard(cols, cardId, to, index));
    onMove?.(cardId, from.id, to, why);
    const target = cols.find((c) => c.id === to)!;
    setAnnounce(`Moved ${cardOf(cardId).name} to ${target.title}`);
  };

  const requestMove = (cardId: string, to: string, index?: number) => {
    const target = cols.find((c) => c.id === to);
    if (!target) return;
    if (columnOf(cardId).id === to && index === undefined) return;
    if (target.requiresReason && columnOf(cardId).id !== to) {
      setReason('');
      setReasonError(undefined);
      setPending({ cardId, to, index });
      pendingRef.current = { cardId, to, index };
    } else doMove(cardId, to, index);
  };

  const confirmReason = () => {
    if (!pending) return;
    if (!reason.trim()) {
      setReasonError('Enter a reason. It is saved on the record.');
      return;
    }
    doMove(pending.cardId, pending.to, pending.index, reason.trim());
    setPending(null);
  };

  const onDragOver = (e: DragEvent<HTMLElement>, col: string) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-card]'));
    let index = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (index === -1) index = items.length;
    if (drop?.col !== col || drop.index !== index) setDrop({ col, index });
  };
  const onDrop = (e: DragEvent<HTMLElement>, col: string) => {
    e.preventDefault();
    const id = dragId ?? e.dataTransfer.getData('text/plain');
    if (id) requestMove(id, col, drop?.col === col ? drop.index : undefined);
    setDragId(null);
    setDrop(null);
  };

  return (
    <div className="yx-kanban-wrap">
    {/* Phones show one column at a time: these tabs reach every stage. */}
    <nav className="yx-kanban__tabs" aria-label={`${label}: stages`}>
      {cols.map((c) => (
        <button key={c.id} type="button" className="yx-kanban__tab" onClick={() => jumpTo(c.id)}>
          {c.title} <span className="yx-kanban__count">{c.cards.length}</span>
        </button>
      ))}
    </nav>
    {overflows && (
      <p className="yx-kanban__more">
        More stages to the right <Icon icon={ArrowRight} />
      </p>
    )}
    <div className="yx-kanban" role="region" aria-label={label} ref={boardRef}>
      {cols.map((col) => {
        const isCollapsed = collapsed.includes(col.id);
        const over = col.wipLimit !== undefined && col.cards.length > col.wipLimit;
        const toggle = () => setCollapsed(isCollapsed ? collapsed.filter((c) => c !== col.id) : [...collapsed, col.id]);
        const headId = `${uid}-${col.id}`;
        return (
          <section
            key={col.id}
            id={`${uid}-col-${col.id}`}
            className="yx-kanban__col"
            aria-labelledby={headId}
            data-collapsed={isCollapsed || undefined}
            data-drop={drop?.col === col.id || undefined}
            onDragOver={(e) => onDragOver(e, col.id)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
            }}
            onDrop={(e) => onDrop(e, col.id)}
          >
            <header className="yx-kanban__head">
              <h3 className="yx-kanban__title" id={headId}>
                {col.title}
              </h3>
              <span className="yx-kanban__count">
                {col.wipLimit !== undefined ? `${col.cards.length} of ${col.wipLimit}` : col.cards.length}
                <span className="yx-visually-hidden"> {col.cards.length === 1 ? noun : `${noun}s`}</span>
              </span>
              {over && <Badge tone="warning">Over limit</Badge>}
              <IconButton
                icon={isCollapsed ? ChevronsLeftRight : ChevronsRightLeft}
                label={isCollapsed ? `Expand ${col.title}` : `Collapse ${col.title}`}
                size="sm"
                aria-expanded={!isCollapsed}
                onClick={toggle}
              />
            </header>
            {!isCollapsed && (
              <>
                <ul className="yx-kanban__cards">
                  {col.cards.map((card, i) => (
                    <FragmentWithDrop key={card.id} show={drop?.col === col.id && drop.index === i}>
                      <CardItem
                        card={card}
                        col={col}
                        columns={cols}
                        dragging={dragId === card.id}
                        onOpen={onOpenCard}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', card.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragId(card.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDrop(null);
                        }}
                        onMoveTo={(to) => requestMove(card.id, to)}
                        defaultMenuOpen={defaultMoveMenuFor === card.id}
                        pendingRef={pendingRef}
                        reasonOpen={pending?.cardId === card.id}
                        onReasonOpenChange={(o) => !o && setPending(null)}
                        reasonForm={
                          pending?.cardId === card.id && (
                            <ReasonForm
                              name={card.name}
                              to={cols.find((c) => c.id === pending.to)?.title ?? ''}
                              value={reason}
                              error={reasonError}
                              onChange={(v) => {
                                setReason(v);
                                if (v.trim()) setReasonError(undefined);
                              }}
                              onCancel={() => setPending(null)}
                              onConfirm={confirmReason}
                            />
                          )
                        }
                      />
                    </FragmentWithDrop>
                  ))}
                  {drop?.col === col.id && drop.index === col.cards.length && <li className="yx-kanban__drop" aria-hidden="true" />}
                </ul>
                {col.cards.length === 0 && <p className="yx-kanban__empty">{col.emptyText ?? `No ${noun}s in this stage`}</p>}
                {col.addable && onAddCard && (
                  <Button size="sm" icon={Plus} className="yx-kanban__add" onClick={() => onAddCard(col.id)}>
                    {addCardLabel}
                  </Button>
                )}
              </>
            )}
          </section>
        );
      })}
      <span className="yx-visually-hidden" aria-live="polite">
        {announce}
      </span>
    </div>
    </div>
  );
}

function FragmentWithDrop({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <>
      {show && <li className="yx-kanban__drop" aria-hidden="true" />}
      {children}
    </>
  );
}

interface CardItemProps {
  card: KanbanCard;
  col: KanbanColumn;
  columns: KanbanColumn[];
  dragging: boolean;
  onOpen?: (id: string) => void;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onMoveTo: (to: string) => void;
  defaultMenuOpen: boolean;
  pendingRef: { current: Pending | null };
  reasonOpen: boolean;
  onReasonOpenChange: (open: boolean) => void;
  reasonForm: ReactNode;
}

function CardItem({ card, col, columns, dragging, onOpen, onDragStart, onDragEnd, onMoveTo, defaultMenuOpen, pendingRef, reasonOpen, onReasonOpenChange, reasonForm }: CardItemProps) {
  const late = col.slaDays !== undefined && card.daysInStage > col.slaDays;
  return (
    <li data-card className="yx-kanban__item">
      <Popover open={reasonOpen} onOpenChange={onReasonOpenChange}>
        <PopoverAnchor asChild>
          <article className="yx-kanban__card" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} data-dragging={dragging || undefined} data-late={late || card.next?.overdue || undefined} aria-label={card.name}>
            <div className="yx-kanban__top">
              <Avatar name={card.name} src={card.photo} size={24} />
              {onOpen ? (
                <button type="button" className="yx-kanban__name" title={card.name} onClick={() => onOpen(card.id)}>
                  {card.name}
                </button>
              ) : (
                <span className="yx-kanban__name" title={card.name}>
                  {card.name}
                </span>
              )}
              <Menu defaultOpen={defaultMenuOpen}>
                <MenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} label={`Move ${card.name}`} size="sm" noTooltip />
                </MenuTrigger>
                <MenuContent
                  align="end"
                  onCloseAutoFocus={(e) => {
                    // keep focus in the reason popover when the menu opened it
                    if (pendingRef.current?.cardId === card.id) e.preventDefault();
                  }}
                >
                  <MenuLabel>Move to</MenuLabel>
                  {columns
                    .filter((c) => c.id !== col.id)
                    .map((c) => (
                      <MenuItem key={c.id} onSelect={() => onMoveTo(c.id)}>
                        {c.title}
                      </MenuItem>
                    ))}
                </MenuContent>
              </Menu>
            </div>
            <ul className="yx-kanban__facts">
              {card.facts.filter(Boolean).map((f, i) => (
                <li key={i} title={typeof f === 'string' ? f : undefined}>
                  {f}
                </li>
              ))}
            </ul>
            {card.next && (
              <p className="yx-kanban__next" data-overdue={card.next.overdue || undefined} title={`Next: ${card.next.text}`}>
                <Icon icon={card.next.overdue ? AlertTriangle : ListTodo} />
                <span className="yx-kanban__line">{card.next.text}</span>
                {card.next.overdue && <span className="yx-visually-hidden"> (overdue)</span>}
              </p>
            )}
            <p className="yx-kanban__days" data-late={late || undefined}>
              <Icon icon={late ? AlertTriangle : Clock} />
              <span className="yx-kanban__line">
                {days(card.daysInStage)} in stage
                {late ? ` · over ${days(col.slaDays!)} target` : ''}
              </span>
            </p>
          </article>
        </PopoverAnchor>
        <PopoverContent className="yx-kanban__reason" align="start" side="bottom">
          {reasonForm}
        </PopoverContent>
      </Popover>
    </li>
  );
}

function ReasonForm({ name, to, value, error, onChange, onCancel, onConfirm }: {
  name: string;
  to: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  return (
    <form
      className="yx-kanban__rform"
      aria-labelledby={id}
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm();
      }}
    >
      <p className="yx-kanban__rtitle" id={id}>
        Move {name} to {to}?
      </p>
      <FormField label="Reason" required error={error}>
        <TextArea rows={3} value={value} onChange={onChange} autoFocus />
      </FormField>
      <div className="yx-kanban__ractions">
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" type="submit">
          Move to {to}
        </Button>
      </div>
    </form>
  );
}
