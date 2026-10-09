'use client';

import { useParams, useRouter } from 'next/navigation';
import { JoinerPanel, JourneyScreen, type Joiner, type JoinerForms, type Journey } from '@yukthix/ui/lifecycle';
import { loadState, todayIst, useYxPermissions } from '../../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite, useTaskActions } from '../../../../../../lib/yx-lifecycle';

// People › Onboarding › one checklist (PPL-13; YX-LC-02 / 13): every task with its owner and due date; owners do their
// own tasks; HR runs the checklist, uploads documents, issues letters (the letter task closes by itself), sees the
// joiner's pre-boarding forms and background checks, moves the joining day, marks them joined or cancels (6b).
export default function YxJourneyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const perms = useYxPermissions();
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
  return (
    <JourneyScreen
      state={loadState(journey)}
      onRetry={() => void journey.refetch()}
      data={j ?? null}
      {...(perms.has('letter.issue') ? actions : { onComplete: actions.onComplete, onSkip: actions.onSkip, onUpload: actions.onUpload })}
      onPostpone={hrJoiner && joiner.data ? (joiningOn, reason) => write('POST', `${base}/postpone`, { joiningOn, reason, version: joiner.data!.version }) : undefined}
      onBack={() => router.push('/yx/people/onboarding')}
    >
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
    </JourneyScreen>
  );
}
