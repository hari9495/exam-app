// Engage recognition: give kudos (ENG-08), recognition wall + leaderboard (ENG-09), rewards (ENG-10), perks (ENG-12).
import { useMemo, useState } from 'react';
import { Award, Copy, Gift, Info, ShoppingBag, Tag as TagIcon, Trophy } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
import { FormField } from '../../components/field';
import { NumberField, TextArea } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { MultiSelect, Select, type SelectOption } from '../../components/select';
import { formatDate, formatINR } from '../../lib/format';
import { TODAY } from '../_kit/data';
import { GrowthFrame, PostCard, type Device, type FeedPost } from './growth-kit';
import { redemptionTax, validateKudos } from './growth-logic';
import type { LoadState } from './perf-goals';
import './growth.css';

/* ================================================================== ENG-08 · Give kudos */

export interface KudosSheetProps {
  device?: Device;
  me: string;
  people: SelectOption[];
  values: string[];
  badges: string[];
  /** null = company uses badges only (the default). */
  points: { allowance: number; approvalThreshold: number; managerChainLimit: number; managerChain: string[] } | null;
  defaults?: { to?: string[]; value?: string | null; points?: number; message?: string };
  sent?: boolean;
}

/** ENG-08 Give kudos (T4): people, a company value (required), optional badge and points; approval above threshold (YX-ENG-06). */
export function GiveKudosScreen({ device = 'desktop', me, people, values, badges, points, defaults = {}, sent }: KudosSheetProps) {
  const [to, setTo] = useState<string[]>(defaults.to ?? []);
  const [value, setValue] = useState<string | null>(defaults.value ?? null);
  const [badge, setBadge] = useState<string | null>(null);
  const [pts, setPts] = useState<number | null>(defaults.points ?? 0);
  const [msg, setMsg] = useState(defaults.message ?? '');
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(!!sent);
  const names = to.map((id) => people.find((p) => p.value === id)?.label ?? id);
  const v = validateKudos({
    giver: me,
    receivers: names,
    value,
    points: points ? pts ?? 0 : 0,
    managerChain: points?.managerChain ?? [],
    allowance: points?.allowance ?? 0,
    approvalThreshold: points?.approvalThreshold ?? 0,
    managerChainLimit: points?.managerChainLimit ?? 0,
  });
  const errors = tried || defaults.points ? v.errors : [];
  const body = done ? (
    <InlineAlert tone="success" title={`Kudos sent to ${names.join(', ') || 'Meera Iyer'}`}>
      {v.needsApproval ? 'The points wait for manager approval; the kudos is posted now.' : 'Posted in the Quality team space. They’ve been told.'}
    </InlineAlert>
  ) : (
    <div className="yx-growth-stack">
      <FormField label="Who do you want to thank?" required error={tried && to.length === 0 ? 'Choose at least one person to thank.' : null}>
        <MultiSelect value={to} onChange={setTo} options={people.filter((p) => p.label !== me || points == null)} placeholder="Search people" />
      </FormField>
      <FormField label="Company value" required error={tried && !value ? 'Pick a company value for this kudos.' : null}>
        <RadioGroup aria-label="Company value" value={value ?? ''} onChange={setValue} options={values.map((x) => ({ value: x, label: x }))} />
      </FormField>
      <FormField label="Badge" optional>
        <Select value={badge} onChange={setBadge} clearable placeholder="No badge" options={badges.map((b) => ({ value: b, label: b }))} />
      </FormField>
      {points && (
        <FormField label="Points each" helper={`You have ${points.allowance} points left this month. Above ${points.approvalThreshold} points needs approval.`}>
          <NumberField value={pts} onChange={setPts} min={0} />
        </FormField>
      )}
      <FormField label="Message" required>
        <TextArea value={msg} onChange={setMsg} rows={3} />
      </FormField>
      {errors.length > 0 && (
        <InlineAlert tone="danger" title="Fix these to send">
          <ul className="yx-growth-list">
            {errors.map((e) => (
              <li key={e} className="yx-growth-list__item">
                {e}
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}
      <div className="yx-growth-effect" aria-live="polite">
        <span className="yx-growth-effect__title">When you send</span>
        <ul>
          <li>Posted in the team space and shown on the recognition wall.</li>
          {points && v.totalPoints > 0 && <li>{v.totalPoints} points from your allowance{v.needsApproval ? ', after approval by your manager' : ''}.</li>}
          <li>Appears as context in their next review, never as a score. They can hide it from the review.</li>
        </ul>
      </div>
    </div>
  );
  const btn = !done && (
    <Button
      variant="primary"
      icon={Gift}
      fullWidth={device === 'phone'}
      onClick={() => {
        setTried(true);
        if (v.errors.length === 0 && msg.trim()) setDone(true);
      }}
    >
      {v.needsApproval ? 'Send for approval' : 'Send kudos'}
    </Button>
  );
  const footer = <div className="yx-growth-foot">{btn}</div>;
  if (device === 'phone')
    return (
      <GrowthFrame area="engage" active="Recognition" persona="emp" device="phone" phone={{ tab: 'home', title: 'Home' }}>
        <BottomSheet open onOpenChange={() => {}} title="Give kudos" footer={footer}>
          {body}
        </BottomSheet>
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Recognition" persona="emp">
      <PageHeader title="Recognition" />
      <Drawer open onOpenChange={() => {}} title="Give kudos" footer={footer} dirty={msg.length > 0}>
        {body}
      </Drawer>
    </GrowthFrame>
  );
}

/* ================================================================== ENG-09 · Recognition wall + leaderboard */

export interface LeaderRow {
  id: string;
  name: string;
  team: string;
  points: number;
  kudos: number;
}

/** ENG-09 Recognition wall + leaderboard (T6): filter by value; leaderboard shows points only, per scope and period; company can switch it off. */
export function RecognitionWallScreen({ device = 'desktop', kudos, values, leaders, leaderboardOn = true, optedOut, state = 'ready' }: { device?: Device; kudos: FeedPost[]; values: string[]; leaders: LeaderRow[]; leaderboardOn?: boolean; optedOut?: boolean; state?: LoadState }) {
  const [value, setValue] = useState<string | null>(null);
  const [scope, setScope] = useState('department');
  const shown = kudos.filter((k) => !value || k.value === value);
  const counts = values.map((v) => ({ v, n: kudos.filter((k) => k.value === v).length }));
  const wall =
    state === 'loading' ? (
      <Skeleton height={300} />
    ) : shown.length === 0 ? (
      <EmptyState title={value ? `No kudos for ${value} yet` : 'No kudos yet'} description="Be the first to thank a colleague." action={<Button icon={Gift}>Give kudos</Button>} />
    ) : (
      <div className="yx-growth-stack">
        {shown.map((k) => (
          <PostCard key={k.id} post={k} now={TODAY} />
        ))}
      </div>
    );
  const board = !leaderboardOn ? (
    <Text tone="secondary">Your company has switched leaderboards off. The wall still shows everyone’s kudos.</Text>
  ) : (
    <div className="yx-growth-stack">
      <RadioGroup aria-label="Scope" orientation="horizontal" value={scope} onChange={setScope} options={[{ value: 'team', label: 'Team' }, { value: 'department', label: 'Department' }, { value: 'company', label: 'Company' }]} />
      <ol className="yx-growth-list" aria-label="Leaderboard, September 2026">
        {leaders.map((l, i) => (
          <li key={l.id} className="yx-growth-list__item">
            <span className="yx-growth-num yx-growth-meta">{i + 1}</span>
            <PersonLabel name={l.name} secondary={l.team} />
            <span className="yx-growth-grow" />
            <span className="yx-growth-num">{l.points} points</span>
          </li>
        ))}
      </ol>
      <Text size="sm" tone="secondary">
        {optedOut ? 'You’re hidden from leaderboards. You still see your own 120 points.' : 'Points only. Anyone can hide themselves in Me › Preferences.'}
      </Text>
    </div>
  );
  const filter = (
    <div className="yx-growth-row">
      <Button size="sm" aria-pressed={value == null} onClick={() => setValue(null)}>
        All values · {kudos.length}
      </Button>
      {counts.map((c) => (
        <Button key={c.v} size="sm" aria-pressed={value === c.v} onClick={() => setValue(c.v)}>
          {c.v} · {c.n}
        </Button>
      ))}
    </div>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="engage" active="Recognition" persona="emp" device="phone" phone={{ tab: 'home', title: 'Recognition' }}>
        <Tabs defaultValue="wall">
          <TabsList aria-label="Recognition">
            <TabsTrigger value="wall">Wall</TabsTrigger>
            {leaderboardOn && <TabsTrigger value="board">Leaderboard</TabsTrigger>}
          </TabsList>
          <TabsContent value="wall">
            <div className="yx-growth-stack">
              {filter}
              {wall}
            </div>
          </TabsContent>
          <TabsContent value="board">{board}</TabsContent>
        </Tabs>
        <div className="yx-growth-pinned">
          <Button variant="primary" fullWidth icon={Gift}>
            Give kudos
          </Button>
        </div>
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Recognition" persona="emp">
      <PageHeader title="Recognition" actions={<Button variant="primary" icon={Gift}>Give kudos</Button>} />
      {filter}
      <div className="yx-growth-feed">
        {wall}
        <Card title="Leaderboard · September" actions={<Icon icon={Trophy} />}>
          {board}
        </Card>
      </div>
    </GrowthFrame>
  );
}

/* ================================================================== ENG-10 · Rewards */

export interface RewardItem {
  id: string;
  name: string;
  kind: 'Voucher' | 'Gift card' | 'Payroll payout';
  points: number;
  valueINR: number;
  partner: string;
}

export interface LedgerRow {
  id: string;
  at: Date;
  text: string;
  change: number;
  kind: 'Earned' | 'Redeemed' | 'Expired' | 'Reversed';
}

/** ENG-10 Rewards (T2): balance, catalogue (vouchers via partner, payroll payout), redeem with tax effect (YX-ENG-07), ledger. */
export function RewardsScreen({ device = 'desktop', balance, expiring, catalogue, ledger, giftsThisYear, redeemId, pointValue = 1 }: { device?: Device; balance: number; expiring?: { points: number; on: Date }; catalogue: RewardItem[]; ledger: LedgerRow[]; giftsThisYear: number; redeemId?: string; pointValue?: number }) {
  const [redeem, setRedeem] = useState<string | null>(redeemId ?? null);
  const item = catalogue.find((c) => c.id === redeem);
  const tax = item ? redemptionTax(item.valueINR, giftsThisYear) : null;
  const head = (
    <section className="yx-growth-panel" aria-label="Points balance">
      <div className="yx-growth-row" data-between="">
        <span>
          <span className="yx-growth-points">{balance}</span> <Text tone="secondary">points · worth {formatINR(balance * pointValue)}</Text>
        </span>
        {expiring && <Badge tone="warning">{expiring.points} expire on {formatDate(expiring.on)}</Badge>}
      </div>
    </section>
  );
  const cat = (
    <div className="yx-growth-cards">
      {catalogue.map((c) => (
        <article key={c.id} className="yx-growth-card" aria-label={c.name}>
          <div className="yx-growth-card__thumb" aria-hidden="true">
            <Icon icon={c.kind === 'Payroll payout' ? Award : ShoppingBag} size="md" />
          </div>
          <h3 className="yx-growth-card__title">{c.name}</h3>
          <span className="yx-growth-meta">
            {c.kind} · {c.partner}
          </span>
          <div className="yx-growth-card__foot">
            <span className="yx-growth-num yx-growth-grow">{c.points} points</span>
            <Button size="sm" disabled={c.points > balance} onClick={() => setRedeem(c.id)}>
              {c.points > balance ? `Need ${c.points - balance} more` : 'Redeem'}
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
  const hist = (
    <DataTable
      label="Points history"
      rows={ledger}
      getRowId={(r) => r.id}
      columns={[
        { key: 'at', header: 'Date', type: 'date', value: (r) => r.at, width: 120 },
        { key: 'text', header: 'What', value: (r) => r.text, width: 320 },
        { key: 'kind', header: 'Type', type: 'status', value: (r) => r.kind, statusTone: (v) => (v === 'Earned' ? 'success' : v === 'Expired' || v === 'Reversed' ? 'warning' : 'neutral'), width: 120 },
        { key: 'change', header: 'Points', type: 'number', value: (r) => r.change, render: (r) => (r.change > 0 ? `+${r.change}` : String(r.change)), width: 100 },
      ]}
    />
  );
  const dialog = item && tax && (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && setRedeem(null)}
      title={`Redeem ${item.points} points for ${item.name}?`}
      consequence={
        tax.taxable
          ? `This takes your gifts this year to ${formatINR(giftsThisYear + item.valueINR)}, above the ₹5,000 limit. ${formatINR(tax.taxableAmount)} is added to your ${item.kind === 'Payroll payout' ? 'October pay' : 'October payslip as a taxable perquisite'}, and tax is deducted on it.`
          : `Your gifts this year stay within the ₹5,000 tax-free limit. ${item.kind === 'Payroll payout' ? 'Paid with your October salary.' : `The code is emailed by ${item.partner} within a day.`}`
      }
      confirmLabel="Redeem points"
      onConfirm={() => setRedeem(null)}
    />
  );
  const tabs = (
    <Tabs defaultValue="catalogue">
      <TabsList aria-label="Rewards">
        <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
        <TabsTrigger value="history" count={ledger.length}>
          History
        </TabsTrigger>
      </TabsList>
      <TabsContent value="catalogue">{cat}</TabsContent>
      <TabsContent value="history">{hist}</TabsContent>
    </Tabs>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="engage" active="Recognition" persona="emp" device="phone" phone={{ tab: 'me', title: 'Rewards', back: true }}>
        {head}
        {tabs}
        {dialog}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Recognition" persona="emp">
      <PageHeader title="Rewards" description="Points from kudos you received. Redeem them for vouchers or a payroll payout." />
      {head}
      {tabs}
      {dialog}
    </GrowthFrame>
  );
}

/* ================================================================== ENG-12 · Perks */

export interface PerkOffer {
  id: string;
  partner: string;
  category: 'Phones' | 'Travel' | 'Groceries' | 'Learning';
  title: string;
  detail: string;
  terms: string;
  fields: string[];
}

/** ENG-12 Perks (T2 / T8): category tabs, "Partner offer" labels, detail, consent sheet listing each field to share, code; hidden when perks are off (YX-AST-16). */
export function PerksScreen({ device = 'desktop', enabled = true, offers, categories, openId, consentOpen, code }: { device?: Device; enabled?: boolean; offers: PerkOffer[]; categories: PerkOffer['category'][]; openId?: string; consentOpen?: boolean; code?: string }) {
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [consent, setConsent] = useState(!!consentOpen);
  const [share, setShare] = useState<string[]>(['Work email']);
  const [issued, setIssued] = useState<string | null>(code ?? null);
  const offer = offers.find((o) => o.id === open);
  const byCat = useMemo(() => Object.fromEntries(categories.map((c) => [c, offers.filter((o) => o.category === c)])), [categories, offers]);
  if (!enabled)
    return (
      <GrowthFrame area="engage" active="Recognition" persona="emp" device={device} phone={{ tab: 'me', title: 'Rewards' }}>
        <PageHeader title="Recognition" />
        <Tabs defaultValue="wall">
          <TabsList aria-label="Recognition">
            <TabsTrigger value="wall">Wall</TabsTrigger>
            <TabsTrigger value="rewards">Rewards</TabsTrigger>
          </TabsList>
          <TabsContent value="wall">
            <Text tone="secondary">Perks are switched off for Kaveri Foods, so there is no Perks tab.</Text>
          </TabsContent>
          <TabsContent value="rewards">
            <Text tone="secondary">Your points and rewards.</Text>
          </TabsContent>
        </Tabs>
      </GrowthFrame>
    );
  const detail = offer && (
    <div className="yx-growth-stack">
      <Badge tone="info">
        <Icon icon={TagIcon} /> Partner offer
      </Badge>
      <Text>{offer.detail}</Text>
      <DescriptionList items={[{ label: 'Offered by', value: offer.partner }, { label: 'Terms', value: offer.terms }]} />
      <Text size="sm" tone="secondary">
        Nothing about you goes to {offer.partner} unless you choose to share it when you redeem.
      </Text>
      {issued && (
        <div className="yx-growth-stack" data-gap="sm">
          <Text weight="medium">Your code</Text>
          <div className="yx-growth-code" aria-live="polite">
            {issued}
          </div>
          <Button size="sm" icon={Copy}>
            Copy code
          </Button>
        </div>
      )}
    </div>
  );
  const consentBody = offer && (
    <div className="yx-growth-stack">
      <Text>Choose what {offer.partner} receives to give you this offer. Only the fields you tick are sent.</Text>
      {offer.fields.map((f) => (
        <Checkbox key={f} checked={share.includes(f)} onChange={(c) => setShare((xs) => (c ? [...xs, f] : xs.filter((x) => x !== f)))} label={f} description={f === 'Work email' ? 'To send your code and verify you work here' : f === 'Mobile number' ? 'For delivery updates' : 'To address the order'} />
      ))}
      <InlineAlert tone="info">
        {offer.partner} uses these under its own privacy notice. You can withdraw by writing to them. YukthiX may earn a commission; it doesn’t change the price you pay. <Link href="#g46">Read the full notice</Link>
      </InlineAlert>
    </div>
  );
  const consentFooter = (
    <div className="yx-growth-foot">
      <Button onClick={() => setConsent(false)}>Cancel</Button>
      <Button
        variant="primary"
        disabled={share.length === 0}
        onClick={() => {
          setConsent(false);
          setIssued('KAVERI-PERK-7Q2M');
        }}
      >
        Share {share.length} {share.length === 1 ? 'field' : 'fields'} and get code
      </Button>
    </div>
  );
  const list = (
    <Tabs defaultValue={categories[0]}>
      <TabsList aria-label="Perk categories">
        {categories.map((c) => (
          <TabsTrigger key={c} value={c} count={byCat[c].length}>
            {c}
          </TabsTrigger>
        ))}
      </TabsList>
      {categories.map((c) => (
        <TabsContent key={c} value={c}>
          {byCat[c].length === 0 ? (
            <EmptyState compact title={`No ${c.toLowerCase()} offers right now`} />
          ) : (
            <div className="yx-growth-cards">
              {byCat[c].map((o) => (
                <article key={o.id} className="yx-growth-card" aria-label={o.title}>
                  <Badge tone="info">
                    <Icon icon={TagIcon} /> Partner offer
                  </Badge>
                  <h3 className="yx-growth-card__title">{o.title}</h3>
                  <span className="yx-growth-meta">{o.partner}</span>
                  <div className="yx-growth-card__foot">
                    <Button size="sm" onClick={() => setOpen(o.id)}>
                      View offer
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
  const about = (
    <Text size="sm" tone="secondary">
      <Icon icon={Info} /> Offers come from independent partners. YukthiX may earn a commission. <Link href="#about">About perks</Link>
    </Text>
  );
  const redeemBtn = offer && !issued && (
    <Button variant="primary" fullWidth={device === 'phone'} onClick={() => setConsent(true)}>
      Redeem offer
    </Button>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="engage" active="Recognition" persona="emp" device="phone" phone={{ tab: 'me', title: offer ? offer.title : 'Perks', back: !!offer }}>
        {offer ? detail : list}
        {!offer && about}
        {redeemBtn && <div className="yx-growth-pinned">{redeemBtn}</div>}
        {offer && (
          <BottomSheet open={consent} onOpenChange={setConsent} title="Share details to redeem" footer={consentFooter}>
            {consentBody}
          </BottomSheet>
        )}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="engage" active="Recognition" persona="emp">
      <PageHeader title="Perks" description="Discounts from partners, chosen by Kaveri Foods." />
      {about}
      {list}
      {offer && (
        <Drawer open onOpenChange={(o) => !o && setOpen(null)} title={offer.title} subtitle={offer.partner} footer={<div className="yx-growth-foot">{redeemBtn}</div>}>
          {detail}
        </Drawer>
      )}
      {offer && (
        <ConfirmDialog open={consent} onOpenChange={setConsent} title="Share details to redeem" confirmLabel={`Share ${share.length} ${share.length === 1 ? 'field' : 'fields'} and get code`} confirmDisabled={share.length === 0} onConfirm={() => { setConsent(false); setIssued('KAVERI-PERK-7Q2M'); }} size="md">
          {consentBody}
        </ConfirmDialog>
      )}
    </GrowthFrame>
  );
}
