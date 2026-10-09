// Settings map screens (APX-D §3): settings home with search (P01 §4.6), group pages, and the settings page form.
// Every page renders from its SettingsPageDef: real fields from the owning doc, starter defaults (D17), legal floors,
// source scope, save bar, "Last changed by", read-only for people without the page's permission.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { ConfirmDialog } from '../../components/overlay';
import { ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { ErrorSummary, FormField, StickySaveBar, useUnsavedChangesGuard, useSaveErrors } from '../../components/field';
import { Breadcrumbs, Card, PageHeader } from '../../components/shell';
import { Select } from '../../components/select';
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
import type { SettingDef, SettingsGroupDef, SettingsPageDef } from './settings-types';
import './settings.css';

export type LoadState = 'ready' | 'loading' | 'error';

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
}

/** Last changes, newest first (from the audit log). */
const RECENT_CHANGES = [
  { what: 'Probation length', from: '3 months', to: '6 months', who: 'Lakshmi Venkatesan', when: '12 Sep', pageId: '2.5' },
  { what: 'Hotel limit, Tier 2 cities', from: '₹4,000', to: '₹4,500 a night', who: 'Suresh Pillai', when: '9 Sep', pageId: '4.8' },
  { what: 'Grace time for late check-in', from: '15 min', to: '10 min', who: 'Lakshmi Venkatesan', when: '2 Sep', pageId: '3.5' },
  { what: 'Employee privacy notice', from: 'v2', to: 'v3', who: 'Lakshmi Venkatesan', when: '14 Jul', pageId: '2.2' },
  { what: 'PF wage ceiling', from: 'Actual basic', to: '₹15,000', who: 'Suresh Pillai', when: '1 Jul', pageId: '4.7' },
];

export function SettingsHomeScreen({ groups, defaultQuery = '', manageable, state = 'ready', onOpen, setupNeeded }: SettingsHomeScreenProps) {
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
        description="Every company policy has one place to change it. Values marked Starter default came from the YukthiX starter template and are yours to edit."
        facts={`${groups.length} groups · ${total} pages · Kaveri Foods Pvt Ltd`}
      />
      {state === 'loading' && <SettingsSkeleton />}
      {state === 'error' && <ErrorState title="We couldn't load settings." description="Check your connection and retry. Nothing you saved is lost." onRetry={() => {}} reference="SET-7F21C" />}
      {state === 'ready' && (
        <>
          <SettingsSearchBox value={query} onChange={setQuery} />
          {!query.trim() && setupNeeded && (
            <InlineAlert tone="warning" title="Set-up needed: 3 modules are not ready for go-live" actions={<Button size="sm">Open set-up hub</Button>}>
              Payroll bank details, leave year and the holiday calendar for Hosur plant are incomplete.
            </InlineAlert>
          )}
          {!query.trim() && (
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
          <SearchResults results={results} query={query} onClear={() => setQuery('')} onOpen={(r) => onOpen?.(r.pageId, r.isPage ? undefined : r.key)} />
          {!query.trim() && (
            <div className="yx-set-groups">
              {groups.map((g) => {
                const pages = g.pages.filter((p) => can(p.id));
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

export function SettingsGroupScreen({ groups, groupId, state = 'ready', onOpen }: { groups: SettingsGroupDef[]; groupId: number; state?: LoadState; onOpen?: (pageId: string) => void }) {
  const g = groups.find((x) => x.id === groupId)!;
  return (
    <Frame groups={groups}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Settings', href: '#settings' }, { label: g.title }]} />}
        title={g.title}
        description={g.summary}
        facts={`${g.pages.length} pages`}
      />
      {state === 'loading' && <SettingsSkeleton />}
      {state === 'error' && <ErrorState title={`We couldn't load ${g.title}.`} description="Retry in a moment. Your saved settings are safe." onRetry={() => {}} reference="SET-G4A09" />}
      {state === 'ready' && (
        <ul className="yx-set-pages">
          {g.pages.map((p) => {
            const starters = allSettings(p).filter((d) => d.starter).length;
            return (
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
}: SettingsPageScreenProps) {
  const { group, page } = findPage(groups, pageId);
  return (
    <Frame groups={groups} pageId={pageId}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Settings', href: '#settings' }, { label: group.title, href: `#settings/group/${group.id}` }, { label: page.title }]} />}
        title={page.title}
        description={page.summary}
        status={readOnly ? <Badge tone="neutral">View only</Badge> : undefined}
        facts={page.lastChange ? <AuditLine compact change={page.lastChange} history={history} /> : undefined}
      />
      {state === 'loading' && <SettingsSkeleton />}
      {state === 'error' && (
        <ErrorState title={`We couldn't load ${page.title}.`} description="Retry in a moment. Nothing has changed on this page." onRetry={() => {}} reference="SET-P3E77" />
      )}
      {state === 'ready' && (
        <SettingsForm
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

type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; approval: boolean } | { kind: 'failed' };

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
}: Omit<SettingsPageScreenProps, 'groups' | 'pageId' | 'state'> & { page: SettingsPageDef }) {
  const base = useMemo(() => initialDraft(page), [page]);
  const [draft, setDraft] = useState<Draft>({ ...base, ...defaultDraft });
  const defsAll = allSettings(page);
  const overrideScopes = [...new Set(defsAll.flatMap((d) => d.overrides?.map((o) => o.scope) ?? []))];
  const [picked, setPicked] = useState(page.typePicker?.options[0] ?? '');
  const [rows, setRows] = useState<Record<string, string[][]>>({});
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [scope, setScope] = useState(defaultScope ?? page.scopes?.[0] ?? 'Company');
  const [requested, setRequested] = useState(false);

  const changed = changedKeys(page, draft);
  // Edits made while a "Different for" scope is chosen are kept as key@scope.
  const overrideOf = (d: SettingDef) => d.overrides?.find((o) => o.scope === scope);
  const overrideEdits = Object.keys(draft).filter((k) => {
    if (!k.includes('@')) return false;
    const [key, sc] = k.split('@');
    const o = defsAll.find((d) => d.key === key)?.overrides?.find((x) => x.scope === sc);
    return o != null && JSON.stringify(draft[k]) !== JSON.stringify(o.value);
  }).length;
  const listChanged = Object.keys(rows).length + overrideEdits;
  const dirty = changed.length + listChanged > 0;
  useUnsavedChangesGuard(dirty && !readOnly);
  const errors = validateDraft(page, draft);
  const errorList = Object.entries(errors).map(([k, message]) => ({ fieldId: `setting-${k}`, message }));
  const saveErrors = useSaveErrors(errorList, defaultShowErrors);
  const defs = allSettings(page);
  const sensitiveChanged = defs.some((d) => d.sensitive && changed.includes(d.key));
  const approval = needsSecondApprover(page);

  const doSave = async () => {
    setStatus({ kind: 'saving' });
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
    const dk = ov ? `${d.key}@${scope}` : d.key;
    const shown: SettingDef = ov
      ? { ...d, scope: `Overridden for ${scope}`, overrides: undefined, dated: ov.validFrom ? { validFrom: ov.validFrom } : d.dated, starter: false }
      : scope !== (page.scopes?.[0] ?? 'Company') && !d.scope
        ? { ...d, scope: 'Inherited from Kaveri Foods Pvt Ltd' }
        : d;
    return (
    <SettingField
      key={d.key}
      def={shown}
      value={ov ? (draft[dk] ?? ov.value) : (draft[d.key] ?? d.value ?? null)}
      onPickOverride={(sc) => setScope(sc)}
      onChange={(v) => {
        setDraft((x) => ({ ...x, [dk]: v }));
        if (status.kind !== 'saving') setStatus({ kind: 'idle' });
      }}
      error={saveErrors.errorOf(`setting-${d.key}`) ?? null}
      readOnly={readOnly}
      highlighted={highlightKey === d.key}
      onResetScope={() => setDraft((x) => ({ ...x, [d.key]: d.value ?? null }))}
      rows={rows[d.key]}
      onRowsChange={(r) => setRows((x) => ({ ...x, [d.key]: r }))}
      onOpenLink={onOpenScreen}
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
            <Button size="sm" icon={KeyRound} disabled={requested} onClick={() => setRequested(true)}>
              {requested ? 'Access requested' : 'Request access'}
            </Button>
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
            <Select value={scope} onChange={(v) => v && setScope(v)} options={[...page.scopes, ...overrideScopes].map((s) => ({ value: s, label: s }))} disabled={readOnly} />
          </FormField>
        </div>
      )}
      {scope !== (page.scopes?.[0] ?? 'Company') && (
        <InlineAlert tone="info" title={`You're editing overrides for ${scope}`}>
          Values without an override show "Inherited from Kaveri Foods Pvt Ltd". Use Reset on a field to go back to the inherited value.
        </InlineAlert>
      )}
      <ErrorSummary errors={saveErrors.shownErrors} />
      {status.kind === 'saved' && (
        <InlineAlert tone="success" title={status.approval ? 'Changes sent for approval' : 'Changes saved'}>
          {status.approval
            ? 'A second approver must approve these changes before they apply. They are recorded in the audit log with before and after values.'
            : 'The change is recorded in the audit log with before and after values.'}
        </InlineAlert>
      )}
      {status.kind === 'failed' && (
        <InlineAlert tone="danger" title="We couldn't save your changes" actions={<Button size="sm" onClick={() => void doSave()}>Retry</Button>}>
          Your edits are kept on this page. Retry, or copy reference SET-S91B2 for support.
        </InlineAlert>
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
            {changed.length + listChanged} change{changed.length + listChanged === 1 ? '' : 's'} · affects {affected} employees
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
        consequence={`Affects ${affected} employees. The approver sees the same summary.`}
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
        consequence={`${defs.filter((d) => d.sensitive && changed.includes(d.key)).map((d) => d.label).join(', ')} affects everyone in the company. You'll be asked to confirm it's you, and the change is audited.`}
        confirmLabel="Confirm and save"
        onConfirm={doSave}
      />
    </div>
  );
}
