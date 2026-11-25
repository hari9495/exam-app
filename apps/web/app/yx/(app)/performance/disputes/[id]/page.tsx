'use client';

import { useParams } from 'next/navigation';
import { DisputeRecordScreen, type ApprovalStep, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { loadState } from '../../../../../../lib/yx-org';
import { usePerf, usePerfDownload, usePerfWrite, refused } from '../../../../../../lib/yx-performance';

type Step = Omit<ApprovalStep, 'at'> & { at?: string };
interface DisputeView {
  id: string;
  ref: string;
  employee: string;
  cycle: string;
  raisedOn: string;
  status: 'raised' | 'resolved';
  legalHold: boolean;
  grounds: string;
  sought: string;
  decision: string | null;
  steps: Step[];
  evidence: { id: string; kind: string; label: string; at: string; hash: string }[];
  activity: { id: string; actor: string; action: string; at: string }[];
  exports: { id: string; ref: string; at: string; items: number }[];
  signatories: { value: string; label: string }[];
  version: number;
}
const DECISION: Record<string, string> = { upheld: 'Upheld', not_upheld: 'Not upheld', rereview: 'Fresh review' };

// PRF-15 one escalated dispute (performance builder 3): every opening is audited by the API; legal hold, the decision
// and the evidence export (a PDF through the file store, downloaded at once) for perf.dispute.manage holders.
export default function YxDisputePage() {
  const { id } = useParams<{ id: string }>();
  const at = `/disputes/${encodeURIComponent(id)}`;
  const rec = usePerf<DisputeView>(at);
  const write = usePerfWrite();
  const download = usePerfDownload();
  const state = loadState(rec);
  const x = rec.data;
  if (refused(rec)) return <PerfNoAccessScreen title="Rating dispute" what="rating disputes" grantedBy="your System Admin" active="Reviews & cycles" persona="hr" />;
  return (
    <DisputeRecordScreen
      dispute={{ id: '', employee: '', cycle: '', raised: new Date(), status: 'Raised', grounds: '', sought: '', legalHold: false, steps: [], evidence: [], activity: [] }}
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void rec.refetch(),
        dispute: x
          ? {
              id: x.id,
              ref: x.ref,
              employee: x.employee,
              cycle: x.cycle,
              raised: new Date(`${x.raisedOn}T00:00:00`),
              status: x.status === 'resolved' ? 'Resolved' : 'Escalated',
              grounds: x.grounds,
              sought: x.sought,
              legalHold: x.legalHold,
              decision: x.decision ? DECISION[x.decision] : null,
              steps: x.steps.map((s) => ({ ...s, at: s.at ? new Date(s.at) : undefined })),
              evidence: x.evidence.map((e) => ({ ...e, at: new Date(e.at) })),
              activity: x.activity.map((a) => ({ id: a.id, actor: { name: a.actor }, action: a.action, at: new Date(a.at) })),
            }
          : null,
        signatories: x?.signatories ?? [],
        exports: (x?.exports ?? []).map((e) => ({ ...e, at: new Date(e.at) })),
        onLegalHold: async (on) => void (await write('POST', `${at}/legal-hold`, { on, version: x!.version })),
        onDecide: async (input) => void (await write('POST', `${at}/decision`, { ...input, version: x!.version })),
        onExport: (items, signatoryUserId) => write<{ exportId: string; ref: string }>('POST', `${at}/export`, { items, signatoryUserId }),
        onDownload: (exportId, ref) => download(`${at}/exports/${encodeURIComponent(exportId)}/file`, `${ref}.pdf`),
      }}
    />
  );
}
