// Small T8 building blocks shared by the mobile tab-map screens (APX-D §5): list rows, sections, cards, segment.
import type { ReactNode } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../../components/button';
import { Segment as SharedSegment } from '../../components/segment';
import { Icon, type IconComponent } from '../../components/foundations';
import './settings.css';

export interface MRowProps {
  title: ReactNode;
  sub?: ReactNode;
  icon?: IconComponent;
  lead?: ReactNode;
  end?: ReactNode;
  onClick?: () => void;
  /** Renders a link-style row with a chevron. */
  nav?: boolean;
}

/** One tappable list row, at least 44 px tall (§36). */
export function MRow({ title, sub, icon, lead, end, onClick, nav = true }: MRowProps) {
  const inner = (
    <>
      {lead ?? (icon && <Icon icon={icon} size="md" />)}
      <span className="yx-m-row__main">
        <span className="yx-m-row__title">{title}</span>
        {sub && <span className="yx-m-row__sub">{sub}</span>}
      </span>
      {(end || nav) && (
        <span className="yx-m-row__end">
          {end}
          {nav && <Icon icon={ChevronRight} />}
        </span>
      )}
    </>
  );
  return nav ? (
    <button type="button" className="yx-m-row" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="yx-m-row">{inner}</div>
  );
}

export function MList({ children, label }: { children: ReactNode; label?: string }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <ul className="yx-m-list" aria-label={label}>
      {items.filter(Boolean).map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
}

export function MSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="yx-m-section" aria-label={title}>
      <div className="yx-m-card__row">
        <h2 className="yx-m-section__title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MCard({ title, children, end }: { title?: ReactNode; children: ReactNode; end?: ReactNode }) {
  return (
    <div className="yx-m-card">
      {(title || end) && (
        <div className="yx-m-card__row">
          {title && <p className="yx-m-card__title">{title}</p>}
          {end}
        </div>
      )}
      {children}
    </div>
  );
}

/** Two-way segment (Me / Team, Mine / Team): the shared Segment, full width on the phone. */
export function Segment<V extends string>(props: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  return <SharedSegment {...props} className="yx-m-segment" />;
}

export const BackButton = ({ label = 'Back' }: { label?: string }) => <IconButton icon={ArrowLeft} label={label} />;

/** Pinned bottom action area (T8: primary button at the bottom). */
export function MPin({ children }: { children: ReactNode }) {
  return <div className="yx-m-pin yx-m-actions">{children}</div>;
}
