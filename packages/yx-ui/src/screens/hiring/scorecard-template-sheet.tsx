// Settings 6.1 Hiring › Scorecard templates (founder answer 345): add, edit and archive a scorecard template from the
// settings page. The skills a panel rates, each with a weight in whole per cent (the weights add up to 100), the top of
// the rating scale and one pass bar. A template already used by a scorecard is never changed: saving makes a copy, so
// every past scorecard keeps the items it was scored on. Saved straight away through the scorecard templates API.
import { useState } from 'react';
import { Archive, Plus } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { DescriptionList } from '../../components/shell';
import type { Choice, ScorecardTemplateInput, ScorecardTemplateView } from './live/types';
import './hiring.css';

const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
const MAX_SKILLS = 30;

type Skill = { label: string; guidance: string; weight: number | null; competencyId: string | null };

/** Older templates (weights 1-10) open in per cent of their total, largest remainder first, so they still add up to 100. */
export function asPerCent(weights: number[]): number[] {
  const total = weights.reduce((t, w) => t + w, 0);
  if (!total || total === 100) return weights;
  const raw = weights.map((w) => (w * 100) / total);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < 100 - out.reduce((t, w) => t + w, 0); k++) out[order[k % order.length]![1]]! += 1;
  return out;
}

const badWeight = (w: number | null) => w == null || !Number.isInteger(w) || w < 1 || w > 100;

export interface ScorecardTemplateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null: a new scorecard. */
  template: ScorecardTemplateView | null;
  /** The competency library (M06), as starting skills. */
  competencies: Choice[];
  /** The viewer may change scorecards (the pipelines key, not acting for someone else); otherwise read-only. */
  canEdit: boolean;
  onSave?: (id: string | null, input: ScorecardTemplateInput) => Promise<unknown>;
  onArchive?: (id: string) => Promise<unknown>;
}

export function ScorecardTemplateSheet({ open, onOpenChange, template, competencies, canEdit, onSave, onArchive }: ScorecardTemplateSheetProps) {
  const toast = useToastIfAny();
  const copy = Boolean(template?.inUse);
  const [name, setName] = useState(template ? (copy ? `${template.name} (copy)` : template.name) : '');
  const [scale, setScale] = useState<number | null>(template?.scaleMax ?? 4);
  const [bar, setBar] = useState<number | null>(template?.passBar ?? 2.5);
  const [skills, setSkills] = useState<Skill[]>(() => {
    if (!template) return [{ label: '', guidance: '', weight: 100, competencyId: null }];
    const pc = asPerCent(template.items.map((i) => i.weight));
    return template.items.map((i, k) => ({ label: i.label, guidance: i.guidance ?? '', weight: pc[k]!, competencyId: i.competencyId }));
  });
  const [fromLib, setFromLib] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [libTried, setLibTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const total = skills.reduce((t, s) => t + (s.weight ?? 0), 0);
  const barBad = bar == null || scale == null || bar < 1 || bar > scale;
  const scaleBad = scale == null || scale < 3 || scale > 10;
  const set = (k: number, patch: Partial<Skill>) => setSkills((x) => x.map((y, i) => (i === k ? { ...y, ...patch } : y)));

  const save = async () => {
    setTried(true);
    setFailed(null);
    if (!name.trim()) return focus('sc-name');
    if (scaleBad) return focus('sc-scale');
    if (barBad) return focus('sc-bar');
    const bad = skills.findIndex((s) => !s.label.trim() || badWeight(s.weight));
    if (bad >= 0) return focus(skills[bad]!.label.trim() ? `sc-w${bad}` : `sc-l${bad}`);
    if (total !== 100) {
      setFailed(`The weights must add up to 100 per cent (now ${total}).`);
      return focus('sc-w0');
    }
    setBusy(true);
    try {
      await onSave?.(copy ? null : (template?.id ?? null), { name: name.trim(), scaleMax: scale!, passBar: bar!, items: skills.map((s) => ({ label: s.label.trim(), guidance: s.guidance.trim() || null, weight: s.weight!, competencyId: s.competencyId })) });
      toast?.toast({ tone: 'success', title: copy ? 'Scorecard copied' : 'Scorecard saved', description: 'New interviews use it from now on.' });
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const addSkill = () => {
    if (skills.length >= MAX_SKILLS) return setFailed(`A scorecard has up to ${MAX_SKILLS} skills.`);
    setSkills((x) => [...x, { label: '', guidance: '', weight: null, competencyId: null }]);
    focus(`sc-l${skills.length}`);
  };
  const addCompetency = () => {
    setLibTried(true);
    if (!fromLib) return focus('sc-lib');
    if (skills.filter((s) => s.label.trim()).length >= MAX_SKILLS) return setFailed(`A scorecard has up to ${MAX_SKILLS} skills.`);
    const c = competencies.find((x) => x.value === fromLib)!;
    setSkills((x) => [...x.filter((s) => s.label.trim()), { label: c.label, guidance: '', weight: null, competencyId: c.value }]);
    setFromLib(null);
    setLibTried(false);
  };

  const title = !template ? 'Add scorecard' : !canEdit ? template.name : copy ? `Copy ${template.name}` : `Edit ${template.name}`;
  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        subtitle="Scorecard templates"
        dirty={canEdit}
        footer={
          canEdit ? (
            <>
              {template && onArchive && (
                <Button variant="danger" icon={Archive} onClick={() => setArchiving(true)}>
                  Archive scorecard
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={() => void save()}>
                {copy ? 'Save as a copy' : 'Save scorecard'}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )
        }
      >
        <div className="yx-hire-stack">
          <Text as="p" size="sm" tone="secondary">
            The panel rates each skill on the scale. The result is the weighted average of the ratings; it passes when it reaches the pass bar. A person decides.
          </Text>
          {copy && canEdit && <InlineAlert tone="info" title="This scorecard has been used, so your changes are saved as a new copy. Past scorecards keep the old one." />}
          {failed && <InlineAlert tone="danger" title={failed} />}
          {canEdit ? (
            <>
              <FormField id="sc-name" label="Name" required error={tried && !name.trim() ? 'Enter the name.' : null}>
                <TextField value={name} onChange={setName} maxLength={120} />
              </FormField>
              <div className="yx-hire-actions">
                <FormField id="sc-scale" label="Rating scale: 1 to" required error={tried && scaleBad ? 'Enter 3 to 10.' : null}>
                  <NumberField value={scale} onChange={setScale} min={3} max={10} />
                </FormField>
                <FormField id="sc-bar" label="Pass bar" required helper="The weighted average a candidate must reach." error={tried && barBad ? `Enter 1 to ${scale ?? 'the top of the scale'}.` : null}>
                  <NumberField value={bar} onChange={setBar} min={1} max={10} decimals />
                </FormField>
              </div>
              {skills.map((s, k) => (
                <div key={k} className="yx-hire-actions">
                  <FormField id={`sc-l${k}`} label={`Skill ${k + 1}`} required error={tried && !s.label.trim() ? 'Enter what the panel rates.' : null}>
                    <TextField value={s.label} onChange={(v) => set(k, { label: v })} maxLength={200} />
                  </FormField>
                  <FormField id={`sc-w${k}`} label={`Weight ${k + 1} (%)`} required error={tried && badWeight(s.weight) ? 'Enter a whole per cent from 1 to 100.' : null}>
                    <NumberField value={s.weight} onChange={(v) => set(k, { weight: v })} min={1} max={100} />
                  </FormField>
                  <FormField id={`sc-g${k}`} label={`What good looks like ${k + 1}`} optional>
                    <TextField value={s.guidance} onChange={(v) => set(k, { guidance: v })} maxLength={1000} />
                  </FormField>
                  {skills.length > 1 && (
                    <div>
                      <Button size="sm" variant="danger" onClick={() => setSkills((x) => x.filter((_, i) => i !== k))}>
                        Remove skill {k + 1}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <div className="yx-hire-actions">
                <Badge tone={total === 100 ? 'success' : 'warning'}>{total === 100 ? 'Weights add up to 100 %' : `Weights add up to ${total} %, need 100 %`}</Badge>
                <Button size="sm" icon={Plus} onClick={addSkill}>
                  Add a skill
                </Button>
              </div>
              {competencies.length > 0 && (
                <div className="yx-hire-actions">
                  <FormField id="sc-lib" label="From the competency library" error={libTried && !fromLib ? 'Choose a competency.' : null}>
                    <Select value={fromLib} onChange={setFromLib} placeholder="Choose a competency" options={competencies} searchable />
                  </FormField>
                  <div>
                    <Button size="sm" onClick={addCompetency}>
                      Add competency
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            template && (
              <DescriptionList
                items={[
                  { label: 'Rating scale', value: `1–${template.scaleMax}` },
                  { label: 'Pass bar', value: `${template.passBar} of ${template.scaleMax}` },
                  ...template.items.map((i, k) => ({ label: i.label, value: `${asPerCent(template.items.map((x) => x.weight))[k]} %` })),
                ]}
              />
            )
          )}
        </div>
      </Drawer>
      {template && archiving && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setArchiving(false)}
          title={`Archive ${template.name}?`}
          consequence="It is no longer offered for new interviews, and jobs using it go back to no scorecard. Scorecards already filled keep it."
          confirmLabel="Archive scorecard"
          onConfirm={async () => {
            try {
              await onArchive?.(template.id);
              toast?.toast({ tone: 'success', title: 'Scorecard archived' });
              setArchiving(false);
              onOpenChange(false);
            } catch (e) {
              setArchiving(false);
              setFailed(e instanceof Error && e.message ? e.message : 'That did not archive. Try again.');
            }
          }}
        />
      )}
    </>
  );
}
