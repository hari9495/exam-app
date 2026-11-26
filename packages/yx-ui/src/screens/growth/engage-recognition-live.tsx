// Batch G2 item 73 (M09 Q4, answer 2603): ENG-08 Give kudos and ENG-09 Recognition wall with real records, badges only
// (no points, so no leaderboard). GiveKudosScreen and RecognitionWallScreen (engage-recognition.tsx) render these with `live`.
import { useState } from 'react';
import { Gift } from 'lucide-react';
import { Button } from '../../components/button';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Card, PageHeader } from '../../components/shell';
import { Drawer } from '../../components/drawer';
import { FormField, useTooEarly } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { useToast } from '../../components/notify';
import { errorText } from '../org/org-kit';
import { GrowthFrame, PostCard, type FeedPost } from './growth-kit';
import { moderate } from './growth-logic';

export interface KudosOptions {
  values: string[];
  badges: string[];
  people: { id: string; name: string }[];
}
export interface KudosInput {
  to: string[];
  value: string;
  badge?: string;
  message: string;
}
export interface LiveGiveKudos {
  options: KudosOptions | null;
  onSearch?: (q: string) => void;
  blockedWords?: string[];
  onSend: (input: KudosInput) => Promise<{ held: boolean }>;
  onClose: () => void;
  defaults?: { to?: string[] };
}

export function LiveGiveKudosScreen({ live }: { live: LiveGiveKudos }) {
  const { toast } = useToast();
  const [to, setTo] = useState<string[]>(live.defaults?.to ?? []);
  const [value, setValue] = useState<string | null>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const o = live.options;
  const early = useTooEarly([
    ...(!to.length ? [{ fieldId: 'kd-to', message: 'Choose at least one person to thank.' }] : []),
    ...(!value ? [{ fieldId: 'kd-value', message: 'Pick a company value for this kudos.' }] : []),
    ...(!msg.trim() ? [{ fieldId: 'kd-msg', message: 'Write what they did.' }] : []),
  ]);
  const held = moderate(msg, 0, live.blockedWords ?? []).state === 'Held';
  const send = async () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      const out = await live.onSend({ to, value: value!, ...(badge ? { badge } : {}), message: msg.trim() });
      const names = to.map((id) => o?.people.find((p) => p.id === id)?.name ?? '').filter(Boolean).join(', ');
      toast({ tone: out.held ? 'warning' : 'success', title: out.held ? 'Your kudos is held for review: it has a word on the blocked list.' : `Kudos sent to ${names}.` });
      live.onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <GrowthFrame area="engage" active="Recognition" persona="emp">
      <PageHeader title="Recognition" />
      <Drawer
        open
        onOpenChange={(open) => !open && live.onClose()}
        title="Give kudos"
        dirty={msg.length > 0}
        footer={
          <div className="yx-growth-foot">
            <Button variant="primary" icon={Gift} loading={busy} onClick={() => void send()}>
              Send kudos
            </Button>
          </div>
        }
      >
        {!o ? (
          <Skeleton height={240} />
        ) : (
          <div className="yx-growth-stack">
            {failed && <InlineAlert tone="danger" title="Not sent">{failed}</InlineAlert>}
            <FormField id="kd-to" label="Who do you want to thank?" required error={early.errorOf('kd-to')}>
              <MultiSelect value={to} onChange={setTo} onSearchChange={live.onSearch} options={o.people.map((p) => ({ value: p.id, label: p.name }))} placeholder="Search people" />
            </FormField>
            <FormField id="kd-value" label="Company value" required error={early.errorOf('kd-value')}>
              <RadioGroup aria-label="Company value" value={value ?? ''} onChange={setValue} options={o.values.map((x) => ({ value: x, label: x }))} />
            </FormField>
            {o.badges.length > 0 && (
              <FormField label="Badge" optional>
                <Select value={badge} onChange={setBadge} clearable placeholder="No badge" options={o.badges.map((b) => ({ value: b, label: b }))} />
              </FormField>
            )}
            <FormField id="kd-msg" label="Message" required error={early.errorOf('kd-msg')}>
              <TextArea value={msg} onChange={setMsg} rows={3} maxLength={1000} />
            </FormField>
            {held && (
              <InlineAlert tone="warning" title="This kudos will be held for review">
                It contains a word on the company’s blocked list. Edit it, or send and a moderator will decide.
              </InlineAlert>
            )}
            <div className="yx-growth-effect" aria-live="polite">
              <span className="yx-growth-effect__title">When you send</span>
              <ul>
                <li>Posted in the company feed and shown on the recognition wall.</li>
                <li>The people you thank are told.</li>
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </GrowthFrame>
  );
}

export interface WallKudos {
  id: string;
  from: string;
  fromLeft: boolean;
  to: string[];
  value: string;
  badge: string | null;
  body: string;
  at: string;
  likes: number;
  liked: boolean;
  comments: number;
  mine: boolean;
}
export interface LiveRecognitionWall {
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  now: Date;
  values: { value: string; count: number }[];
  total: number;
  kudos: WallKudos[];
  value: string | null;
  onValue: (v: string | null) => void;
  onGive: () => void;
  onLike?: (id: string) => Promise<unknown>;
}

export const kudosPost = (k: WallKudos): FeedPost => ({
  id: k.id,
  type: 'Kudos',
  author: k.from,
  authorNote: k.fromLeft ? 'Former employee' : undefined,
  space: 'Company',
  at: new Date(k.at),
  body: <span className="yx-growth-pre">{k.body}</span>,
  to: k.to,
  value: k.badge ? `${k.value} · ${k.badge}` : k.value,
  reactions: k.likes,
  reacted: k.liked,
  comments: k.comments,
});

export function LiveRecognitionWallScreen({ live }: { live: LiveRecognitionWall }) {
  const wall =
    live.state === 'error' ? (
      <ErrorState title="We couldn't load the wall." description="Try again in a moment." onRetry={live.onRetry} />
    ) : live.state === 'loading' ? (
      <Skeleton height={300} />
    ) : live.kudos.length === 0 ? (
      <EmptyState title={live.value ? `No kudos for ${live.value} yet` : 'No kudos yet'} description="Be the first to thank a colleague." action={<Button icon={Gift} onClick={live.onGive}>Give kudos</Button>} />
    ) : (
      <div className="yx-growth-stack">
        {live.kudos.map((k) => (
          // Likes here; comments and reports are in the feed, where the same kudos shows.
          <PostCard key={k.id} post={kudosPost(k)} now={live.now} social={Boolean(live.onLike)} onLike={live.onLike ? () => live.onLike!(k.id) : undefined} />
        ))}
      </div>
    );
  return (
    <GrowthFrame area="engage" active="Recognition" persona="emp">
      <PageHeader title="Recognition" actions={<Button variant="primary" icon={Gift} onClick={live.onGive}>Give kudos</Button>} />
      <div className="yx-growth-row">
        <Button size="sm" aria-pressed={live.value == null} onClick={() => live.onValue(null)}>
          All values · {live.total}
        </Button>
        {live.values.map((c) => (
          <Button key={c.value} size="sm" aria-pressed={live.value === c.value} onClick={() => live.onValue(c.value)}>
            {c.value} · {c.count}
          </Button>
        ))}
      </div>
      <div className="yx-growth-feed">
        {wall}
        <Card title="Leaderboard">
          <Text tone="secondary">Your company thanks with badges only, so there are no points or leaderboard. The wall shows everyone’s kudos.</Text>
        </Card>
      </div>
    </GrowthFrame>
  );
}
