import { useState, type FormEvent } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Stepper } from '../../components/stepper';
import { Card } from '../../components/shell';
import { Icon, Text } from '../../components/foundations';
import { useRun } from '../org/org-kit';
import { AuthFrame } from '../auth/kit';
import { DeskPage } from './desk-kit';
import { BannersTab, SecretBox, type BannerSetupProps } from './setup-channels';
import type { PolicyInput } from './setup-sla';
import type { DeskKind, DeskSummary, LoadState, WebhookSecret } from './types';

// Getting started with the Service Desk (SD-1.29, US-G-034): the set-up checklist worked out from what exists, a
// three-step wizard for the first desk (desk, response targets, support email), and what is new. Also the agents' own
// Known issues page (founder decision 8 Oct 2026) and the public sign-up for a company that uses only the Service Desk.

export interface ChecklistStep {
  key: string;
  label: string;
  done: boolean;
  link: string;
  optional?: boolean;
}

export interface SetupChecklist {
  steps: ChecklistStep[];
  done: number;
  total: number;
  standalone: boolean;
}

export type TargetPreset = 'simple' | 'faster';

export interface SetupStartProps {
  checklist: SetupChecklist | null;
  onCreateDesk: (input: { name: string; key: string; kind: DeskKind }) => Promise<{ id: string }>;
  onCreatePolicy: (deskId: string, input: PolicyInput & { name: string; kind: 'sla' }) => Promise<void>;
  /** A hosted mailbox answers with its webhook address and secret (shown once). */
  onCreateMailbox: (deskId: string, address: string) => Promise<Partial<WebhookSecret>>;
}

/** Minutes for P1–P4. Simple suits most teams; Faster is for teams that answer within the hour. */
export const PRESETS: Record<TargetPreset, { label: string; text: string; firstResponse: number[]; resolution: number[] }> = {
  simple: { label: 'Simple', text: 'First answer within 1 hour (urgent) to 1 working day (low); solved within 1 to 4 working days.', firstResponse: [60, 240, 480, 1440], resolution: [480, 1440, 2880, 5760] },
  faster: { label: 'Faster', text: 'First answer within 15 minutes (urgent) to 4 hours (low); solved within 4 hours to 2 working days.', firstResponse: [15, 60, 120, 240], resolution: [240, 480, 1440, 2880] },
};

export function presetPolicy(p: TargetPreset): PolicyInput & { name: string; kind: 'sla' } {
  return {
    name: `Response targets (${PRESETS[p].label.toLowerCase()})`,
    kind: 'sla',
    scope: { match: 'all', rules: [] },
    calendarSource: 'desk',
    targets: [
      { metric: 'first_response', minutes: PRESETS[p].firstResponse },
      { metric: 'resolution', minutes: PRESETS[p].resolution },
    ],
    pauseStates: ['pending', 'on_hold'],
    recount: 'keep',
  };
}

/** Short product updates, newest first. */
export const WHATS_NEW: { title: string; text: string; href: string; link: string }[] = [
  { title: 'Help articles', text: 'Write answers once and they show up while people raise a ticket.', href: '/yx/desk/knowledge', link: 'Open help articles' },
  { title: 'Reports and wallboards', text: 'Ready reports for response targets, workload and satisfaction, plus a TV wallboard.', href: '/yx/desk/reports', link: 'Open reports' },
  { title: 'Known issues', text: 'Agents can post a banner about an outage; people press “Me too” instead of raising a new ticket.', href: '/yx/desk/known-issues', link: 'Open known issues' },
  { title: 'Directory sync', text: 'Keep your people in step with Active Directory, LDAP or SCIM, and give directory groups desk seats.', href: '/yx/desk/people-list', link: 'Open the people list' },
  { title: 'Privacy requests', text: 'Answer requests for a copy of someone’s data or to erase it, with a legal hold when you need one.', href: '/yx/desk/privacy', link: 'Open privacy requests' },
];

export function SetupStart(props: SetupStartProps) {
  const [wizard, setWizard] = useState(false);
  const c = props.checklist;
  return (
    <div className="yx-ops-stack">
      <Card
        title="Get started"
        actions={
          !wizard ? (
            <Button size="sm" variant="primary" onClick={() => setWizard(true)}>
              Set up a desk in 3 steps
            </Button>
          ) : undefined
        }
      >
        {c ? (
          <div className="yx-ops-stack" data-gap="sm">
            <p className="yx-ops-muted">
              {c.done} of {c.total} done.
            </p>
            <ul className="yx-ops-list" aria-label="Set-up checklist">
              {c.steps.map((s) => (
                <li key={s.key} className="yx-ops-list__item">
                  <span className="yx-ops-row">
                    <Icon icon={s.done ? CheckCircle2 : Circle} />
                    <span className="yx-ops-list__title">
                      {s.label}
                      {s.optional ? ' (optional)' : ''}
                    </span>
                  </span>
                  <span className="yx-ops-row">
                    <Badge tone={s.done ? 'success' : 'neutral'}>{s.done ? 'Done' : 'To do'}</Badge>
                    <Button size="sm" asChild>
                      <a href={s.link} aria-label={`${s.done ? 'Open' : 'Do it'}: ${s.label}`}>
                        {s.done ? 'Open' : 'Do it'}
                      </a>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState compact title="The checklist is not loaded yet." />
        )}
      </Card>
      {wizard && <DeskWizard {...props} onClose={() => setWizard(false)} />}
      <Card title="What’s new">
        <ul className="yx-ops-list" aria-label="What’s new">
          {WHATS_NEW.map((n) => (
            <li key={n.title} className="yx-ops-list__item">
              <span className="yx-ops-list__main">
                <span className="yx-ops-list__title">{n.title}</span>
                <span className="yx-ops-list__sub">{n.text}</span>
              </span>
              <Link href={n.href}>{n.link}</Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function DeskWizard(props: SetupStartProps & { onClose: () => void }) {
  const [current, setCurrent] = useState('desk');
  const [audience, setAudience] = useState<'employee' | 'customer'>('employee');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [deskId, setDeskId] = useState<string | null>(null);
  const [preset, setPreset] = useState<TargetPreset>('simple');
  const [targetsSet, setTargetsSet] = useState(false);
  const [address, setAddress] = useState('');
  const [secret, setSecret] = useState<WebhookSecret | null>(null);
  const [mailboxDone, setMailboxDone] = useState(false);
  const { busy, error, run } = useRun();
  const keyOk = /^[A-Z][A-Z0-9]{1,9}$/.test(key);
  return (
    <Card title="Set up a desk in 3 steps">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
        <Stepper
          title="Set up a desk"
          current={current}
          onCurrentChange={setCurrent}
          continueBlocked={current === 'desk' && !deskId ? 'Create the desk first' : undefined}
          finishLabel="Finish"
          onFinish={props.onClose}
          steps={[
            {
              id: 'desk',
              title: 'Your desk',
              description: 'Name, key and kind',
              status: deskId ? 'done' : undefined,
              content: (
                <div className="yx-ops-stack">
                  <FormField label="Kind of desk" required helper="Chosen once. Employee help desks answer your own people; Customer support desks answer your customers.">
                    <Segment label="Kind of desk" options={[{ value: 'employee', label: 'Employee help desk' }, { value: 'customer', label: 'Customer support desk' }]} value={audience} onChange={setAudience} />
                  </FormField>
                  <FormField label="Desk name" required>
                    <TextField value={name} onChange={setName} maxLength={100} placeholder={audience === 'customer' ? 'Customer support' : 'IT help desk'} disabled={Boolean(deskId)} />
                  </FormField>
                  <FormField label="Short key" required helper="2–10 capital letters or digits. Ticket numbers start with it, like IT-1001." error={key && !keyOk ? 'Use capital letters and digits, starting with a letter' : null}>
                    <TextField value={key} onChange={(v) => setKey(v.toUpperCase())} maxLength={10} disabled={Boolean(deskId)} />
                  </FormField>
                  {deskId ? (
                    <InlineAlert tone="success">The desk is created. Continue to set its response targets.</InlineAlert>
                  ) : (
                    <span>
                      <Button
                        variant="primary"
                        disabled={!name.trim() || !keyOk}
                        loading={busy === 'desk'}
                        onClick={() =>
                          void run('desk', async () => {
                            const d = await props.onCreateDesk({ name: name.trim(), key, kind: audience === 'customer' ? 'customer_support' : 'custom' });
                            setDeskId(d.id);
                            setCurrent('targets');
                          })
                        }
                      >
                        Create desk
                      </Button>
                    </span>
                  )}
                </div>
              ),
            },
            {
              id: 'targets',
              title: 'Response targets',
              description: 'How fast you answer',
              status: !deskId ? 'locked' : targetsSet ? 'done' : undefined,
              statusNote: 'Create the desk first',
              content: (
                <div className="yx-ops-stack">
                  <FormField label="Targets" helper="Counted in working hours. You can change every target later under Desk set-up › Response targets.">
                    <Segment label="Targets" options={[{ value: 'simple', label: 'Simple' }, { value: 'faster', label: 'Faster' }]} value={preset} onChange={setPreset} />
                  </FormField>
                  <p>{PRESETS[preset].text}</p>
                  {targetsSet ? (
                    <InlineAlert tone="success">Response targets are set.</InlineAlert>
                  ) : (
                    <span>
                      <Button
                        variant="primary"
                        disabled={!deskId}
                        loading={busy === 'targets'}
                        onClick={() =>
                          void run('targets', async () => {
                            await props.onCreatePolicy(deskId!, presetPolicy(preset));
                            setTargetsSet(true);
                            setCurrent('email');
                          })
                        }
                      >
                        Set these targets
                      </Button>
                    </span>
                  )}
                </div>
              ),
            },
            {
              id: 'email',
              title: 'Support email',
              description: 'Email becomes tickets',
              status: !deskId ? 'locked' : mailboxDone ? 'done' : undefined,
              statusNote: 'Create the desk first',
              content: (
                <div className="yx-ops-stack">
                  <FormField label="Support email address" helper="Mail to this address becomes a ticket on the desk. Point your mail service at the web address we show next.">
                    <TextField type="email" value={address} onChange={setAddress} maxLength={254} placeholder="help@yourcompany.com" disabled={mailboxDone} />
                  </FormField>
                  {secret && <SecretBox secret={secret} onDone={() => setSecret(null)} />}
                  {mailboxDone ? (
                    !secret && <InlineAlert tone="success">The support email is connected. Press Finish.</InlineAlert>
                  ) : (
                    <span>
                      <Button
                        variant="primary"
                        disabled={!deskId || !/^[^@\s+]+@[^@\s]+\.[^@\s]+$/.test(address.trim())}
                        loading={busy === 'email'}
                        onClick={() =>
                          void run('email', async () => {
                            const m = await props.onCreateMailbox(deskId!, address.trim().toLowerCase());
                            if (m.webhookUrl && m.signingSecret) setSecret({ webhookUrl: m.webhookUrl, signingSecret: m.signingSecret });
                            setMailboxDone(true);
                          })
                        }
                      >
                        Connect the address
                      </Button>
                    </span>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- known issues (agents)

export interface KnownIssuesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  /** The desks this agent works on. */
  desks: DeskSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  banners: BannerSetupProps | null;
}

export function KnownIssuesScreen(props: KnownIssuesScreenProps) {
  return (
    <DeskPage title="Known issues" description="Tell people about an outage or a known problem at the top of their help page, so they do not raise the same ticket again." state={props.state} onRetry={props.onRetry} what="the known issues">
      {props.desks.length === 0 ? (
        <EmptyState title="You do not work on any desk yet." description="Ask your Service Desk admin to add you to a desk." />
      ) : (
        <div className="yx-ops-stack">
          {props.desks.length > 1 && (
            <FormField label="Desk">
              <Select value={props.selectedId} onChange={(v) => v && props.onSelect(v)} options={props.desks.map((d) => ({ value: d.id, label: d.name }))} />
            </FormField>
          )}
          {props.banners && <BannersTab {...props.banners} />}
        </div>
      )}
    </DeskPage>
  );
}

// ---------------------------------------------------------------------------------------------- sign-up (public)

export interface DeskSignUpInput {
  company: string;
  slug: string;
  name: string;
  email: string;
}

export interface DeskSignUpScreenProps {
  onSubmit: (input: DeskSignUpInput) => Promise<void>;
  signInHref: string;
}

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

/** A company that uses only the Service Desk starts a 30-day trial; the first admin sets a password from the email. */
export function DeskSignUpScreen({ onSubmit, signInHref }: DeskSignUpScreenProps) {
  const [company, setCompany] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useRun();
  const code = slugTouched ? slug : slugOf(company);
  const codeOk = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(code);
  const ok = company.trim().length >= 2 && codeOk && name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    void run('go', async () => {
      await onSubmit({ company: company.trim(), slug: code, name: name.trim(), email: email.trim().toLowerCase() });
      setSent(true);
    });
  };
  return (
    <AuthFrame title={sent ? 'Check your email' : 'Start your Service Desk'} subtitle={sent ? undefined : 'Free for 30 days. No card needed.'}>
      {sent ? (
        <div className="yx-auth__form">
          <Text as="p" role="status">
            Check your email to set your password. Your 30-day trial has started, no card needed.
          </Text>
          <Link href={signInHref}>Go to sign in</Link>
        </div>
      ) : (
        <form className="yx-auth__form" onSubmit={submit} noValidate>
          <FormField label="Company name" required>
            <TextField value={company} onChange={setCompany} maxLength={200} autoComplete="organization" />
          </FormField>
          <FormField label="Company code" required helper="Used to sign in. 3 to 50 lowercase letters, digits and hyphens." error={code && !codeOk ? 'Use 3 to 50 lowercase letters, digits and hyphens' : null}>
            <TextField
              value={code}
              onChange={(v) => {
                setSlugTouched(true);
                setSlug(v.toLowerCase());
              }}
              maxLength={50}
              spellCheck={false}
              autoCapitalize="none"
            />
          </FormField>
          <FormField label="Your name" required>
            <TextField value={name} onChange={setName} maxLength={120} autoComplete="name" />
          </FormField>
          <FormField label="Work email" required helper="We send the link to set your password here.">
            <TextField type="email" value={email} onChange={setEmail} maxLength={320} autoComplete="email" spellCheck={false} autoCapitalize="none" />
          </FormField>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Button type="submit" variant="primary" fullWidth loading={busy === 'go'} disabled={!ok}>
            Start free trial
          </Button>
          <Link href={signInHref}>Already have an account? Sign in</Link>
        </form>
      )}
    </AuthFrame>
  );
}
