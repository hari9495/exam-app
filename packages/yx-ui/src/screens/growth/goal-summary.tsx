import { Badge } from '../../components/display';
import { progressSummary, type Goal } from './growth-logic';

// Batch F item 31 (answer 2576): the progress summary on top of a person's goals.
export function GoalProgressSummary({ goals, all }: { goals: Goal[]; all?: Goal[] }) {
  const s = progressSummary(goals, all ?? goals);
  return (
    <section className="yx-growth-row" aria-label="Goal progress summary">
      <span className="yx-growth-num">{s.average == null ? 'No progress yet' : `Average progress ${s.average}%`}</span>
      <Badge tone="success">{`${s.onTrack} on track`}</Badge>
      <Badge tone="warning">{`${s.atRisk} at risk`}</Badge>
      <Badge tone="danger">{`${s.offTrack} off track`}</Badge>
      <Badge tone="neutral">{`${s.done} done`}</Badge>
    </section>
  );
}
