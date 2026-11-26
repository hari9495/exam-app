import { useState } from 'react';
import { Badge } from '../../components/display';
import { Text } from '../../components/foundations';
import { Switch } from '../../components/choice';
import { Card } from '../../components/shell';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';

/** One kudos on a review (from Engage), grouped by company value; `hidden` is set only for the person themselves. */
export type ReviewKudosGroup = { value: string; items: { id: string; message: string; from: string; on: string; badge: string | null; hidden: boolean }[] };

/**
 * PRF-05 "Kudos this period" (T2-C 2661, answer 2846): the period's kudos by value, context only and never scored. The
 * person may hide any one until the manager submits (`onHide`); reviewers never get hidden ones from the API.
 */
export function ReviewKudosPanel({ groups, forPerson, onHide }: { groups: ReviewKudosGroup[]; forPerson: boolean; onHide?: (id: string, hidden: boolean) => Promise<unknown> }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const hide = async (id: string, hidden: boolean) => {
    setBusy(id);
    try {
      await onHide!(id, hidden);
      toast({ tone: 'success', title: hidden ? 'Hidden from this review.' : 'Shown on this review again.' });
    } catch (e) {
      toast({ tone: 'error', title: e instanceof Error && e.message ? e.message : 'That did not save. Try again.' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title="Kudos this period">
      <Text size="sm" tone="secondary">
        Context only, never scored.{' '}
        {forPerson ? (onHide ? 'You can hide any kudos from your reviewers until your manager submits the review.' : 'Your manager has submitted the review, so these can no longer be hidden.') : 'Kudos the person hid are not shown.'}
      </Text>
      {groups.length === 0 ? (
        <Text tone="secondary">No kudos in this review period.</Text>
      ) : (
        <ul className="yx-growth-list">
          {groups.map((g) => (
            <li key={g.value} className="yx-growth-list__item">
              <Badge tone="success">{`${g.value} · ${g.items.length}`}</Badge>
              <ul className="yx-growth-list yx-growth-grow">
                {g.items.map((k) => (
                  <li key={k.id} className="yx-growth-list__item">
                    <div className="yx-growth-grow">
                      <Text as="p">{`“${k.message}”`}</Text>
                      <span className="yx-growth-meta">{`${k.from} · ${formatDate(new Date(k.on))}${k.badge ? ` · ${k.badge}` : ''}${k.hidden ? ' · Hidden from reviewers' : ''}`}</span>
                    </div>
                    {forPerson && onHide && <Switch label="Hide from review" checked={k.hidden} disabled={busy === k.id} onChange={(on) => void hide(k.id, on)} />}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
