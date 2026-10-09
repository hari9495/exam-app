import { useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, useSaveErrors, type FormErrorItem } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card } from '../../components/shell';
import { Stepper } from '../../components/stepper';
import { MONTHS, OrgPage, useRun } from '../org/org-kit';
import { LANGUAGE_LABEL, type ChecklistItem, type CountryPack, type CountrySetup, type EntityDefaults, type GuideEntity, type Language, type LoadState, type NewEntityInput } from './types';

// Settings › Organisation › Countries (G1-GLOBAL-CORE-BUILD-DESIGN §8, gap pass G6): the "Add a country" guide.
// Country → legal entity → identifiers and registrations → working week and language → what is still open.
// Each step uses the country pack's defaults; the guide never writes identifiers or registrations itself, it
// links to their own screens and shows whether they are done.

export interface CountryGuideScreenProps {
  state: LoadState;
  onRetry?: () => void;
  countries: CountryPack[];
  setups: CountrySetup[];
  entities: GuideEntity[];
  /** The entity's working week and language as set now (absent: the starter values). */
  entityDefaults: Record<string, EntityDefaults>;
  /** org.settings.manage for the whole company. */
  canManage: boolean;
  onStart: (country: string) => Promise<CountrySetup>;
  onCreateEntity: (input: NewEntityInput) => Promise<{ id: string }>;
  onLinkEntity: (setupId: string, entityId: string, version: number) => Promise<CountrySetup>;
  onSaveDefaults: (entityId: string, defaults: EntityDefaults) => Promise<void>;
  onFinish: (setupId: string, version: number) => Promise<CountrySetup>;
  /** Reads the guides again ("Check again" after fixing an item on another screen). */
  onRefresh: () => Promise<void>;
}

const WEEKS = ['35', '37.5', '38', '40', '42', '44', '45', '48'];
const LANGS: Language[] = ['en', 'hi', 'ta', 'te'];

function Checklist({ items, label }: { items: ChecklistItem[]; label: string }) {
  if (!items.length) return <EmptyState compact title="Nothing to check here." />;
  return (
    <ul className="yx-glb__list" aria-label={label}>
      {items.map((i) => (
        <li key={i.key} className="yx-glb__item">
          <span className="yx-glb__item-main">
            <Badge tone={i.done ? 'success' : 'warning'}>{i.done ? 'Done' : 'Open'}</Badge>
            <Text>{i.label}</Text>
          </span>
          <Button size="sm" asChild>
            <a href={i.href} aria-label={`${i.done ? 'Open' : 'Fix'}: ${i.label}`}>
              {i.done ? 'Open' : 'Fix'}
            </a>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function PackFacts({ pack }: { pack: CountryPack }) {
  return (
    <dl className="yx-hist__facts">
      <dt>Currency</dt>
      <dd>{pack.currency}</dd>
      <dt>Financial year starts</dt>
      <dd>{MONTHS[pack.fyStartMonth - 1]}</dd>
      <dt>People data kept in</dt>
      <dd>{pack.dataRegion === 'IN' ? 'India' : pack.dataRegion}</dd>
      <dt>Full-time week</dt>
      <dd>{`${Number(pack.normalWeekHours)} hours (the legal limit; you can set a shorter one)`}</dd>
      <dt>Languages for people</dt>
      <dd>{pack.languages.map((l) => LANGUAGE_LABEL[l]).join(', ')}</dd>
      <dt>Registrations</dt>
      <dd>{pack.registrations.map((r) => r.replace(/^[A-Z]{2}\./, '')).join(', ')}</dd>
    </dl>
  );
}

/** The new entity's request body, or what to fix. */
export function newEntityInput(d: { name: string; shortName: string }, pack: CountryPack): { input: NewEntityInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (!d.name.trim()) errors.push({ fieldId: 'cg-name', message: 'Enter the registered name' });
  if (!/^[A-Za-z0-9][A-Za-z0-9 &.-]{0,29}$/.test(d.shortName.trim())) errors.push({ fieldId: 'cg-short', message: 'Short name: up to 30 letters, digits, spaces, & . or -' });
  if (errors.length) return { input: null, errors };
  return { input: { name: d.name.trim(), shortName: d.shortName.trim(), country: pack.country, currency: pack.currency, fyStartMonth: pack.fyStartMonth, dataRegion: pack.dataRegion }, errors };
}

function Guide(props: CountryGuideScreenProps & { initial: CountrySetup | null; onClose: () => void }) {
  const { countries, entities } = props;
  const [setup, setSetup] = useState<CountrySetup | null>(props.initial);
  const [country, setCountry] = useState<string | null>(props.initial?.country ?? (countries.length === 1 ? countries[0].country : null));
  const [current, setCurrent] = useState(props.initial ? (props.initial.legalEntity ? 'ids' : 'entity') : 'country');
  const [entityMode, setEntityMode] = useState<'new' | 'existing'>('new');
  const [entityDraft, setEntityDraft] = useState({ name: '', shortName: '' });
  const [existing, setExisting] = useState<string | null>(null);
  const entityId = setup?.legalEntity?.id ?? null;
  const saved = entityId ? props.entityDefaults[entityId] : undefined;
  const [defaults, setDefaults] = useState<EntityDefaults>(saved ?? { normalWeek: 'pack', language: 'en' });
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const { busy, error, run } = useRun();
  const pack = countries.find((c) => c.country === (setup?.country ?? country)) ?? null;
  const taken = new Set(props.setups.map((s) => s.legalEntity?.id).filter(Boolean));
  const candidates = entities.filter((e) => !e.archivedAt && e.country === pack?.country && !taken.has(e.id));
  const { input: newEntity, errors } = pack ? newEntityInput(entityDraft, pack) : { input: null, errors: [] as FormErrorItem[] };
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const latest = setup ? (props.setups.find((s) => s.id === setup.id) ?? setup) : null;
  const items = latest?.checklist ?? [];
  const link = (id: string) => run('entity', async () => {
    const next = await props.onLinkEntity(setup!.id, id, setup!.version);
    setSetup(next);
    setCurrent('ids');
  });
  const pick = countries.length >= 2 && countries.length <= 4;
  return (
    <Card title={pack ? `Add a country: ${pack.name}` : 'Add a country'} actions={<Button size="sm" onClick={props.onClose}>Close</Button>}>
      <div className="yx-glb__stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        <Stepper
          title="Add a country"
          current={current}
          onCurrentChange={setCurrent}
          continueBlocked={current === 'country' && !setup ? 'Start the guide first' : current === 'entity' && !entityId ? 'Choose or create the legal entity first' : undefined}
          finishLabel="Finish the guide"
          finishBlocked={!entityId ? 'Choose or create the legal entity first' : latest?.status === 'done' ? 'This guide is finished' : undefined}
          finishing={busy === 'finish'}
          onFinish={() =>
            void run('finish', async () => {
              const done = await props.onFinish(latest!.id, latest!.version);
              setSetup(done);
              props.onClose();
            })
          }
          steps={[
            {
              id: 'country',
              title: 'Country',
              description: 'Its rules come with it',
              status: setup ? 'done' : undefined,
              content: (
                <div className="yx-glb__stack">
                  {setup ? (
                    <InlineAlert tone="success">{`The guide for ${setup.countryName} is started.`}</InlineAlert>
                  ) : (
                    <FormField label="Country" required helper="Only countries with a YukthiX country pack can be chosen. Ask YukthiX for the next one.">
                      {pick ? (
                        <Segment label="Country" options={countries.map((c) => ({ value: c.country, label: c.name }))} value={country ?? ''} onChange={setCountry} />
                      ) : (
                        <Select value={country} onChange={setCountry} options={countries.map((c) => ({ value: c.country, label: c.name }))} aria-label="Country" />
                      )}
                    </FormField>
                  )}
                  {pack && <PackFacts pack={pack} />}
                  {pack?.verify && <InlineAlert tone="info">Our compliance team is still confirming some of these values with a chartered accountant.</InlineAlert>}
                  {!setup && (
                    <span>
                      <Button
                        variant="primary"
                        disabled={!country}
                        loading={busy === 'start'}
                        onClick={() =>
                          void run('start', async () => {
                            setSetup(await props.onStart(country!));
                            setCurrent('entity');
                          })
                        }
                      >
                        Start the guide
                      </Button>
                    </span>
                  )}
                </div>
              ),
            },
            {
              id: 'entity',
              title: 'Legal entity',
              description: 'Who employs people there',
              status: !setup ? 'locked' : entityId ? 'done' : undefined,
              statusNote: 'Start the guide first',
              content: (
                <div className="yx-glb__stack">
                  {entityId ? (
                    <InlineAlert tone="success">{`${setup!.legalEntity!.name} is set up through this guide.`}</InlineAlert>
                  ) : (
                    <>
                      {candidates.length > 0 && (
                        <FormField label="Legal entity">
                          <Segment label="Legal entity" options={[{ value: 'new' as const, label: 'Add a new one' }, { value: 'existing' as const, label: 'Use one we have' }]} value={entityMode} onChange={setEntityMode} />
                        </FormField>
                      )}
                      {entityMode === 'existing' && candidates.length > 0 ? (
                        <>
                          <FormField label="Which legal entity" required>
                            <Select value={existing} onChange={setExisting} options={candidates.map((e) => ({ value: e.id, label: `${e.name} · ${e.shortName}` }))} aria-label="Which legal entity" />
                          </FormField>
                          <span>
                            <Button variant="primary" disabled={!existing} loading={busy === 'entity'} onClick={() => void link(existing!)}>
                              Use this legal entity
                            </Button>
                          </span>
                        </>
                      ) : (
                        <>
                          <FormField id="cg-name" label="Registered name" required error={errorOf('cg-name')}>
                            <TextField value={entityDraft.name} onChange={(name) => setEntityDraft((d) => ({ ...d, name }))} maxLength={200} />
                          </FormField>
                          <FormField id="cg-short" label="Short name" required helper="Shown in lists and filters, e.g. KFPL." error={errorOf('cg-short')}>
                            <TextField value={entityDraft.shortName} onChange={(shortName) => setEntityDraft((d) => ({ ...d, shortName }))} maxLength={30} />
                          </FormField>
                          {pack && <Text as="p" tone="secondary">{`From the ${pack.name} pack: ${pack.currency}, financial year from ${MONTHS[pack.fyStartMonth - 1]}, people data kept in ${pack.dataRegion === 'IN' ? 'India' : pack.dataRegion}. You can add the address on Legal entities.`}</Text>}
                          <span>
                            <Button
                              variant="primary"
                              loading={busy === 'entity'}
                              onClick={() => {
                                if (!newEntity) return saveErrors.reveal();
                                void run('entity', async () => {
                                  const e = await props.onCreateEntity(newEntity);
                                  setSetup(await props.onLinkEntity(setup!.id, e.id, setup!.version));
                                  setCurrent('ids');
                                });
                              }}
                            >
                              Add legal entity
                            </Button>
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
              ),
            },
            {
              id: 'ids',
              title: 'Identifiers and registrations',
              description: 'Tax numbers and statutory registrations',
              status: !entityId ? 'locked' : items.some((i) => (i.key.startsWith('id:') || i.key.startsWith('reg:')) && !i.done) ? undefined : 'done',
              statusNote: 'Choose or create the legal entity first',
              content: (
                <div className="yx-glb__stack">
                  <Text as="p" tone="secondary">The tax numbers are kept on Legal entities (only people with the statutory key see them). Registrations are set in Payroll set-up. Come back and check again when they are done.</Text>
                  <Checklist label="Identifiers and registrations" items={items.filter((i) => i.key.startsWith('id:') || i.key.startsWith('reg:'))} />
                  <span>
                    <Button loading={busy === 'refresh'} onClick={() => void run('refresh', props.onRefresh)}>Check again</Button>
                  </span>
                </div>
              ),
            },
            {
              id: 'week',
              title: 'Working week and language',
              description: 'Full-time hours, people’s language',
              status: !entityId ? 'locked' : defaultsSaved ? 'done' : undefined,
              statusNote: 'Choose or create the legal entity first',
              content: (
                <div className="yx-glb__stack">
                  <FormField label="Full-time week" helper="Part-time jobs show their share (FTE) of this week.">
                    <Select
                      value={defaults.normalWeek}
                      onChange={(normalWeek) => {
                        if (!normalWeek) return;
                        setDefaults((d) => ({ ...d, normalWeek }));
                        setDefaultsSaved(false);
                      }}
                      options={[{ value: 'pack', label: pack ? `From the country pack (${Number(pack.normalWeekHours)} hours)` : 'From the country pack' }, ...WEEKS.map((w) => ({ value: w, label: `${w} hours` }))]}
                      aria-label="Full-time week"
                    />
                  </FormField>
                  <FormField label="Language for people in this entity" helper="Each person can still choose their own under Me › Language.">
                    <Segment label="Language for people in this entity" options={(pack?.languages ?? LANGS).map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))} value={defaults.language} onChange={(language) => {
                        setDefaults((d) => ({ ...d, language }));
                        setDefaultsSaved(false);
                      }} />
                  </FormField>
                  {defaultsSaved && <InlineAlert tone="success">Saved for this legal entity.</InlineAlert>}
                  <span>
                    <Button variant="primary" disabled={!entityId} loading={busy === 'defaults'} onClick={() =>
                        void run('defaults', async () => {
                          await props.onSaveDefaults(entityId!, defaults);
                          setDefaultsSaved(true);
                        })
                      }>
                      Save working week and language
                    </Button>
                  </span>
                </div>
              ),
            },
            {
              id: 'open',
              title: 'What is still open',
              description: 'Finish now, close the rest later',
              status: !entityId ? 'locked' : undefined,
              statusNote: 'Choose or create the legal entity first',
              content: (
                <div className="yx-glb__stack">
                  <Text as="p" tone="secondary">{items.filter((i) => !i.done).length ? 'You can finish now. The open items stay on this list until they are done.' : 'Everything is done.'}</Text>
                  <Checklist label="What is still open" items={items} />
                  <span>
                    <Button loading={busy === 'refresh'} onClick={() => void run('refresh', props.onRefresh)}>Check again</Button>
                  </span>
                </div>
              ),
            },
          ]}
        />
      </div>
    </Card>
  );
}

export function CountryGuideScreen(props: CountryGuideScreenProps) {
  const [open, setOpen] = useState<{ setup: CountrySetup | null } | null>(null);
  return (
    <OrgPage
      crumb="Countries"
      title="Countries"
      description="Each country your company employs people in, set up with its own rules. Add one in five short steps."
      state={props.state}
      onRetry={props.onRetry}
      what="your countries"
      actions={props.canManage && !open ? <Button variant="primary" onClick={() => setOpen({ setup: null })}>Add a country</Button> : undefined}
    >
      {open && <Guide {...props} initial={open.setup} onClose={() => setOpen(null)} />}
      <Card title="Your countries">
        {props.setups.length ? (
          <ul className="yx-glb__list" aria-label="Your countries">
            {props.setups.map((s) => (
              <li key={s.id} className="yx-glb__item">
                <span className="yx-glb__item-main">
                  <Text weight="medium">{`${s.countryName} · ${s.legalEntity?.name ?? 'no legal entity yet'}`}</Text>
                  <Badge tone={s.status === 'done' ? 'success' : 'info'}>{s.status === 'done' ? 'Set up' : 'In progress'}</Badge>
                  {s.open > 0 && <Badge tone="warning">{`${s.open} open`}</Badge>}
                </span>
                {props.canManage && <Button size="sm" onClick={() => setOpen({ setup: s })}>{s.status === 'done' ? 'See open items' : 'Continue'}</Button>}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="No country set up through the guide yet." description="Add a country to set up a legal entity there with the country's rules." />
        )}
      </Card>
    </OrgPage>
  );
}
