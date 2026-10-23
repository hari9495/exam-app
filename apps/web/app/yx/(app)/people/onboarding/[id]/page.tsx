'use client';

import { useParams } from 'next/navigation';
import { JourneyRecord } from '@yukthix/ui/frame';
import { useToast } from '@yukthix/ui';
import { BuddyCard, JoinerPanel, RehireCard, type Joiner, type JoinerForms, type Journey, type JourneyTask, type RehireView, type TaskActions } from '@yukthix/ui/lifecycle';
import { todayIst, useYxPermissions } from '../../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite, useTaskActions } from '../../../../../../lib/yx-lifecycle';

// People › Onboarding › one checklist (PPL-13; YX-LC-02 / 13): every task with its owner and due date; owners do their
// own tasks; HR runs the checklist, uploads documents, issues letters (the letter task closes by itself), sees the
// joiner's pre-boarding forms and background checks, moves the joining day, marks them joined or cancels (6b).
export default function YxJourneyPage() {
  const { id } = useParams<{ id: string }>();
  const perms = useYxPermissions();
  const { toast } = useToast();
  const journey = useLife<Journey>(`/lifecycle/journeys/${encodeURIComponent(id)}`);
  const j = journey.data;
  const hrJoiner = Boolean(j?.canManage && j.subjectType === 'preboarding');
  const joiner = useLife<Joiner>(hrJoiner ? `/lifecycle/joiners/${encodeURIComponent(j!.subjectId)}` : null);
  const forms = useLife<JoinerForms>(hrJoiner ? `/lifecycle/joiners/${encodeURIComponent(j!.subjectId)}/forms` : null);
  const places = useJoinerPlaces(hrJoiner);
  const actions = useTaskActions(j?.canManage ? j.personId : null, j ? { type: j.subjectType, id: j.subjectId } : null);
  const write = useLifeWrite();
  const base = j ? `/lifecycle/joiners/${encodeURIComponent(j.subjectId)}` : '';
  const pb = joiner.data;
  // 6e: a rehire's options; the buddy.
  const rehire = useLife<RehireView>(pb?.personType === 'rehire' ? `${base}/rehire` : null);
  const err = journey.error as { status?: number } | null;
  // Each done task says so in a toast that names the task and the person.
  const who = j?.person ?? 'the person';
  const said = <A extends [JourneyTask, ...unknown[]]>(run: ((...a: A) => Promise<unknown>) | undefined, title: (t: JourneyTask) => string) =>
    run &&
    (async (...a: A) => {
      const out = await run(...a);
      toast({ tone: 'success', title: title(a[0]) });
      return out;
    });
  const withToasts: TaskActions = {
    onComplete: said(actions.onComplete, (t) => `${t.title} done for ${who}`)!,
    onSkip: said(actions.onSkip, (t) => `${t.title} skipped for ${who}`)!,
    onUpload: said(actions.onUpload, (t) => `${t.title}: file uploaded for ${who}`),
    ...(perms.has('letter.issue') ? { onPreviewLetter: actions.onPreviewLetter, onIssueLetter: said(actions.onIssueLetter, (t) => `${t.title}: letter issued to ${who}`) } : {}),
  };
  const today = todayIst();
  return (
    <JourneyRecord
      tasks={[]}
      joining={new Date(`${today}T00:00:00`)}
      today={new Date(`${(j?.today ?? today)}T00:00:00`)}
      live={{
        state: journey.isError ? (err?.status === 403 || err?.status === 404 ? 'not-found' : 'error') : j ? 'ready' : 'loading',
        onRetry: () => void journey.refetch(),
        journey: j ?? null,
        joiner: pb ? { role: pb.designation, location: pb.location, manager: pb.manager, buddy: places.managers.find((m) => m.value === pb.buddyEmployeeId)?.label.split(',')[0] ?? null } : null,
        actions: withToasts,
        ...(hrJoiner && joiner.data ? { onPostpone: (joiningOn: string, reason: string) => write('POST', `${base}/postpone`, { joiningOn, reason, version: joiner.data!.version }) } : {}),
        children: (
          <>
      {hrJoiner && forms.data && pb && (
        <JoinerPanel
          forms={forms.data}
          today={todayIst()}
          joiningOn={pb.joiningOn}
          places={places}
          plan={{ departmentId: pb.departmentId, designationId: pb.designationId, employmentTypeId: pb.employmentTypeId }}
          canJoin={perms.has('lifecycle.onboarding.manage') && perms.has('employee.change.manage')}
          onPlan={(patch) => write('PUT', `${base}/plan`, { ...patch, version: pb.version })}
          onJoin={(x) => write('POST', `${base}/join`, { ...x, version: pb.version })}
          onCancel={(x) => write('POST', `${base}/cancel`, { ...x, version: pb.version })}
          bgv={
            perms.has('lifecycle.bgv.manage')
              ? {
                  onAsk: () => write('POST', `${base}/bgv/ask`),
                  onAdd: (checkType, gate) => write('POST', `${base}/bgv/checks`, { checkType, gate }),
                  onUpdate: (checkId, version, x) => {
                    const form = new FormData();
                    form.append('status', x.status);
                    form.append('version', String(version));
                    if (x.note) form.append('note', x.note);
                    if (x.file) form.append('file', x.file);
                    return write('POST', `/lifecycle/bgv/checks/${encodeURIComponent(checkId)}`, form);
                  },
                }
              : undefined
          }
        />
      )}
      {hrJoiner && pb && pb.status === 'invited' && rehire.data && <RehireCard data={rehire.data} onSave={(overrides, version) => write('PUT', `${base}/rehire`, { overrides, version })} />}
      {hrJoiner && pb && pb.status === 'invited' && (
        <BuddyCard people={places.managers} current={pb.buddyEmployeeId ?? null} managerEmployeeId={pb.managerEmployeeId ?? null} onSave={(employeeId) => write('PUT', `${base}/buddy`, { employeeId, version: pb.version })} />
      )}
          </>
        ),
      }}
    />
  );
}
