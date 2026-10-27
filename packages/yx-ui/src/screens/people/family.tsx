// PPL-03 Family and nominees, Emergency contacts (founder 22 Oct 2026): the two Overview cards and their edit
// drawers. Personal class (P02 §4.4): the caller shows them only to the person and HR with Personal access.
import { useState } from 'react';
import { AlertTriangle, ArrowUp, Check, Info, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Card } from '../../components/shell';
import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { Checkbox } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Select } from '../../components/select';
import { FormField } from '../../components/field';
import { NumberField, TextField } from '../../components/inputs';
import { Icon, Text } from '../../components/foundations';
import { formatPhone } from '../../lib/format';

export interface FamilyMember {
  /** Live id; a new member has none. */
  id?: string;
  name: string;
  relation: string;
  dateOfBirth: Date | null;
  dependant: boolean;
}
/** A nominee for one scheme: `member` indexes `members` (null: a joiner nomination naming someone not in the family list). */
export interface Nomination {
  scheme: string;
  member: number | null;
  name: string;
  share: number;
}
export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}
export interface RecordFamily {
  members: FamilyMember[];
  nominations: Nomination[];
  /** Schemes the person is covered by; one without a nominee shows a warning row. */
  expected: string[];
  contacts: EmergencyContact[];
  /** Only when the data shows it, e.g. "Marital status changed on 2 Feb 2020. Nominations were reviewed after that change." */
  note?: string | null;
  onEdit?: () => void;
  onEditContacts?: () => void;
}

export const SCHEMES = [
  { value: 'pf', label: 'PF' },
  { value: 'eps', label: 'EPS' },
  { value: 'gratuity', label: 'Gratuity' },
  { value: 'group_term', label: 'Group term insurance' },
];
const ORDER = [...SCHEMES.map((s) => s.value), 'all'];
export const schemeLabel = (s: string) => SCHEMES.find((x) => x.value === s)?.label ?? (s === 'all' ? 'All schemes' : s);

/** Whole years on `today`. */
export function ageOn(dob: Date, today: Date): number {
  const before = today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  return today.getFullYear() - dob.getFullYear() - (before ? 1 : 0);
}

/** One row per scheme with its nominees and share total; expected schemes nobody is nominated for ("all" covers every scheme). */
export function schemeRows(nominations: Nomination[], expected: string[]) {
  const schemes = [...new Set(nominations.map((n) => n.scheme))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const rows = schemes.map((scheme) => {
    const ns = nominations.filter((n) => n.scheme === scheme);
    // In hundredths, so 33.33 + 33.33 + 33.34 is exactly 100.
    return { scheme, nominees: ns.map((n) => ({ name: n.name, share: n.share, member: n.member })), total: ns.reduce((s, n) => s + Math.round(n.share * 100), 0) / 100 };
  });
  return { rows, missing: schemes.includes('all') ? [] : expected.filter((s) => !schemes.includes(s)) };
}

/** Why the family cannot be saved yet (null: it can). The API checks the same. */
export function familyProblem(members: FamilyMember[], nominations: Nomination[]): string | null {
  if (members.some((m) => !m.name.trim() || !m.relation.trim())) return 'Give every family member a name and a relation.';
  const seen = new Set<string>();
  for (const n of nominations) {
    if (n.member === null || !members[n.member]) return 'Choose a family member as each nominee.';
    if (seen.has(`${n.scheme}:${n.member}`)) return `${members[n.member].name || 'A family member'} is nominated twice for ${schemeLabel(n.scheme)}.`;
    seen.add(`${n.scheme}:${n.member}`);
    if (!(n.share > 0)) return 'Every share is more than 0%.';
  }
  const bad = schemeRows(nominations, []).rows.find((r) => r.total !== 100);
  return bad ? `${schemeLabel(bad.scheme)} shares must total 100% (now ${bad.total}%).` : null;
}

/** The Overview cards. */
export function FamilyCards({ family, today }: { family: RecordFamily; today: Date }) {
  const { rows, missing } = schemeRows(family.nominations, family.expected);
  return (
    <>
      <Card title="Family and nominees" actions={family.onEdit ? <Button size="sm" onClick={family.onEdit}>Edit</Button> : undefined}>
        <div className="yx-ppl__grid2">
          <section aria-label="Family">
            <h3 className="yx-ppl__subhead">Family ({family.members.length})</h3>
            {family.members.length ? (
              <ul className="yx-ppl__family">
                {family.members.map((m) => (
                  <li key={m.id ?? m.name}>
                    <span className="yx-ppl__family-who">
                      <span>{m.name}</span>
                      <Text size="sm" tone="secondary">{m.relation}</Text>
                    </span>
                    <span className="yx-ppl__family-meta">
                      {m.dateOfBirth && <Text size="sm" tone="secondary">{ageOn(m.dateOfBirth, today)} yrs</Text>}
                      {m.dependant && <Badge tone="neutral">Dependant</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Text size="sm" tone="secondary" as="p">No family members on file.</Text>
            )}
          </section>
          <section aria-label="Nominations">
            <h3 className="yx-ppl__subhead">Nominations</h3>
            {rows.length || missing.length ? (
              <ul className="yx-ppl__family">
                {rows.map((r) => (
                  // One scheme per row, one nominee per line under it, spaced like Family (founder, 22 Oct 2026).
                  <li key={r.scheme} className="yx-ppl__scheme">
                    <span className="yx-ppl__scheme-head">
                      <strong>{schemeLabel(r.scheme)}</strong>
                      {r.total === 100 ? (
                        <Badge tone="success"><Icon icon={Check} size="sm" /> 100%</Badge>
                      ) : (
                        <Badge tone="warning">{r.total}%, not 100%</Badge>
                      )}
                    </span>
                    <ul className="yx-ppl__nominees">
                      {r.nominees.map((n) => (
                        <li key={n.name}>
                          <span>
                            {n.name}
                            {n.member !== null && family.members[n.member] && <Text size="sm" tone="secondary"> · {family.members[n.member].relation}</Text>}
                          </span>
                          <span className="yx-ppl__share">{n.share}%</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {missing.map((s) => (
                  <li key={s}>
                    <span>
                      <strong>{schemeLabel(s)}</strong>: no nominee yet
                    </span>
                    <Badge tone="warning"><Icon icon={AlertTriangle} size="sm" /> Missing</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <Text size="sm" tone="secondary" as="p">No nominations on file.</Text>
            )}
          </section>
        </div>
        {family.note && (
          <Text size="sm" tone="secondary" as="p" className="yx-ppl__footnote">
            <Icon icon={Info} size="sm" /> {family.note}
          </Text>
        )}
      </Card>
      <Card title="Emergency contacts" actions={family.onEditContacts ? <Button size="sm" onClick={family.onEditContacts}>Edit</Button> : undefined}>
        {family.contacts.length ? (
          <ul className="yx-ppl__contacts">
            {family.contacts.map((c, i) => (
              <li key={`${i}-${c.name}`}>
                <span>
                  {c.name} · {c.relation}
                </span>
                <a className="yx-link yx-mono" href={`tel:${c.phone}`}>
                  {formatPhone(c.phone)}
                </a>
                {i === 0 && <Badge tone="info">First contact</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <Text size="sm" tone="secondary" as="p">No emergency contacts yet.</Text>
        )}
      </Card>
    </>
  );
}

const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not save. Try again in a moment.');

/** HR edits the family and the nominations together, so each nominee is a family member and every scheme totals 100%. */
export function FamilyDrawer({ name, initial, onSave, onClose }: { name: string; initial: Pick<RecordFamily, 'members' | 'nominations'>; onSave: (f: { members: FamilyMember[]; nominations: Nomination[] }) => Promise<void>; onClose: () => void }) {
  const [members, setMembers] = useState(initial.members);
  const [nominations, setNominations] = useState(initial.nominations.filter((n) => n.member !== null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropped = initial.nominations.length - initial.nominations.filter((n) => n.member !== null).length;
  const problem = familyProblem(members, nominations);
  const setMember = (i: number, patch: Partial<FamilyMember>) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const removeMember = (i: number) => {
    setMembers((ms) => ms.filter((_, j) => j !== i));
    // Their nominations go with them; later members move up one place.
    setNominations((ns) => ns.filter((n) => n.member !== i).map((n) => (n.member !== null && n.member > i ? { ...n, member: n.member - 1 } : n)));
  };
  const setNom = (i: number, patch: Partial<Nomination>) => setNominations((ns) => ns.map((n, j) => (j === i ? { ...n, ...patch, name: members[patch.member ?? n.member ?? -1]?.name ?? n.name } : n)));
  const { rows } = schemeRows(nominations, []);
  // A new gratuity line: the first family member not yet nominated for it, with the share still open.
  const addNomination = () =>
    setNominations((ns) => {
      const g = ns.filter((x) => x.scheme === 'gratuity');
      const m = Math.max(0, members.findIndex((_, j) => !g.some((x) => x.member === j)));
      return [...ns, { scheme: 'gratuity', member: m, name: members[m]?.name ?? '', share: Math.max(0, 100 - (schemeRows(g, []).rows[0]?.total ?? 0)) }];
    });
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ members, nominations });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`Family and nominees of ${name}`}
      description="Family members, and who is nominated for each scheme."
      dirty={members !== initial.members || nominations.length !== initial.nominations.length}
      notice={error ? <InlineAlert tone="danger">{error}</InlineAlert> : problem ? <InlineAlert tone="warning">{problem}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!!problem || busy} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack">
        <h3 className="yx-ppl__subhead">Family ({members.length})</h3>
        {members.map((m, i) => (
          <fieldset key={m.id ?? `new-${i}`} className="yx-ppl__edit-row" aria-label={m.name || `Family member ${i + 1}`}>
            <FormField label="Name" required>
              <TextField value={m.name} onChange={(v) => setMember(i, { name: v })} maxLength={100} />
            </FormField>
            <FormField label="Relation" required>
              <TextField value={m.relation} onChange={(v) => setMember(i, { relation: v })} maxLength={40} />
            </FormField>
            <FormField label="Date of birth" optional>
              <DatePicker value={m.dateOfBirth} onChange={(d) => setMember(i, { dateOfBirth: d })} max={new Date()} />
            </FormField>
            <Checkbox label="Dependant" checked={m.dependant} onChange={(c) => setMember(i, { dependant: c })} />
            <IconButton icon={Trash2} label={`Remove ${m.name || 'this family member'}`} onClick={() => removeMember(i)} />
          </fieldset>
        ))}
        <div>
          <Button size="sm" icon={Plus} onClick={() => setMembers((ms) => [...ms, { name: '', relation: '', dateOfBirth: null, dependant: false }])} disabled={members.length >= 20}>
            Add family member
          </Button>
        </div>
        <h3 className="yx-ppl__subhead">Nominations</h3>
        {dropped > 0 && (
          <InlineAlert tone="info">
            {dropped} nomination{dropped === 1 ? '' : 's'} from joining name{dropped === 1 ? 's' : ''} someone not in the family list. Saving replaces {dropped === 1 ? 'it' : 'them'}: add the person to the family and nominate them here.
          </InlineAlert>
        )}
        {nominations.map((n, i) => (
          <fieldset key={i} className="yx-ppl__edit-row" aria-label={`Nomination ${i + 1}`}>
            <FormField label="Scheme" required>
              <Select value={n.scheme} onChange={(v) => v && setNom(i, { scheme: v })} options={SCHEMES} />
            </FormField>
            <FormField label="Nominee" required>
              <Select value={n.member === null ? null : String(n.member)} onChange={(v) => v !== null && setNom(i, { member: Number(v) })} options={members.map((m, j) => ({ value: String(j), label: m.name || `Family member ${j + 1}` }))} />
            </FormField>
            <FormField label="Share" required>
              <NumberField value={n.share} onChange={(v) => setNom(i, { share: v ?? 0 })} min={0} max={100} decimals suffix="%" />
            </FormField>
            <IconButton icon={Trash2} label={`Remove nomination ${i + 1}`} onClick={() => setNominations((ns) => ns.filter((_, j) => j !== i))} />
          </fieldset>
        ))}
        <div>
          <Button size="sm" icon={Plus} onClick={addNomination} disabled={!members.length || nominations.length >= 40}>
            Add nomination
          </Button>
        </div>
        {rows.length > 0 && (
          <Text size="sm" tone="secondary" as="p">
            {rows.map((r) => `${schemeLabel(r.scheme)} ${r.total}%`).join(' · ')}
          </Text>
        )}
      </div>
    </Drawer>
  );
}

/** Emergency contacts in calling order; the person edits their own. */
export function ContactsDrawer({ initial, onSave, onClose }: { initial: EmergencyContact[]; onSave: (contacts: EmergencyContact[]) => Promise<void>; onClose: () => void }) {
  const [contacts, setContacts] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = contacts.some((c) => !c.name.trim() || !c.relation.trim() || !c.phone.trim()) ? 'Give every contact a name, a relation and a phone number.' : null;
  const set = (i: number, patch: Partial<EmergencyContact>) => setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(contacts);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Emergency contacts"
      description="Who to call in an emergency, first contact first."
      dirty={contacts !== initial}
      notice={error ? <InlineAlert tone="danger">{error}</InlineAlert> : problem ? <InlineAlert tone="warning">{problem}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!!problem || busy} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack">
        {contacts.map((c, i) => (
          <fieldset key={i} className="yx-ppl__edit-row" aria-label={i === 0 ? 'First contact' : `Contact ${i + 1}`}>
            <FormField label="Name" required>
              <TextField value={c.name} onChange={(v) => set(i, { name: v })} maxLength={100} />
            </FormField>
            <FormField label="Relation" required>
              <TextField value={c.relation} onChange={(v) => set(i, { relation: v })} maxLength={40} />
            </FormField>
            <FormField label="Phone" required helper={i === 0 ? 'With the country code, e.g. +91 98450 22872.' : undefined}>
              <TextField type="tel" value={c.phone} onChange={(v) => set(i, { phone: v })} maxLength={30} />
            </FormField>
            {i > 0 && <IconButton icon={ArrowUp} label={`Call ${c.name || 'this contact'} earlier`} onClick={() => setContacts((cs) => cs.map((x, j) => (j === i - 1 ? cs[i] : j === i ? cs[i - 1] : x)))} />}
            <IconButton icon={Trash2} label={`Remove ${c.name || 'this contact'}`} onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))} />
          </fieldset>
        ))}
        <div>
          <Button size="sm" icon={Plus} onClick={() => setContacts((cs) => [...cs, { name: '', relation: '', phone: '' }])} disabled={contacts.length >= 5}>
            Add contact
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
