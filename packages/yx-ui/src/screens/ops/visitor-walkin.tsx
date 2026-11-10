// Visitors slice 2 at the reception desk (VIS-01; answers 604, 606, 610): add a walk-in (details, who they visit, their
// type's NDA and induction read and ticked, a reason when outside the allowed hours), and decide for the host once the
// host's minutes have passed. The same parts draw the stories and run the live desk.
import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { Drawer } from '../../components/drawer';
import { Dialog } from '../../components/overlay';
import { useRun } from '../org/org-kit';
import { useSay } from './ops-kit';
import { ID_CHOICES, PURPOSE_CHOICES } from './visitors-data';
import type { KioskNeeds } from './visitor-kiosk';

type Choice = { value: string; label: string; description?: string };

export interface DeskWalkInInput {
  name: string;
  mobile: string;
  company: string | null;
  typeId: string | null;
  purpose: string;
  hostUserId: string;
  noticeVersion: string;
  ndaVersionId: string | null;
  inductionVersionId: string | null;
  hoursReason: string | null;
  /** Slice 3 (614, 603). */
  minor?: boolean;
  minorAdult?: string | null;
  idType?: string | null;
  idLast4?: string | null;
}

export interface DeskWalkInParts {
  types: Choice[];
  /** People who can be the host, by name (typed). */
  hosts: (q: string) => Promise<Choice[]>;
  /** What the visitor reads, and whether it is inside the allowed hours now. */
  needs: (q: { typeId: string | null; mobile: string; company: string | null }) => Promise<KioskNeeds & { inHours: boolean; hours: string }>;
  onAdd: (input: DeskWalkInInput) => Promise<{ name: string }>;
}

const SAMPLE_NEEDS: KioskNeeds & { inHours: boolean; hours: string } = {
  notice: { text: 'Please wear your visitor badge at all times and follow your host.', version: 'v-sample' },
  nda: { title: 'Visitor NDA', text: 'Keep what you see and hear about Kaveri Foods confidential.', versionId: 'nda' },
  induction: { title: 'Plant safety induction', text: 'Wear safety shoes beyond the yellow line. Follow your escort.', versionId: 'ind' },
  inHours: false,
  hours: '09:00 to 18:30',
};

export function AddWalkInDrawer({ open, onClose, parts, idCapture = 'on' }: { open: boolean; onClose: () => void; parts?: DeskWalkInParts; idCapture?: 'off' | 'on' | 'with_image' }) {
  const { toast } = useSay();
  const { busy, error, run, clearError } = useRun();
  const [d, setD] = useState({ name: '', mobile: '', company: '', typeId: null as string | null, purpose: 'meeting', hostUserId: null as string | null, reason: '', minor: false, adult: '', idType: null as string | null, last4: '' });
  // Slice 3 (603, 614): the ID type and last 4 where the location takes ID; none from a visitor under 18. The photo of
  // the ID, where kept, is added at check-in.
  const idAsked = idCapture !== 'off' && !d.minor;
  const [hostQ, setHostQ] = useState('');
  const [hostOptions, setHostOptions] = useState<Choice[]>(parts ? [] : [{ value: 'h1', label: 'Anita Desai', description: 'anita@kaveri.example' }]);
  const [needs, setNeeds] = useState<(KioskNeeds & { inHours: boolean; hours: string }) | null>(parts ? null : SAMPLE_NEEDS);
  const [ticks, setTicks] = useState({ notice: false, nda: false, induction: false });
  useEffect(() => {
    if (!parts || !open) return;
    let live = true;
    void parts.hosts(hostQ).then((r) => live && setHostOptions(r), () => undefined);
    return () => {
      live = false;
    };
  }, [hostQ, open, parts]);
  useEffect(() => {
    if (!parts || !open) return;
    let live = true;
    const t = setTimeout(() => void parts.needs({ typeId: d.typeId, mobile: d.mobile.trim(), company: d.company.trim() || null }).then((n) => live && setNeeds(n), () => undefined), 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [d.typeId, d.mobile, d.company, open, parts]);
  const early = useTooEarly(
    [
      !d.name.trim() && { fieldId: 'wi-name', message: "Enter the visitor's name." },
      !/^\+?[\d\s-]{10,16}$/.test(d.mobile.trim()) && { fieldId: 'wi-mobile', message: "Enter the visitor's 10-digit mobile number." },
      !d.hostUserId && { fieldId: 'wi-host', message: 'Choose who they are visiting.' },
      d.minor && d.adult.trim().length < 2 && { fieldId: 'wi-adult', message: 'Name the adult who came with them.' },
      idAsked && !d.idType && { fieldId: 'wi-idtype', message: 'Choose the ID the visitor showed.' },
      idAsked && !/^[A-Za-z0-9]{4}$/.test(d.last4.trim()) && { fieldId: 'wi-last4', message: 'Enter only the last 4 characters of the ID number.' },
      needs && !needs.inHours && !d.reason.trim() && { fieldId: 'wi-reason', message: `Visitors are allowed ${needs.hours}. Say why they come in now.` },
      !ticks.notice && { fieldId: 'wi-notice', message: 'Tick that the visitor read and accepted the notice.' },
      needs?.nda && !ticks.nda && { fieldId: 'wi-nda', message: `Tick that the visitor accepted ${needs.nda.title}.` },
      needs?.induction && !ticks.induction && { fieldId: 'wi-induction', message: `Tick that the visitor read ${needs.induction.title}.` },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const save = () => {
    if (early.stop()) return;
    if (!parts) return void (toast({ tone: 'success', title: `Priyanka Sethi is waiting for Anita Desai`, description: 'Anita has 10 minutes to answer; then you decide.' }), onClose());
    void run('add', async () => {
      const made = await parts.onAdd({ name: d.name.trim(), mobile: d.mobile.trim(), company: d.company.trim() || null, typeId: d.typeId, purpose: d.purpose, hostUserId: d.hostUserId!, noticeVersion: needs!.notice.version, ndaVersionId: needs?.nda?.versionId ?? null, inductionVersionId: needs?.induction?.versionId ?? null, hoursReason: d.reason.trim() || null, ...(d.minor ? { minor: true, minorAdult: d.adult.trim() } : {}), ...(idAsked ? { idType: d.idType, idLast4: d.last4.trim().toUpperCase() } : {}) });
      toast({ tone: 'success', title: `${made.name} is waiting for the host`, description: 'The host is told now; after their minutes you decide.' });
      onClose();
    });
  };
  const types = parts ? parts.types : [{ value: 'contractor', label: 'Contractor' }, { value: 'customer', label: 'Customer' }];
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && (onClose(), clearError())}
      size="lg"
      title="Add a walk-in"
      subtitle="The host is asked to approve; reception decides if they don't answer in time."
      notice={error ? <InlineAlert tone="danger" title="Not added">{error}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'add'} onClick={save}>
            Ask the host
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        <FormField id="wi-name" label="Visitor's name" required error={early.errorOf('wi-name')}>
          <TextField value={d.name} onChange={(name) => setD({ ...d, name })} maxLength={200} />
        </FormField>
        <FormField id="wi-mobile" label="Mobile" required error={early.errorOf('wi-mobile')}>
          <TextField inputMode="tel" prefix="+91" value={d.mobile} onChange={(mobile) => setD({ ...d, mobile })} maxLength={16} />
        </FormField>
        <FormField id="wi-company" label="Company" optional>
          <TextField value={d.company} onChange={(company) => setD({ ...d, company })} maxLength={200} />
        </FormField>
        <FormField id="wi-type" label="Visitor type" optional helper="Sets the NDA and safety induction they accept">
          <Select aria-label="Visitor type" value={d.typeId} onChange={(typeId) => setD({ ...d, typeId })} options={types} placeholder="No type" clearable />
        </FormField>
        <FormField id="wi-purpose" label="Purpose" required>
          <Select aria-label="Purpose" value={d.purpose} onChange={(p) => p && setD({ ...d, purpose: p })} options={PURPOSE_CHOICES} />
        </FormField>
        <FormField id="wi-host" label="Visiting" required error={early.errorOf('wi-host')}>
          <Select aria-label="Visiting" value={d.hostUserId} onChange={(hostUserId) => setD({ ...d, hostUserId })} options={hostOptions} searchable onSearchChange={setHostQ} placeholder="Search by name" emptyText="Nobody by that name." />
        </FormField>
        <Checkbox id="wi-minor" checked={d.minor} onChange={(minor) => setD({ ...d, minor })} label="The visitor is under 18" description="They come in only with a named adult. No photo and no ID." />
        {d.minor && (
          <FormField id="wi-adult" label="Adult who came with them" required error={early.errorOf('wi-adult')}>
            <TextField value={d.adult} onChange={(adult) => setD({ ...d, adult })} maxLength={200} />
          </FormField>
        )}
        {idAsked && (
          <FieldRow>
            <FormField id="wi-idtype" label="ID shown" required error={early.errorOf('wi-idtype')}>
              <Select aria-label="ID shown" value={d.idType} onChange={(idType) => setD({ ...d, idType })} options={ID_CHOICES} placeholder="Choose the ID" />
            </FormField>
            <FormField id="wi-last4" label="Last 4 characters" required error={early.errorOf('wi-last4')} helper="Never the full number.">
              <TextField value={d.last4} onChange={(last4) => setD({ ...d, last4 })} maxLength={4} autoComplete="off" spellCheck={false} />
            </FormField>
          </FieldRow>
        )}
        {needs && !needs.inHours && (
          <FormField id="wi-reason" label="Why now" required error={early.errorOf('wi-reason')} helper={`Outside the allowed hours (${needs.hours}). Recorded in the audit log.`}>
            <TextArea value={d.reason} onChange={(reason) => setD({ ...d, reason })} maxLength={300} rows={2} />
          </FormField>
        )}
        {needs && (
          <div className="yx-ops-kiosk__notice" tabIndex={0} role="region" aria-label="What the visitor accepts">
            <p>{needs.notice.text}</p>
            {needs.nda && (
              <p>
                <strong>{needs.nda.title}.</strong> {needs.nda.text}
              </p>
            )}
            {needs.induction && (
              <p>
                <strong>{needs.induction.title}.</strong> {needs.induction.text}
              </p>
            )}
          </div>
        )}
        <Checkbox id="wi-notice" checked={ticks.notice} onChange={(notice) => setTicks({ ...ticks, notice })} label="The visitor read and accepted the notice" />
        {early.errorOf('wi-notice') && <p className="yx-field__error">{early.errorOf('wi-notice')}</p>}
        {needs?.nda && (
          <>
            <Checkbox id="wi-nda" checked={ticks.nda} onChange={(nda) => setTicks({ ...ticks, nda })} label={`The visitor accepted ${needs.nda.title}`} />
            {early.errorOf('wi-nda') && <p className="yx-field__error">{early.errorOf('wi-nda')}</p>}
          </>
        )}
        {needs?.induction && (
          <>
            <Checkbox id="wi-induction" checked={ticks.induction} onChange={(induction) => setTicks({ ...ticks, induction })} label={`The visitor read ${needs.induction.title}`} />
            {early.errorOf('wi-induction') && <p className="yx-field__error">{early.errorOf('wi-induction')}</p>}
          </>
        )}
      </div>
    </Drawer>
  );
}

/** Answer 604: after the host's minutes, reception lets the walk-in in or not; a refusal says why. Audited. */
export function DecideForHostDialog({ open, onClose, name, host, onDecide }: { open: boolean; onClose: () => void; name: string; host: string; onDecide?: (approve: boolean, reason: string | null) => Promise<unknown> }) {
  const { toast } = useSay();
  const { busy, error, run, clearError } = useRun();
  const [choice, setChoice] = useState<'approve' | 'decline'>('approve');
  const [reason, setReason] = useState('');
  const early = useTooEarly(choice === 'decline' && !reason.trim() ? [{ fieldId: 'dh-reason', message: 'Say why the visit cannot go ahead.' }] : []);
  const go = () => {
    if (early.stop()) return;
    if (!onDecide) return void onClose();
    void run('decide', async () => {
      await onDecide(choice === 'approve', reason.trim() || null);
      toast({ tone: 'success', title: choice === 'approve' ? `${name} checked in` : `${name}'s visit declined`, description: `Decided by reception: ${host} did not answer in time.` });
      onClose();
    });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && (onClose(), clearError())}
      title={`Decide for ${host}`}
      description={`${host} did not answer in time. Your decision is recorded in the audit log.`}
      notice={error ? <InlineAlert tone="danger" title="Not done">{error}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'decide'} onClick={go}>
            {choice === 'approve' ? 'Let them in' : 'Decline the visit'}
          </Button>
        </>
      }
    >
      <FormField label={name} hideLabel>
        <RadioGroup aria-label="Decision" value={choice} onChange={(v) => setChoice(v as 'approve' | 'decline')} options={[{ value: 'approve', label: `Let ${name} in` }, { value: 'decline', label: 'The visit cannot go ahead' }]} />
      </FormField>
      <FormField id="dh-reason" label="Reason" required={choice === 'decline'} optional={choice === 'approve'} error={early.errorOf('dh-reason')}>
        <TextArea value={reason} onChange={setReason} maxLength={300} rows={2} />
      </FormField>
    </Dialog>
  );
}
