'use client';

import { useParams } from 'next/navigation';
import { CalibrationScreen, type CalibrationBoard, type CalibrationPerson, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { designState, usePerf, usePerfWrite, refused } from '../../../../../../lib/yx-performance';

// PRF-09 Calibration board and 9-box, the designed screen with live data: the cycle's bands as the board's columns,
// the distribution against the guide (a guide only), moves with reasons, potential on the 9-box, sign-off. Only the
// facilitator changes anything; HR and the managers of the people in it look (the API checks).
const two = (x: number | null) => (x === null ? '' : ` (${x.toFixed(2)})`);

export default function YxCalibrationBoardPage() {
  const { id } = useParams<{ id: string }>();
  const base = `/calibrations/${encodeURIComponent(id)}`;
  const board = usePerf<CalibrationBoard>(base);
  const write = usePerfWrite();
  const b = board.data;
  const levels = (b?.scale.bands ?? []).map((x) => x.label);
  const level = (band: string | null) => (band ? levels.indexOf(band) + 1 : 0);
  const people: CalibrationPerson[] = (b?.rows ?? []).map((r) => ({
    id: r.reviewId,
    name: r.employee,
    manager: r.manager,
    team: r.manager,
    self: r.selfIndication,
    managerRating: level(r.band),
    rating: level(r.band),
    managerScore: r.managerScore,
    score: r.score,
    protectedLeave: r.protectedLeave,
    potential: r.potential ?? undefined,
  }));
  const guide = b?.guide ? levels.map((l) => b.guide!.bands.find((g) => g.label === l)?.share ?? 0) : [];
  if (refused(board)) return <PerfNoAccessScreen title="Calibration" what="calibration sessions" grantedBy="HR" active="Calibration & comp review" persona="hr" />;
  return (
    <CalibrationScreen
      persona={b?.can.change ? 'hr' : 'mgr'}
      state={designState(board)}
      session={{ name: b?.name ?? 'Calibration', facilitator: b?.facilitator ?? '', group: b?.cycle ?? '', date: b?.openedOn ? new Date(b.openedOn) : new Date() }}
      people={people}
      guide={guide}
      changes={(b?.changes ?? []).map((c, i) => ({ id: `${c.reviewId}-${i}`, person: c.employee, from: level(c.fromBand), to: level(c.toBand), fromText: `${c.fromBand ?? '—'}${two(c.from)}`, toText: `${c.toBand ?? '—'}${two(c.to)}`, reason: c.reason, by: c.by ?? '', at: new Date(c.at) }))}
      live={{
        onRetry: () => void board.refetch(),
        levels,
        actual: b?.distribution.bands ? levels.map((l) => b.distribution.bands!.find((x) => x.label === l)?.share ?? 0) : null,
        notes: b?.distribution.notes ?? [],
        open: b?.status === 'open',
        can: { change: Boolean(b?.can.change), signOff: Boolean(b?.can.signOff), potential: Boolean(b?.can.potential) },
        onMove: (reviewId, to, reason) => write('POST', `${base}/changes`, { reviewId, toBand: levels[to - 1], reason }),
        onPotential: (reviewId, potential, reason) => write('POST', `${base}/potential`, { reviewId, potential, reason }),
        onSignOff: () => write('POST', `${base}/sign-off`),
      }}
    />
  );
}
