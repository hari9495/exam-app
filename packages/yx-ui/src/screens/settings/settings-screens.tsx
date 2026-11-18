// Settings map screens (APX-D §3): settings home with search (P01 §4.6), group pages, and the settings page form.
// Every page renders from its SettingsPageDef: real fields from the owning doc, starter defaults (D17), legal floors,
// source scope, save bar, "Last changed by", read-only for people without the page's permission.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { ConfirmDialog } from '../../components/overlay';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { Icon } from '../../components/foundations';
import { ErrorSummary, FormField, StickySaveBar, useUnsavedChangesGuard, useSaveErrors } from '../../components/field';
import { Breadcrumbs, Card, PageHeader } from '../../components/shell';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { useToastIfAny } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { DesktopFrame, type PanelSection } from '../_kit/frames';
import { AuditLine, LawTable, SearchResults, SettingField, SettingsSearchBox, type HistoryEntry } from './settings-kit';
import {
  allSettings,
  buildIndex,
  changedKeys,
  findPage,
  formatStamp,
  formatValue,
  parseIso,
  initialDraft,
  needsSecondApprover,
  searchSettings,
  validateDraft,
  type Draft,
} from './settings-logic';
import type { LastChange, SettingDef, SettingValue, SettingsGroupDef, SettingsPageDef } from './settings-types';
import './settings.css';

/** A date as YYYY-MM-DD in local time (the day picked). */
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** no-access: the API refused this page (Hiring walk, answer 476): the page says so, never a load error. */
/** mfa: the company asks for a second factor before admin pages open (the API's MFA_REQUIRED 403); not a load failure. */
export type LoadState = 'ready' | 'loading' | 'error' | 'no-access' | 'mfa';

/**
 * Settings panel (founder review 30 Sep 2026): the 8 groups, and only the open group's pages, so it isn't a 71-line
 * scroll. No internal section numbers.
 */
export function settingsPanel(groups: SettingsGroupDef[], activePageId?: string, activeHome?: boolean): PanelSection[] {
  const open = groups.find((g) => g.pages.some((p) => p.id === activePageId));
  return [
    { items: [{ label: 'All settings', active: activeHome }] },
    { label: 'Groups', items: groups.map((g) => ({ label: g.title, active: g === open && !activePageId })) },
    ...(open ? [{ label: open.title, items: open.pages.map((p) => ({ label: p.title, active: p.id === activePageId })) }] : []),
  ];
}

function Frame({ groups, pageId, home, children }: { groups: SettingsGroupDef[]; pageId?: string; home?: boolean; children: React.ReactNode }) {
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel(groups, pageId, home)}>
      {children}
    </DesktopFrame>
  );
}

function SettingsSkeleton() {
  return (
    <div className="yx-set-skel" role="status" aria-busy="true" aria-label="Loading settings">
      <Skeleton height={28} width="40%" />
      <Skeleton height={16} width="70%" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="yx-set-skel">
          <Skeleton height={14} width="30%" />
          <Skeleton height={36} />
        </div>
      ))}
    </div>
  );
}

/* ============================== Settings home (PLT-10 pattern) ============================== */

/**
 * Settings S-1 (answer 1322), live: `groups` holds only the pages the viewer may open, each the front door to its live
 * editor (`pageHref`); the drawn examples (recent changes, starter counts, last changed) are left out.
 */
export interface LiveSettingsNav {
  pageHref: (pageId: string) => string;
  groupHref: (groupId: number) => string;
  /** In-app navigation; a Ctrl or Cmd click keeps the browser's own new tab. */
  onNavigate: (href: string) => void;
  onRetry?: () => void;
  /** Answer 1461: the last changes on pages the viewer may open, newest first (from the audit log). */
  recent?: { id: string; what: string; from: string; to: string; who: string; at: string; pageId: string }[];
  /** Answer 1563: the company audit log, for those who may read it. */
  auditHref?: string;
}

/** Pages a live home card lists before "N more" (the rest are on the group page). */
const LIVE_CARD_PAGES = 4;

function liveLink(live: LiveSettingsNav, href: string) {
  return {
    href,
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      live.onNavigate(href);
    },
  };
}

export interface SettingsHomeScreenProps {
  groups: SettingsGroupDef[];
  defaultQuery?: string;
  /** Pages the viewer may manage; search returns only these (APX-D §3 rule 5). Default: all. */
  manageable?: string[];
  state?: LoadState;
  /** Called when a search result or page link is chosen (deep link to the field). */
  onOpen?: (pageId: string, key?: string) => void;
  /** Modules not ready for go-live (from the set-up hub). */
  setupNeeded?: boolean;
  live?: LiveSettingsNav;
}

/** Last changes, newest first (from the audit log). */
const RECENT_CHANGES = [
  { what: 'Probation length', from: '3 months', to: '6 months', who: 'Lakshmi Venkatesan', when: '12 Sep', pageId: '2.5' },
  { what: 'Hotel limit, Tier 2 cities', from: '₹4,000', to: '₹4,500 a night', who: 'Suresh Pillai', when: '9 Sep', pageId: '4.8' },
  { what: 'Grace time for late check-in', from: '15 min', to: '10 min', who: 'Lakshmi Venkatesan', when: '2 Sep', pageId: '3.5' },
  { what: 'Employee privacy notice', from: 'v2', to: 'v3', who: 'Lakshmi Venkatesan', when: '14 Jul', pageId: '2.2' },
  { what: 'PF wage ceiling', from: 'Actual basic', to: '₹15,000', who: 'Suresh Pillai', when: '1 Jul', pageId: '4.7' },
];

export function SettingsHomeScreen({ groups, defaultQuery = '', manageable, state = 'ready', onOpen, setupNeeded, live }: SettingsHomeScreenProps) {
  const [query, setQuery] = useState(defaultQuery);
  const index = useMemo(() => buildIndex(groups), [groups]);
  const can = (id: string) => !manageable || manageable.includes(id);
  const results = useMemo(() => searchSettings(index, query, can), [index, query, manageable]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = groups.reduce((n, g) => n + g.pages.length, 0);
  const starterCount = useMemo(() => groups.flatMap((g) => g.pages).filter((p) => can(p.id)).flatMap((p) => allSettings(p)).filter((d) => d.starter).length, [groups, manageable]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Frame groups={groups} home>
      <PageHeader
        title="Settings"
        description={live ? 'Every company policy has one place to change it. Search, or open a group.' : 'Every company policy has one place to change it. Values marked Starter default came from the YukthiX starter template and are yours to edit.'}
        actions={live && state === 'ready' ? <SettingsSearchBox value={query} onChange={setQuery} placeholder="Search, e.g. probation" /> : undefined}
        facts={live ? `${groups.length} group${groups.length === 1 ? '' : 's'} · ${total} page${total === 1 ? '' : 's'} you can open` : `${groups.length} groups · ${total} pages · Kaveri Foods Pvt Ltd`}
      />
      {state === 'loading' && <SettingsSkeleton />}
      {state === 'error' && <ErrorState title="We couldn't load settings." description="Check your connection and retry. Nothing you saved is lost." onRetry={live?.onRetry ?? (() => {})} reference="SET-7F21C" />}
      {state === 'no-access' && <NoAccessState grantedBy="your System Admin" what="any settings page" />}
      {state === 'ready' && (
        <>
          {!live && <SettingsSearchBox value={query} onChange={setQuery} />}
          {!query.trim() && setupNeeded && !live && (
            <InlineAlert tone="warning" title="Set-up needed: 3 modules are not ready for go-live" actions={<Button size="sm">Open set-up hub</Button>}>
              Payroll bank details, leave year and the holiday calendar for Hosur plant are incomplete.
            </InlineAlert>
          )}
          {!query.trim() && !live && (
            <div className="yx-set-overview">
              <Card title="Recently changed" actions={<a className="yx-link" href="#settings/2.10">Audit log</a>}>
                <ul className="yx-set-recent">
                  {RECENT_CHANGES.map((c) => (
                    <li key={c.what}>
                      <a href={`#settings/${c.pageId}`} onClick={(e) => (e.preventDefault(), onOpen?.(c.pageId))}>
                        <span className="yx-set-recent__what">{c.what}</span>
                        <span className="yx-set-helper">
                          {c.from} → {c.to} · {c.who} · {c.when}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Not reviewed yet">
                <p className="yx-set-big">{starterCount}</p>
                <p className="yx-set-helper">settings still use the YukthiX starter default. Check them before go-live, so every value is one you chose.</p>
                <Button size="sm" variant="review">
                  Review them
                </Button>
              </Card>
            </div>
          )}
          {!query.trim() && live?.recent && live.recent.length > 0 && (
            <Card title="Recently changed" actions={live.auditHref ? <a className="yx-link" {...liveLink(live, live.auditHref)}>Audit log</a> : undefined}>
              <ul className="yx-set-recent yx-set-recent--live">
                {live.recent.slice(0, 3).map((c) => (
                  <li key={c.id}>
                    <a {...liveLink(live, live.pageHref(c.pageId))}>
                      <span className="yx-set-recent__what">{c.what}</span>
                      <span className="yx-set-helper">
                        {c.from} → {c.to} · {c.who} · {formatDate(parseIso(c.at.slice(0, 16)))}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <SearchResults
            results={results}
            query={query}
            onClear={() => setQuery('')}
            onOpen={(r) => (live ? live.onNavigate(live.pageHref(r.pageId)) : onOpen?.(r.pageId, r.isPage ? undefined : r.key))}
            hrefOf={live ? (r) => live.pageHref(r.pageId) : undefined}
          />
          {!query.trim() && (
            <div className={live ? 'yx-set-groups yx-set-groups--live' : 'yx-set-groups'}>
              {groups.map((g) => {
                const pages = g.pages.filter((p) => can(p.id));
                // Live: the group's first pages and the rest on its group page, so the home fits one screen.
                if (live) {
                  const more = g.pages.length - LIVE_CARD_PAGES;
                  return (
                    <Card
                      key={g.id}
                      title={<a {...liveLink(live, live.groupHref(g.id))}>{g.title}</a>}
                      className="yx-set-group-card yx-set-group-card--live"
                      actions={
                        more > 0 ? (
                          <a className="yx-set-group-card__more" aria-label={`All ${g.pages.length} pages in ${g.title}`} {...liveLink(live, live.groupHref(g.id))}>
                            +{more} more
                          </a>
                        ) : undefined
                      }
                    >
                      <ul>
                        {g.pages.slice(0, LIVE_CARD_PAGES).map((p) => (
                          <li key={p.id}>
                            <a {...liveLink(live, live.pageHref(p.id))}>{p.title}</a>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                }
                return (
                  <Card key={g.id} title={g.title} className="yx-set-group-card">
                    <p className="yx-set-helper">{g.summary}</p>
                    {pages.length ? (
                      <ul>
                        {g.pages.map((p) =>
                          can(p.id) ? (
                            <li key={p.id}>
                              <a href={`#settings/${p.id}`} onClick={(e) => (e.preventDefault(), onOpen?.(p.id))}>
                                {p.title}
                              </a>
                            </li>
                          ) : null,
                        )}
                      </ul>
                    ) : (
                      <p className="yx-set-helper">You can't manage any page in this group. Ask {g.pages[0]?.permissionHolder ?? 'your System Admin'} for access.</p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </Frame>
  );
}

/* ============================== Group page ============================== */

/** Live (S-1): `groups` holds only the pages the viewer may open; a group with none of them shows no access. */
export function SettingsGroupScreen({ groups, groupId, state = 'ready', onOpen, live }: { groups: SettingsGroupDef[]; groupId: number; state?: LoadState; onOpen?: (pageId: string) => void; live?: LiveSettingsNav }) {
  const g = groups.find((x) => x.id === groupId);
  if (!g && state === 'loading')
    return (
      <Frame groups={groups}>
        <SettingsSkeleton />
      </Frame>
    );
  if (!g || state === 'no-access')
    return (
      <Frame groups={groups}>
        <NoAccessState grantedBy="your System Admin" what="the pages of this settings group" />
      </Frame>
    );
  return (
    <Frame groups={groups}>
      <PageHeader
        breadcrumbs={live ? undefined : <Breadcrumbs items={[{ label: 'Settings', href: '#settings' }, { label: g.title }]} />}
        title={g.title}
        description={g.summary}
        facts={`${g.pages.length} page${g.pages.length === 1 ? '' : 's'}${live ? ' you can open' : ''}`}
      />
      {state === 'loading' && <SettingsSkeleton />}
      {state === 'error' && <ErrorState title={`We couldn't load ${g.title}.`} description="Retry in a moment. Your saved settings are safe." onRetry={live?.onRetry ?? (() => {})} reference="SET-G4A09" />}
      {state === 'ready' && (
        <ul className={live ? 'yx-set-pages yx-set-pages--live' : 'yx-set-pages'}>
          {g.pages.map((p) => {
            const starters = allSettings(p).filter((d) => d.starter).length;
            return live ? (
              <li key={p.id} className="yx-set-page-row">
                <a className="yx-set-page-row__title" {...liveLink(live, live.pageHref(p.id))}>
                  {p.title}
                </a>
                <span className="yx-set-page-row__meta">{p.summary}</span>
              </li>
            ) : (
              <li key={p.id} className="yx-set-page-row">
                <a className="yx-set-page-row__title" href={`#settings/${p.id}`} onClick={(e) => (e.preventDefault(), onOpen?.(p.id))}>
                  {p.title}
                </a>
                <span>
                  {starters > 0 ? (
                    <Badge tone="warning">
                      {starters} setting{starters === 1 ? '' : 's'} to review
                    </Badge>
                  ) : (
                    <Badge tone="success">All reviewed</Badge>
                  )}
                </span>
                <span className="yx-set-page-row__meta">{p.summary}</span>
                <span className="yx-set-page-row__meta">
                  Last changed by {p.lastChange.by} on {formatStamp(p.lastChange.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Frame>
  );
}

/* ============================== Settings page (form) ============================== */

export type SaveOutcome = 'ok' | 'fail';

/**
 * A settings page with real data (Settings 6.1 Hiring first). The page is the designed page with the company's values
 * (fields with no setting behind them yet are left out by the caller). Saving is the API's; done is a toast (5 s), a
 * refusal stays on the page with its reason.
 */
export interface LiveSettingsPage {
  page: SettingsPageDef;
  /** The viewer holds the page's key: otherwise every value is read-only. */
  canEdit: boolean;
  /** Who changed the page last (none yet: not shown). */
  lastChange: LastChange | null;
  /** Answer 1326: the page's earlier changes (the last 20 with lastChange), newest first. */
  history?: HistoryEntry[];
  /** Answer 1724: "See all in the audit log" in the history drawer, for those who may read the audit log. */
  auditHref?: string;
  state?: LoadState;
  onRetry?: () => void;
  /** The changed values (by setting key) and the edited lists (rows by key). Rejects with a plain message. */
  /** `overrides`: values changed while a "Different for" scope was chosen (answer 495), as key, scope label and value. */
  onSave: (values: Record<string, SettingValue>, rows: Record<string, string[][]>, overrides?: { key: string; scope: string; value: SettingValue }[], appliesFrom?: string) => Promise<void>;
  /** Settings S-7 (answer 1562): the page has dated settings; their changes apply from this day (today by default). */
  appliesFrom?: { today: string };
  /** Settings S-7: what the page shows besides its settings (2.2: the Special data erasure report). */
  extra?: React.ReactNode;
  /** list kind: a row's extra button (`rowAction`), e.g. Stage targets of a pipeline. */
  onRowAction?: (key: string, rowIndex: number) => void;
  /**
   * list kind, by setting key: Add and each row's Edit open the caller's editor (e.g. scorecard templates, saved through
   * their own API at once) instead of the row drawer. Pass a key only when the viewer may change that list.
   */
  listEditors?: Record<string, (rowIndex: number | 'new') => void>;
  onOpenScreen?: (screenId: string) => void;
  /** Title of the success toast. */
  savedTitle?: string;
  /** state 'mfa': opens My security, where the second factor is added. */
  onSetUpMfa?: () => void;
  /** Answer 1325: saving sends the changes to a second person instead; nothing changes until they approve. */
  secondPerson?: boolean;
  /** Answer 1325: changes waiting for a second person (mine: the viewer asked, so they may only withdraw it). */
  pending?: { id: string; label: string; from: string; to: string; by: string; at: string; mine: boolean }[];
  onApprove?: (id: string) => Promise<void>;
  onReject?: (id: string) => Promise<void>;
}

export interface SettingsPageScreenProps {
  groups: SettingsGroupDef[];
  pageId: string;
  /** Viewer lacks the page's permission: every value read-only, no save bar, Request access offered. */
  readOnly?: boolean;
  /** Start with edits already made (dirty / invalid stories). */
  defaultDraft?: Draft;
  /** Deep link from settings search: outline this field. */
  highlightKey?: string;
  state?: LoadState;
  /** Scope being edited, e.g. "Hosur plant" (page must list scopes). */
  defaultScope?: string;
  history?: HistoryEntry[];
  /** Simulated save result (stories); real app calls the API. */
  saveOutcome?: SaveOutcome;
  /** Show the validation summary immediately (invalid story). */
  defaultShowErrors?: boolean;
  onOpenScreen?: (screenId: string) => void;
  live?: LiveSettingsPage;
}

export function SettingsPageScreen({
  groups,
  pageId,
  readOnly,
  defaultDraft,
  highlightKey,
  state = 'ready',
  defaultScope,
  history,
  saveOutcome = 'ok',
  defaultShowErrors,
  onOpenScreen,
  live,
}: SettingsPageScreenProps) {
  const found = findPage(groups, pageId);
  const group = found.group;
  const page = live?.page ?? found.page;
  if (live) {
    history = live.history;
    readOnly = !live.canEdit;
    state = live.state ?? 'ready';
    onOpenScreen = live.onOpenScreen;
  }
  const lastChange = live ? live.lastChange : page.lastChange;
  return (
    <Frame groups={groups} pageId={pageId}>
      <PageHeader
        breadcrumbs={live ? undefined : <Breadcrumbs items={[{ label: 'Settings', href: '#settings' }, { label: group.title, href: `#settings/group/${group.id}` }, { label: page.title }]} />}
        title={page.title}
        description={page.summary}
        status={readOnly && state !== 'no-access' ? <Badge tone="neutral">View only</Badge> : undefined}
        facts={lastChange ? <AuditLine compact change={lastChange} history={history} auditHref={live?.auditHref} /> : undefined}
      />
      {state === 'no-access' && <NoAccessState grantedBy="your System Admin" what={`${page.title} settings`} />}
      {state === 'mfa' && (
        <EmptyState
          icon={<Icon icon={KeyRound} size="md" />}
          title="Add a passkey or an authenticator app to open this page"
          description="Your company asks for a second step at sign-in before its admin pages open. Set it up once in My security, then come back here."
          action={live?.onSetUpMfa ? <Button variant="primary" onClick={live.onSetUpMfa}>Set it up</Button> : undefined}
        />
      )}
      {state === 'loading' && <SettingsSkeleton />}
      {state === 'error' && (
        <ErrorState title={`We couldn't load ${page.title}.`} description="Retry in a moment. Nothing has changed on this page." onRetry={live?.onRetry ?? (() => {})} reference="SET-P3E77" />
      )}
      {state === 'ready' && (
        <SettingsForm
          live={live}
          key={page.id}
          page={page}
          readOnly={readOnly}
          defaultDraft={defaultDraft}
          highlightKey={highlightKey}
          defaultScope={defaultScope}
          history={history}
          saveOutcome={saveOutcome}
          defaultShowErrors={defaultShowErrors}
          onOpenScreen={onOpenScreen}
        />
      )}
    </Frame>
  );
}

/** Answer 1325: the changes waiting for a second person. The person who asked may only withdraw; anyone else approves or rejects. */
function PendingChanges({ live }: { live: LiveSettingsPage }) {
  const toaster = useToastIfAny();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    setFailed(null);
    try {
      await fn();
      toaster?.toast({ tone: 'success', title: done });
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title="Waiting for a second person">
      {failed && <InlineAlert tone="danger" title={failed} />}
      <ul className="yx-set-pending">
        {live.pending!.map((p) => (
          <li key={p.id} className="yx-set-pending__row">
            <span className="yx-set-pending__what">
              <span>
                <strong>{p.label}</strong>: {p.from} → {p.to}
              </span>
              <span className="yx-set-helper">
                Asked by {p.mine ? 'you' : p.by} on {formatDate(parseIso(p.at.slice(0, 16)))}
              </span>
            </span>
            <span className="yx-set-pending__actions">
              {p.mine ? (
                live.onReject && (
                  <Button size="sm" loading={busy === `w${p.id}`} onClick={() => void act(`w${p.id}`, () => live.onReject!(p.id), 'Change withdrawn')}>
                    Withdraw
                  </Button>
                )
              ) : (
                <>
                  {live.onReject && (
                    <Button size="sm" loading={busy === `r${p.id}`} onClick={() => void act(`r${p.id}`, () => live.onReject!(p.id), 'Change rejected')}>
                      Reject
                    </Button>
                  )}
                  {live.onApprove && (
                    <Button size="sm" variant="primary" loading={busy === `a${p.id}`} onClick={() => void act(`a${p.id}`, () => live.onApprove!(p.id), 'Change approved and applied')}>
                      Approve
                    </Button>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** "Showing rules for: Earned leave ▾" above the sections that hold one leave type's rules. */
function TypePicker({ tp, picked, onPick }: { tp: NonNullable<SettingsPageDef['typePicker']>; picked: string; onPick: (v: string) => void }) {
  return (
    <div className="yx-set-toolbar">
      <FormField label={tp.label}>
        <Select value={picked} onChange={(v) => v && onPick(v)} options={tp.options.map((o) => ({ value: o, label: o }))} />
      </FormField>
    </div>
  );
}

const sectionId = (title: string) => `set-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
/** Consecutive links go in one list, consecutive legal values in one table; everything else stays one per run. */
const groupable = (d: SettingDef) => d.kind === 'link' || (d.kind === 'law' && !d.builtIn);
function runs(defs: SettingDef[]): SettingDef[][] {
  const out: SettingDef[][] = [];
  for (const d of defs) {
    const last = out[out.length - 1];
    if (last && groupable(d) && last[0].kind === d.kind && groupable(last[0])) last.push(d);
    else out.push([d]);
  }
  return out;
}

type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; approval: boolean } | { kind: 'failed'; message?: string };

function SettingsForm({
  page,
  readOnly,
  defaultDraft,
  highlightKey,
  defaultScope,
  history,
  saveOutcome,
  defaultShowErrors,
  onOpenScreen,
  live,
}: Omit<SettingsPageScreenProps, 'groups' | 'pageId' | 'state'> & { page: SettingsPageDef }) {
  const toaster = useToastIfAny();
  const base = useMemo(() => initialDraft(page), [page]);
  const [draft, setDraft] = useState<Draft>({ ...base, ...defaultDraft });
  const defsAll = allSettings(page);
  const overrideScopes = [...new Set(defsAll.flatMap((d) => d.overrides?.map((o) => o.scope) ?? []))];
  const [picked, setPicked] = useState(page.typePicker?.options[0] ?? '');
  const [rows, setRows] = useState<Record<string, string[][]>>({});
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  // Walk-through 10 Nov 2026: the save bar is at the bottom of long pages, so a failed save scrolls its message into view.
  const failedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status.kind !== 'failed' || !failedRef.current) return;
    failedRef.current.scrollIntoView?.({ block: 'center' });
    failedRef.current.focus({ preventScroll: true });
  }, [status]);
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [scope, setScope] = useState(defaultScope ?? page.scopes?.[0] ?? 'Company');
  const [appliesFrom, setAppliesFrom] = useState(live?.appliesFrom?.today ?? '');
  const [requested, setRequested] = useState(false);

  const changed = changedKeys(page, draft);
  const datedChanged = Boolean(live?.appliesFrom) && defsAll.some((d) => d.dated && (changed.includes(d.key) || Object.keys(draft).some((k) => k.startsWith(`${d.key}@`))));
  // Edits made while a "Different for" scope is chosen are kept as key@scope.
  const overrideOf = (d: SettingDef) => d.overrides?.find((o) => o.scope === scope);
  const overrideEdits = Object.keys(draft).filter((k) => {
    if (!k.includes('@')) return false;
    const [key, sc] = k.split('@');
    const d = defsAll.find((x) => x.key === key);
    const o = d?.overrides?.find((x) => x.scope === sc);
    // S-7 (answer 1484): a first value of its own counts once it differs from the company value it started from.
    if (o == null) return Boolean(d?.scopeable?.includes(sc!)) && JSON.stringify(draft[k]) !== JSON.stringify(d?.value ?? null);
    return JSON.stringify(draft[k]) !== JSON.stringify(o.value);
  }).length;
  const listChanged = Object.keys(rows).length + overrideEdits;
  const dirty = changed.length + listChanged > 0;
  useUnsavedChangesGuard(dirty && !readOnly);
  const errors = validateDraft(page, draft);
  const errorList = Object.entries(errors).map(([k, message]) => ({ fieldId: `setting-${k}`, message }));
  const saveErrors = useSaveErrors(errorList, defaultShowErrors);
  const defs = allSettings(page);
  const sensitiveChanged = defs.some((d) => d.sensitive && changed.includes(d.key));
  // Live, the API decides (answer 1325); the drawing's rule (group 4) is for the stories.
  const approval = live ? Boolean(live.secondPerson) : needsSecondApprover(page);

  const doSave = async () => {
    setStatus({ kind: 'saving' });
    if (live) {
      try {
        const overrides = Object.keys(draft)
          .filter((k) => k.includes('@'))
          .map((k) => {
            const [key, sc] = k.split('@') as [string, string];
            return { key, scope: sc, value: draft[k] ?? null, was: defsAll.find((d) => d.key === key)?.overrides?.find((x) => x.scope === sc)?.value };
          })
          .filter((o) => JSON.stringify(o.value) !== JSON.stringify(o.was ?? null))
          .map(({ key, scope: sc, value }) => ({ key, scope: sc, value }));
        await live.onSave(Object.fromEntries(changed.map((k) => [k, draft[k] ?? null])), rows, overrides, live.appliesFrom ? appliesFrom : undefined);
        setRows({});
        setStatus({ kind: 'idle' });
        toaster?.toast(
          approval
            ? { tone: 'success', title: 'Sent for approval', description: "Nothing changes until another person with HR's settings key approves it." }
            : { tone: 'success', title: live.savedTitle ?? 'Settings saved', description: 'Recorded in the audit log with before and after values.' },
        );
      } catch (e) {
        setStatus({ kind: 'failed', message: e instanceof Error && e.message ? e.message : undefined });
      }
      return;
    }
    await Promise.resolve();
    setStatus(saveOutcome === 'fail' ? { kind: 'failed' } : { kind: 'saved', approval });
  };
  // Who a change reaches: the whole company or just the location being overridden.
  const affected = scope.includes('Hosur') ? 118 : 248;
  const impact = defs
    .filter((d) => changed.includes(d.key))
    .map((d) => ({
      label: d.label,
      from: formatValue(d, d.value ?? null),
      to: formatValue(d, draft[d.key] ?? null),
      when: d.dated ? `from ${formatDate(parseIso(d.dated.validFrom))}` : approval ? 'once approved' : 'straight away',
    }));
  const [confirmImpact, setConfirmImpact] = useState(false);
  // Save bar at the end of the page; while it's out of view a small pill offers Save (founder review 30 Sep 2026).
  const barRef = useRef<HTMLDivElement>(null);
  const [barInView, setBarInView] = useState(typeof IntersectionObserver === 'undefined');
  const showBar = !readOnly && (dirty || status.kind === 'saving' || status.kind === 'failed');
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setBarInView(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [showBar]);
  const save = () => {
    if (errorList.length) return saveErrors.reveal();
    saveErrors.reset();
    if (sensitiveChanged) setConfirmSensitive(true);
    else if (approval) setConfirmImpact(true);
    else void doSave();
  };
  const discard = () => {
    setDraft(base);
    setRows({});
    saveErrors.reset();
    setStatus({ kind: 'idle' });
  };

  const field = (d: SettingDef) => {
    if (d.showWhen && (draft[d.showWhen.key] ?? null) !== d.showWhen.equals) return null;
    const ov = overrideOf(d);
    const dk = ov || (live && d.scopeable?.includes(scope) && scope !== (page.scopes?.[0] ?? 'Company')) ? `${d.key}@${scope}` : d.key;
    const shown: SettingDef = ov
      ? { ...d, scope: `Overridden for ${scope}`, overrides: undefined, dated: ov.validFrom ? { validFrom: ov.validFrom } : d.dated, starter: false }
      : scope !== (page.scopes?.[0] ?? 'Company') && !d.scope
        ? { ...d, scope: 'Inherited from Kaveri Foods Pvt Ltd' }
        : d;
    // Answer 495 (live): with another scope chosen, a setting that is one value for the company is shown, not changed.
    const companyOnly = Boolean(live) && !ov && scope !== (page.scopes?.[0] ?? 'Company') && !d.scopeable?.includes(scope);
    // S-7 (answer 1484): a first value of its own here starts from the company value.
    const own = !ov && !companyOnly && scope !== (page.scopes?.[0] ?? 'Company');
    return (
    <SettingField
      key={d.key}
      def={shown}
      value={ov ? (draft[dk] ?? ov.value) : own ? (draft[dk] ?? draft[d.key] ?? d.value ?? null) : (draft[d.key] ?? d.value ?? null)}
      onPickOverride={(sc) => setScope(sc)}
      onChange={(v) => {
        setDraft((x) => ({ ...x, [dk]: v }));
        if (status.kind !== 'saving') setStatus({ kind: 'idle' });
      }}
      error={saveErrors.errorOf(`setting-${d.key}`) ?? null}
      readOnly={readOnly || companyOnly}
      highlighted={highlightKey === d.key}
      onResetScope={() => setDraft((x) => ({ ...x, [d.key]: d.value ?? null }))}
      rows={rows[d.key]}
      onRowsChange={(r) => setRows((x) => ({ ...x, [d.key]: r }))}
      onOpenLink={onOpenScreen}
      onRowAction={live?.onRowAction ? (i) => live.onRowAction!(d.key, i) : undefined}
      onListEdit={live?.listEditors?.[d.key]}
    />
    );
  };
  // Emergency controls (danger sections) always come last.
  const sections = [...page.sections.filter((x) => x.tone !== 'danger'), ...page.sections.filter((x) => x.tone === 'danger')];

  return (
    <div className="yx-set-page">
      {readOnly && (
        <InlineAlert
          tone="info"
          title="You can view these settings but not change them"
          actions={
            live ? undefined : (
              <Button size="sm" icon={KeyRound} disabled={requested} onClick={() => setRequested(true)}>
                {requested ? 'Access requested' : 'Request access'}
              </Button>
            )
          }
        >
          Only the {page.permissionHolder} can change this page.
          {requested && ` Your request went to ${page.permissionHolder}. You'll get a notification when they decide.`}
        </InlineAlert>
      )}
      {page.note && <InlineAlert tone={approval ? 'warning' : 'info'}>{page.note}</InlineAlert>}
      {page.scopes && page.scopes.length > 1 && (
        <div className="yx-set-toolbar">
          <FormField label="Apply changes to" helper="Anything you don't change here keeps the value from the level above.">
            <Select value={scope} onChange={(v) => v && setScope(v)} options={[...new Set([...page.scopes, ...overrideScopes])].map((s) => ({ value: s, label: s }))} disabled={readOnly} />
          </FormField>
        </div>
      )}
      {datedChanged && !readOnly && (
        <div className="yx-set-toolbar">
          <FormField label="Applies from" helper="Dated settings change from this day; earlier days keep the value they had.">
            <DatePicker value={appliesFrom ? parseIso(appliesFrom) : null} onChange={(d) => d && setAppliesFrom(isoOf(d))} />
          </FormField>
        </div>
      )}
      {scope !== (page.scopes?.[0] ?? 'Company') && (
        <InlineAlert tone="info" title={`You're editing overrides for ${scope}`}>
          Values without an override show "Inherited from Kaveri Foods Pvt Ltd". Use Reset on a field to go back to the inherited value.
        </InlineAlert>
      )}
      {live?.pending && live.pending.length > 0 && <PendingChanges live={live} />}
      {live?.extra}
      <ErrorSummary errors={saveErrors.shownErrors} />
      {status.kind === 'saved' && (
        <InlineAlert tone="success" title={status.approval ? 'Changes sent for approval' : 'Changes saved'}>
          {status.approval
            ? 'A second approver must approve these changes before they apply. They are recorded in the audit log with before and after values.'
            : 'The change is recorded in the audit log with before and after values.'}
        </InlineAlert>
      )}
      {status.kind === 'failed' && (
        <div ref={failedRef} tabIndex={-1}>
          <InlineAlert tone="danger" title="We couldn't save your changes" actions={<Button size="sm" onClick={() => void doSave()}>Retry</Button>}>
            {status.message ? `${status.message} Your edits are kept on this page.` : 'Your edits are kept on this page. Retry, or copy reference SET-S91B2 for support.'}
          </InlineAlert>
        </div>
      )}

      {/* Long pages get a jump list (founder review 30 Sep 2026). */}
      {sections.length >= 4 && (
        <nav className="yx-set-jump" aria-label="On this page">
          <span className="yx-set-helper">On this page</span>
          {sections.map((s) => (
            <a
              key={s.title}
              className="yx-set-jump__link"
              href={`#${sectionId(s.title)}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(sectionId(s.title))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {s.title}
            </a>
          ))}
        </nav>
      )}
      <div className="yx-set-page__sections">
        {sections.map((s) => {
          const tp = page.typePicker;
          const inPicker = tp?.sections.includes(s.title);
          const firstPicked = inPicker && tp!.sections[0] === s.title;
          if (inPicker && picked !== tp!.options[0])
            return firstPicked ? (
              <section key={s.title} className="yx-set-section" aria-label={`${picked} rules`}>
                <TypePicker tp={tp!} picked={picked} onPick={setPicked} />
                <InlineAlert
                  tone="info"
                  title={`${picked} rules are in the leave type editor`}
                  actions={
                    <Button size="sm" onClick={() => onOpenScreen?.(tp!.editorScreenId)}>
                      {tp!.editorLabel}
                    </Button>
                  }
                >
                  Crediting, request rules and year end for {picked.toLowerCase()} are set there, with a live example.
                </InlineAlert>
              </section>
            ) : null;
          const wide = s.settings.some((d) => d.kind === 'list');
          return (
            <section key={s.title} id={sectionId(s.title)} className="yx-set-section" data-wide={wide || undefined} data-tone={s.tone} aria-label={s.title}>
              {firstPicked && <TypePicker tp={tp!} picked={picked} onPick={setPicked} />}
              <div>
                <h2 className="yx-card__title">{inPicker ? `${picked} · ${s.title.toLowerCase()}` : s.title}</h2>
                {s.description && <p className="yx-set-helper">{s.description}</p>}
              </div>
              <div className="yx-set-section__body">
                {runs(s.settings).map((run) =>
                  run[0].kind === 'link' && run.length > 1 ? (
                    <div key={run[0].key} className="yx-set-links">
                      {run.map(field)}
                    </div>
                  ) : run[0].kind === 'law' && run.length >= 3 ? (
                    <LawTable key={run[0].key} defs={run} highlightKey={highlightKey} />
                  ) : (
                    run.map(field)
                  ),
                )}
              </div>
            </section>
          );
        })}
      </div>


      {page.related && page.related.length > 0 && (
        <p className="yx-set-helper">
          Related:{' '}
          {page.related.map((r, i) => (
            <Fragment key={r.screenId}>
              {i > 0 && ' · '}
              <a className="yx-link" href={`#screen/${r.screenId}`} onClick={(e) => (e.preventDefault(), onOpenScreen?.(r.screenId))}>
                {r.label}
              </a>
            </Fragment>
          ))}
        </p>
      )}

      {showBar && !barInView && (
        <div className="yx-set-pill" role="region" aria-label="Unsaved changes">
          <span>
            {changed.length + listChanged} change{changed.length + listChanged === 1 ? '' : 's'} unsaved
          </span>
          <Button size="sm" variant="primary" onClick={save}>
            {approval ? 'Send for approval' : 'Save changes'}
          </Button>
        </div>
      )}
      {/* Only once something changed; stays while saving or after a failed save. */}
      {showBar && (
        <StickySaveBar dirty={dirty} ref={barRef}>
          <span className="yx-set-impact">
            {changed.length + listChanged} change{changed.length + listChanged === 1 ? '' : 's'}{live ? '' : ` · affects ${affected} employees`}
          </span>
          <Button onClick={discard} disabled={!dirty || status.kind === 'saving'}>
            Discard changes
          </Button>
          <Button variant="primary" icon={sensitiveChanged ? Lock : undefined} onClick={save} loading={status.kind === 'saving'} disabled={!dirty}>
            {approval ? 'Send for approval' : 'Save changes'}
          </Button>
        </StickySaveBar>
      )}
      <ConfirmDialog
        open={confirmImpact}
        onOpenChange={setConfirmImpact}
        title={`Send ${impact.length + listChanged} change${impact.length + listChanged === 1 ? '' : 's'} for approval?`}
        consequence={live ? "Another person with HR's settings key approves them; they apply then. The approver sees the same summary." : `Affects ${affected} employees. The approver sees the same summary.`}
        confirmLabel="Send for approval"
        onConfirm={doSave}
      >
        <ul className="yx-set-impact-list">
          {impact.map((c) => (
            <li key={c.label}>
              <strong>{c.label}</strong>: {c.from} → {c.to} <span className="yx-set-helper">({c.when})</span>
            </li>
          ))}
          {listChanged > 0 && <li>{listChanged} table{listChanged === 1 ? '' : 's'} edited</li>}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmSensitive}
        onOpenChange={setConfirmSensitive}
        title="Save this high-impact change?"
        consequence={`${defs.filter((d) => d.sensitive && changed.includes(d.key)).map((d) => d.label).join(', ')} is a high-impact change: it can stop people clocking in or change their pay. You'll be asked to confirm it's you, and the change is audited.`}
        confirmLabel="Confirm and save"
        onConfirm={doSave}
      />
    </div>
  );
}
