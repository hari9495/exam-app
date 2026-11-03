// The Performance pages' "no access" state (walk-through 3 Nov 2026): a page the API refuses (403) says who can give
// access, never "check your connection". Other failures keep each screen's own error state with Retry.
import { NoAccessState } from '../../components/feedback';
import { PageHeader } from '../../components/shell';
import { GrowthFrame, type Persona } from './growth-kit';
import './growth.css';

export interface PerfNoAccessProps {
  /** The page's own name, as in the menu. */
  title: string;
  /** "rating disputes", "the competency framework". */
  what: string;
  /** Who can give access: "HR", "your System Admin". */
  grantedBy: string;
  /** Side-panel item the page belongs to. */
  active?: string;
  persona?: Persona;
}

export function PerfNoAccessScreen({ title, what, grantedBy, active = 'Performance home', persona = 'emp' }: PerfNoAccessProps) {
  return (
    <GrowthFrame area="performance" active={active} persona={persona}>
      <PageHeader title={title} />
      <NoAccessState what={what} grantedBy={grantedBy} />
    </GrowthFrame>
  );
}
