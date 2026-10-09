// YukthiX-hosted public T9 pages: developer portal (T9-10), help centre (T9-16), status page (T9-17),
// public roadmap (T9-22), calculators and letter generators (T9-23), integrations directory (T9-24), academy (T9-25).
import { useMemo, useState } from 'react';
import { BookOpen, Download, ExternalLink, PlayCircle, Search, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextField } from '../../components/inputs';
import { Checkbox, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { Icon } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import {
  ctcToInHand,
  daysUntil,
  esi,
  gratuity,
  hraExemption,
  incomeTax,
  leaveEncashment,
  overallStatus,
  STATUS_LABEL,
  toggleVote,
  uptimePercent,
  type ComponentStatus,
} from './portals-logic';
import { CodeBlock, Fact, FactRow, OtpInput, QrCode, StatusBadge, TenantPortal, UptimeBar, type UptimeDay } from './portals-kit';
import type { Integration, RoadmapItem, RoadmapStatus, StatusComponentRow } from './t9-pub-data';

const YX_FOOTER = { privacy: 'YukthiX privacy notice (G-05)', cookies: true };

/* ================================================================== */
/* T9-10 Developer portal                                              */
/* ================================================================== */

export type DevSection = 'home' | 'reference' | 'webhooks' | 'changelog' | 'sandbox' | 'sandbox-done';

const CURL = `curl https://api.in.yukthix.com/v1/leave-requests \\
  -H "Authorization: Bearer <YOUR_SANDBOX_KEY>" \\
  -H "Idempotency-Key: 5f1c9e0a-2b7d-4c3a-9e11-0c2d7b6f8a41" \\
  -H "Content-Type: application/json" \\
  -d '{
    "employee_id": "emp_01J9ZK4T7Q",
    "leave_type": "casual",
    "from": "2026-10-05",
    "to": "2026-10-06",
    "reason": "Family function"
  }'`;

const RESPONSE = `HTTP/1.1 201 Created
RateLimit-Limit: 600
RateLimit-Remaining: 598
RateLimit-Reset: 42

{
  "id": "lvr_01J9ZM2B8W",
  "status": "pending_approval",
  "days": 2,
  "approver": { "id": "emp_01J7Q2X4N1", "name": "Karthik Subramanian" }
}`;

const PROBLEM = `HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "https://developers.yukthix.com/problems/idempotency-conflict",
  "title": "Idempotency key reused with a different body",
  "status": 409,
  "code": "idempotency_conflict"
}`;

const WEBHOOK = `import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(body: string, header: string, secret: string, now = Date.now()) {
  const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
  if (Math.abs(now / 1000 - Number(t)) > 300) return false; // 5-minute replay window
  const expected = createHmac("sha256", secret).update(\`\${t}.\${body}\`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`;

// T9-10
/** Public developer docs: API reference, guides, changelog, status and sandbox sign-up (P11 §7). */
export function DeveloperPortalScreen({
  section,
  endpoints,
  changelog,
  today,
}: {
  section: DevSection;
  endpoints: { method: string; path: string; summary: string; scope: string }[];
  changelog: { date: Date; version: string; kind: string; text: string }[];
  today: Date;
}) {
  const [otp, setOtp] = useState('');
  const nav = [
    { label: 'Overview', active: section === 'home' },
    { label: 'API reference', active: section === 'reference' },
    { label: 'Guides', active: section === 'webhooks' },
    { label: 'Changelog', active: section === 'changelog' },
    { label: 'Status' },
    { label: 'Sandbox', active: section === 'sandbox' || section === 'sandbox-done' },
  ];
  return (
    <TenantPortal tenant="YukthiX" portal="Developers" nav={nav} access={{ kind: 'public' }} footer={{ ...YX_FOOTER, terms: 'Terms of use and API terms (G-16, G-01)' }}>
      {section === 'home' && (
        <>
          <section className="yx-ps-hero">
            <h1>Build on YukthiX</h1>
            <p>REST and GraphQL APIs for employees, leave, attendance, payroll, hiring and assessments. Every screen in YukthiX uses the same API.</p>
          </section>
          <div className="yx-ps-grid">
            <Card title="API reference" footer={<Button size="sm">Open reference</Button>}>
              <p className="yx-ps-muted">Generated from OpenAPI 3.1 and the published GraphQL schema. Base URL https://api.&lt;region&gt;.yukthix.com/v1</p>
            </Card>
            <Card title="SDKs" footer={<Button size="sm" icon={Download}>Postman collection</Button>}>
              <ul className="yx-ps-list">
                <li>TypeScript · npm install @yukthix/sdk</li>
                <li>Python · pip install yukthix</li>
                <li>Java · Maven Central com.yukthix:sdk</li>
                <li>.NET · dotnet add package YukthiX.Sdk</li>
              </ul>
            </Card>
            <Card title="Sandbox" footer={<Button size="sm" variant="primary">Get a sandbox</Button>}>
              <p className="yx-ps-muted">A free tenant with demo employees and payroll runs. Keys are created in the sandbox under Settings › Developers.</p>
            </Card>
          </div>
          <Card title="Good to know">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Idempotency', value: 'Send Idempotency-Key on writes. Keys are kept 24 hours; the same key with a different body returns 409.' },
                { label: 'Errors', value: 'RFC 9457 problem details with a stable code.' },
                { label: 'Rate limits', value: 'RateLimit-Limit, -Remaining and -Reset headers on every response.' },
                { label: 'Versions', value: '12 months notice before removal, with Deprecation and Sunset headers. At most 2 major versions live.' },
              ]}
            />
          </Card>
        </>
      )}
      {section === 'reference' && (
        <div className="yx-split">
          <div className="yx-split__main">
            <div className="yx-ps-row">
              <Badge tone="info">POST</Badge>
              <h1 className="yx-ps-h yx-ps-mono">/v1/leave-requests</h1>
            </div>
            <p className="yx-ps-p">Creates a leave request for an employee. The request follows the company's approval chain; the API never approves on its own.</p>
            <Card title="Body">
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Body fields, scrolls sideways on small screens">
              <table className="yx-ps-slabgrid">
                <caption className="yx-visually-hidden">Body fields</caption>
                <thead>
                  <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Type</th>
                    <th scope="col">Required</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['employee_id', 'string', 'Yes', 'From GET /v1/employees'],
                    ['leave_type', 'string', 'Yes', 'Code from the company leave types'],
                    ['from / to', 'date', 'Yes', 'yyyy-mm-dd'],
                    ['half_day_session', 'string', 'No', 'first_half or second_half'],
                    ['reason', 'string', 'No', 'Up to 500 characters'],
                  ].map((r) => (
                    <tr key={r[0]}>
                      <td className="yx-ps-mono">{r[0]}</td>
                      <td>{r[1]}</td>
                      <td>{r[2]}</td>
                      <td>{r[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
            <CodeBlock language="curl" code={CURL} />
            <CodeBlock language="Response" code={RESPONSE} />
            <CodeBlock language="Error (problem details)" code={PROBLEM} />
          </div>
          <div className="yx-split__aside">
            <Card title="Endpoints">
              <ul className="yx-ps-list">
                {endpoints.map((e) => (
                  <li key={e.method + e.path}>
                    <Badge tone={e.method === 'GET' ? 'neutral' : 'info'}>{e.method}</Badge>
                    <div className="yx-ps-list__main">
                      <span className="yx-ps-list__title yx-ps-mono">{e.path}</span>
                      <span className="yx-ps-list__meta">
                        {e.summary} · scope {e.scope}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
      {section === 'webhooks' && (
        <>
          <section className="yx-ps-hero">
            <h1>Verify webhook signatures</h1>
            <p>Every webhook carries a YukthiX-Signature header: a timestamp and an HMAC-SHA256 of the timestamp and body, signed with your endpoint secret.</p>
          </section>
          <CodeBlock language="TypeScript" code={WEBHOOK} />
          <Card title="Delivery rules">
            <ul className="yx-ps-list">
              <li>Reject requests older than 5 minutes to stop replays.</li>
              <li>Return 2xx within 10 seconds. We retry with back-off for 24 hours.</li>
              <li>After 24 hours of failures the endpoint is switched off and your admins are emailed.</li>
            </ul>
          </Card>
        </>
      )}
      {section === 'changelog' && (
        <Card title="Changelog">
          <ul className="yx-ps-list">
            {changelog.map((c) => (
              <li key={c.version}>
                <Badge tone={c.kind === 'Deprecated' ? 'warning' : c.kind === 'Added' ? 'success' : 'neutral'}>{c.kind}</Badge>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">{c.text}</span>
                  <span className="yx-ps-list__meta">
                    {c.version} · {formatDate(c.date)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(section === 'sandbox' || section === 'sandbox-done') && (
        <div className="yx-signin">
          {section === 'sandbox' ? (
            <>
              <div className="yx-signin__head">
                <h2 className="yx-signin__title">Get a sandbox tenant</h2>
                <p className="yx-signin__intro">Free, with demo data. Sandboxes are for testing only; never load real employee data.</p>
              </div>
              <FormField label="Your name" required>
                <TextField />
              </FormField>
              <FormField label="Work email" required>
                <TextField type="email" placeholder="name@company.example" />
              </FormField>
              <FormField label="What are you building?">
                <Select value="sync" onChange={() => undefined} options={[{ value: 'sync', label: 'Sync employees with another system' }, { value: 'pay', label: 'Payroll or accounting export' }, { value: 'app', label: 'An app for the marketplace' }]} />
              </FormField>
              <FormField label="Verification code" helper="We sent a code to your email.">
                <OtpInput value={otp} onChange={setOtp} />
              </FormField>
              <Button variant="primary" fullWidth>
                Create sandbox
              </Button>
            </>
          ) : (
            <InlineAlert tone="success" title="Your sandbox is ready">
              Sign in at sandbox.yukthix.com with your email. Create API keys under Settings › Developers; keys are shown once. Your sandbox expires on {formatDate(new Date(today.getFullYear(), today.getMonth() + 3, today.getDate()))} unless you use it.
            </InlineAlert>
          )}
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-16 Help centre                                                   */
/* ================================================================== */

export type HelpView = 'home' | 'search' | 'no-results' | 'article' | 'untranslated' | 'feedback';

// T9-16
/** help.yukthix.com: search, products, versioned articles with captioned videos, "Was this helpful?" (YX-GRO-07). */
export function HelpCentreScreen({
  view,
  products,
  article,
  results,
}: {
  view: HelpView;
  products: { id: string; name: string; articles: number; text: string }[];
  article: { title: string; product: string; module: string; appliesFrom: string; lastReviewed: Date; steps: string[]; video: { title: string; captions: string } };
  results: { title: string; product: string; snippet: string }[];
}) {
  const [q, setQ] = useState(view === 'search' ? 'payroll run' : view === 'no-results' ? 'gratuity trust' : '');
  const [helpful, setHelpful] = useState<'yes' | 'no' | null>(view === 'feedback' ? 'no' : null);
  return (
    <TenantPortal tenant="YukthiX" portal="Help centre" access={{ kind: 'public' }} footer={YX_FOOTER} language={view === 'untranslated' ? 'ta' : 'en'}>
      <div className="yx-ps-row">
        <FormField label="Search help" hideLabel>
          <TextField value={q} onChange={setQ} prefix={<Icon icon={Search} />} placeholder="Search help, for example lock payroll" />
        </FormField>
        <Button>Search</Button>
      </div>
      {view === 'home' && (
        <>
          <section className="yx-ps-hero">
            <h1>How can we help?</h1>
            <p>Guides for admins, employees, candidates, partners and developers.</p>
          </section>
          <div className="yx-ps-grid">
            {products.map((p) => (
              <Card key={p.id} title={p.name} footer={<Button size="sm">Browse {p.articles} articles</Button>}>
                <p className="yx-ps-muted">{p.text}</p>
              </Card>
            ))}
          </div>
        </>
      )}
      {view === 'search' && (
        <Card title={`${results.length} results for "${q}"`}>
          <ul className="yx-ps-list">
            {results.map((r) => (
              <li key={r.title}>
                <Icon icon={BookOpen} />
                <div className="yx-ps-list__main">
                  <Link href="#">{r.title}</Link>
                  <span className="yx-ps-list__meta">
                    {r.product} · {r.snippet}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {view === 'no-results' && (
        <EmptyState title={`No articles match "${q}".`} description="Try fewer words, or ask our support team. We review searches with no results every week." action={<Button variant="primary">Contact support</Button>} />
      )}
      {(view === 'article' || view === 'untranslated' || view === 'feedback') && (
        <div className="yx-split">
          <article className="yx-split__main">
            {view === 'untranslated' && (
              <InlineAlert tone="info" title="This article isn't in Tamil yet">
                Showing the English version. The Tamil translation is on its way.
              </InlineAlert>
            )}
            <section className="yx-ps-hero">
              <h1>{article.title}</h1>
              <p>
                {article.product} · {article.module} · applies from {article.appliesFrom} · last reviewed {formatDate(article.lastReviewed)}
              </p>
            </section>
            <Card title={article.video.title} actions={<Badge>{article.video.captions}</Badge>}>
              <div className="yx-ps-preview yx-ps-center" role="img" aria-label={`Video: ${article.video.title}, with captions`}>
                <Icon icon={PlayCircle} size="md" />
                <span className="yx-ps-muted">Video preview · captions on by default</span>
              </div>
            </Card>
            <Card title="Steps">
              <ol className="yx-ps-stack">
                {article.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </Card>
            <Card title="Was this helpful?">
              {helpful ? (
                <InlineAlert tone="success" title="Thanks for telling us">
                  {helpful === 'no' ? 'We read every "No". Tell us what was missing, or contact support.' : 'Glad it helped.'}
                </InlineAlert>
              ) : (
                <div className="yx-ps-row">
                  <Button icon={ThumbsUp} onClick={() => setHelpful('yes')}>
                    Yes
                  </Button>
                  <Button icon={ThumbsDown} onClick={() => setHelpful('no')}>
                    No
                  </Button>
                </div>
              )}
            </Card>
          </article>
          <aside className="yx-split__aside">
            <Card title="Related">
              <ul className="yx-ps-list">
                {results.slice(1).map((r) => (
                  <li key={r.title}>
                    <Link href="#">{r.title}</Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Still stuck?" footer={<Button>Contact support</Button>}>
              <p className="yx-ps-muted">Support is open Monday to Saturday, 9 am to 7 pm IST, longer on payroll days.</p>
            </Card>
          </aside>
        </div>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-17 Public status page                                            */
/* ================================================================== */

export interface StatusPageProps {
  region: string;
  regions: string[];
  regionLabel: Record<string, string>;
  components: StatusComponentRow[];
  history: UptimeDay[];
  incident?: {
    title: string;
    severity: string;
    products: string;
    regions: string;
    components: string;
    impact: string;
    whatToDo: string;
    nextUpdate: Date;
    payrollNote: boolean;
    updates: { stage: string; at: Date; text: string }[];
  };
  maintenance?: { title: string; window: { from: Date; to: Date }; regions: string; impact: string; scheduledOn: Date };
  past: { date: Date; title: string; duration: string; status: string }[];
  subscribed?: boolean;
}

// T9-17
/** Status per product and region: current status, incidents, maintenance, 90-day history, subscribe (YX-GRO-08 / 09). */
export function StatusPageScreen(p: StatusPageProps) {
  const [region, setRegion] = useState(p.region);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(!!p.subscribed);
  const overall = overallStatus(p.components.map((c) => c.status));
  const products = Array.from(new Set(p.components.map((c) => c.product)));
  const pct = uptimePercent(p.history.map((h) => ({ downMinutes: h.status === 'major' ? 45 : 0, partialMinutes: h.status === 'partial' || h.status === 'degraded' ? 60 : 0 })));
  return (
    <TenantPortal tenant="YukthiX" portal="Status" access={{ kind: 'public' }} footer={YX_FOOTER}>
      <div className="yx-ps-row" data-between>
        <section className="yx-ps-hero">
          <h1>{overall === 'operational' ? 'All systems operational' : STATUS_LABEL[overall]}</h1>
          <p>Updated 29 Sep 2026, 9:42 am IST. We check sign-in, payslips, bank files, tests and careers pages every 5 minutes from each region.</p>
        </section>
        <FormField label="Region">
          <Select value={region} onChange={(v) => v && setRegion(v)} options={p.regions.map((r) => ({ value: r, label: `${p.regionLabel[r]} (${r})` }))} />
        </FormField>
      </div>
      {p.incident && (
        <Card title={p.incident.title} actions={<Badge tone="warning">{p.incident.severity} · {p.incident.updates[0].stage}</Badge>}>
          <div className="yx-ps-stack">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Affected', value: `${p.incident.products} · ${p.incident.components} · ${p.incident.regions}` },
                { label: 'Next update', value: `${timeOf(p.incident.nextUpdate)} IST` },
                { label: 'Impact', value: p.incident.impact },
                { label: 'What you should do', value: p.incident.whatToDo },
              ]}
            />
            {p.incident.payrollNote && (
              <InlineAlert tone="info" title="Payroll day note">
                Many companies run payroll this week. Bank-file generation and publishing are not affected.
              </InlineAlert>
            )}
            <ul className="yx-ps-list">
              {p.incident.updates.map((u) => (
                <li key={u.at.toISOString()}>
                  <Badge>{u.stage}</Badge>
                  <div className="yx-ps-list__main">
                    <span>{u.text}</span>
                    <span className="yx-ps-list__meta">{timeOf(u.at)} IST</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
      {p.maintenance && (
        <Card title={`Scheduled maintenance: ${p.maintenance.title}`} actions={<Badge tone="info">Scheduled</Badge>}>
          <DescriptionList
            items={[
              { label: 'When', value: `${formatDate(p.maintenance.window.from)}, ${timeOf(p.maintenance.window.from)} to ${timeOf(p.maintenance.window.to)} IST` },
              { label: 'Regions', value: p.maintenance.regions },
              { label: 'Impact', value: p.maintenance.impact },
              { label: 'Announced', value: `${formatDate(p.maintenance.scheduledOn)} (at least 72 hours ahead; reminder 24 hours before)` },
            ]}
          />
        </Card>
      )}
      <Card title={`Components · ${p.regionLabel[region]}`}>
        <div className="yx-ps-stack">
          {products.map((prod) => (
            <div key={prod} className="yx-ps-stack">
              <h3 className="yx-ps-h">{prod}</h3>
              <ul className="yx-ps-list">
                {p.components
                  .filter((c) => c.product === prod)
                  .map((c) => (
                    <li key={c.name}>
                      <span className="yx-ps-list__main">{c.name}</span>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <UptimeBar days={p.history} percent={pct} label={`${p.regionLabel[region]} overall`} />
        </div>
      </Card>
      <div className="yx-split">
        <Card title="Past incidents" className="yx-split__main">
          <ul className="yx-ps-list">
            {p.past.map((h) => (
              <li key={h.title}>
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">{h.title}</span>
                  <span className="yx-ps-list__meta">
                    {formatDate(h.date)} · {h.duration}
                  </span>
                </div>
                <Badge tone="success">{h.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Get updates by email">
          {subscribed ? (
            <InlineAlert tone="success" title="Check your inbox">
              We sent a confirmation link. You'll get updates once you confirm.
            </InlineAlert>
          ) : (
            <div className="yx-ps-stack">
              <FormField label="Email">
                <TextField type="email" value={email} onChange={setEmail} />
              </FormField>
              <Button variant="primary" disabled={!email.includes('@')} onClick={() => setSubscribed(true)}>
                Subscribe
              </Button>
            </div>
          )}
        </Card>
      </div>
    </TenantPortal>
  );
}

export function statusFor(components: StatusComponentRow[], change: Partial<Record<string, ComponentStatus>>): StatusComponentRow[] {
  return components.map((c) => (change[c.name] ? { ...c, status: change[c.name]! } : c));
}

/* ================================================================== */
/* T9-22 Public roadmap                                                */
/* ================================================================== */

const ROADMAP_COLS: RoadmapStatus[] = ['Under review', 'Planned', 'In progress', 'Shipped', 'Not planned'];

// T9-22
/** Public items by status; one vote per signed-in user per request (YX-GRO-12). */
export function RoadmapScreen({ items, userId, defaultVoted = [] }: { items: RoadmapItem[]; userId: string | null; defaultVoted?: string[] }) {
  const [votes, setVotes] = useState<Record<string, string[]>>(() => Object.fromEntries(defaultVoted.map((id) => [id, userId ? [userId] : []])));
  const [error, setError] = useState<string | null>(null);
  return (
    <TenantPortal tenant="YukthiX" portal="Roadmap" access={{ kind: 'public' }} footer={YX_FOOTER}>
      <section className="yx-ps-hero">
        <h1>What we're working on</h1>
        <p>Requests from customers, by status. {userId ? 'You can vote once on each request.' : 'Sign in with your company account to vote.'}</p>
      </section>
      {error && (
        <InlineAlert tone="info" title={error} actions={<Button size="sm">Sign in</Button>}>
          Votes come from signed-in users at YukthiX customer companies.
        </InlineAlert>
      )}
      <div className="yx-ps-grid">
        {ROADMAP_COLS.map((col) => {
          const list = items.filter((i) => i.status === col);
          return (
            <Card key={col} title={`${col} · ${list.length}`}>
              {list.length === 0 ? (
                <EmptyState compact title="Nothing here yet." />
              ) : (
                <ul className="yx-ps-list">
                  {list.map((i) => {
                    const mine = userId ? (votes[i.id] ?? []).includes(userId) : false;
                    const count = i.votes + (mine ? 1 : 0);
                    return (
                      <li key={i.id}>
                        <div className="yx-ps-list__main">
                          <span className="yx-ps-list__title">{i.title}</span>
                          <span className="yx-ps-list__meta">
                            {i.product} · {count} votes{i.note ? ` · ${i.note}` : ''}
                          </span>
                        </div>
                        {col !== 'Shipped' && col !== 'Not planned' && (
                          <Button
                            size="sm"
                            aria-pressed={mine}
                            onClick={() => {
                              const r = toggleVote(votes, i.id, userId);
                              setVotes(r.votes);
                              setError(r.error);
                            }}
                          >
                            {mine ? 'Voted' : 'Vote'}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-23 Public calculators and letter generators                      */
/* ================================================================== */

export type CalcId = 'ctc' | 'regime' | 'hra' | 'gratuity' | 'pf-esi' | 'leave' | 'letters';
const CALCS: { id: CalcId; label: string; rule: string }[] = [
  { id: 'ctc', label: 'CTC to in-hand', rule: 'IN.TDS v2026-04 · IN.PF v2025-11 · IN.PT.KA v2026-04' },
  { id: 'regime', label: 'Old vs new regime', rule: 'IN.TDS v2026-04' },
  { id: 'hra', label: 'HRA exemption', rule: 'IN.TDS v2026-04 (old regime)' },
  { id: 'gratuity', label: 'Gratuity', rule: 'IN.GRATUITY v2025-11' },
  { id: 'pf-esi', label: 'PF and ESI', rule: 'IN.PF v2025-11 · IN.ESI v2025-11' },
  { id: 'leave', label: 'Leave encashment', rule: 'Company policy (divisor 26)' },
  { id: 'letters', label: 'Letter generator', rule: 'Templates v2026.2' },
];

// T9-23
/** Free calculators on the P07 versioned rules, FY and rule version shown, "not tax advice" on each result (YX-GRO-15). */
export function CalculatorsScreen({ calc }: { calc: CalcId }) {
  const [emailOn, setEmailOn] = useState(false);
  const cur = CALCS.find((c) => c.id === calc)!;
  return (
    <TenantPortal tenant="YukthiX" portal="Free HR calculators" access={{ kind: 'public' }} footer={YX_FOOTER} nav={CALCS.map((c) => ({ label: c.label, active: c.id === calc }))}>
      <div className="yx-ps-row" data-between>
        <section className="yx-ps-hero">
          <h1>{cur.label}</h1>
          <p>
            Financial year 2026-27 · rules {cur.rule}. No sign-up. We don't keep what you type after you leave this page.
          </p>
        </section>
      </div>
      {calc === 'ctc' && <CtcCalc />}
      {calc === 'regime' && <RegimeCalc />}
      {calc === 'hra' && <HraCalc />}
      {calc === 'gratuity' && <GratuityCalc />}
      {calc === 'pf-esi' && <PfEsiCalc />}
      {calc === 'leave' && <LeaveCalc />}
      {calc === 'letters' && <LetterGen />}
      {calc !== 'letters' && (
        <>
          <p className="yx-ps-muted">This is an estimate, not tax advice. Your employer's payroll and your own tax return may differ.</p>
          <Card title="Email me this result">
            <div className="yx-ps-stack">
              <Switch checked={emailOn} onChange={setEmailOn} label="Email me the result" description="We keep your email only to send this, and delete it within 7 days." />
              {emailOn && (
                <div className="yx-ps-row">
                  <FormField label="Email">
                    <TextField type="email" />
                  </FormField>
                  <Button>Send result</Button>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </TenantPortal>
  );
}

function CtcCalc() {
  const [ctc, setCtc] = useState<number | null>(9_00_000);
  const [basic, setBasic] = useState<number | null>(40);
  const [capped, setCapped] = useState(true);
  const r = ctcToInHand({ annualCtc: ctc ?? 0, basicPct: basic ?? 40, pfCapped: capped });
  return (
    <div className="yx-split">
      <Card title="Your salary" className="yx-split__main">
        <div className="yx-ps-stack">
          <FormField label="Annual CTC">
            <CurrencyField value={ctc} onChange={setCtc} />
          </FormField>
          <FormField label="Basic as % of CTC" helper="Usually 40% to 50%.">
            <NumberField value={basic} onChange={setBasic} min={30} max={60} suffix="%" />
          </FormField>
          <Checkbox checked={capped} onChange={setCapped} label="PF on ₹15,000 wage ceiling" description="Most employers cap PF; untick if yours pays 12% on full basic." />
        </div>
      </Card>
      <Card title="Monthly in-hand (new regime)" aria-live="polite">
        <FactRow label="Result">
          <Fact label="In-hand a month" value={formatINR(r.inHand)} tone="success" />
        </FactRow>
        <DescriptionList
          items={[
            { label: 'Gross a month', value: formatINR(r.grossMonthly) },
            { label: 'Employee PF', value: `− ${formatINR(r.employeePf)}` },
            { label: 'Professional tax (Karnataka)', value: `− ${formatINR(r.pt)}` },
            { label: 'Income tax (TDS)', value: `− ${formatINR(r.taxMonthly)}` },
            { label: 'Employer PF (part of CTC)', value: formatINR(r.employerPf) },
          ]}
        />
      </Card>
    </div>
  );
}

function RegimeCalc() {
  const [gross, setGross] = useState<number | null>(14_00_000);
  const [ded, setDed] = useState<number | null>(2_75_000);
  const n = incomeTax(gross ?? 0, 'new');
  const o = incomeTax(gross ?? 0, 'old', ded ?? 0);
  const better = n.tax === o.tax ? null : n.tax < o.tax ? 'new' : 'old';
  return (
    <div className="yx-split">
      <Card title="Your income" className="yx-split__main">
        <div className="yx-ps-stack">
          <FormField label="Gross salary for the year">
            <CurrencyField value={gross} onChange={setGross} />
          </FormField>
          <FormField label="Old-regime deductions" helper="HRA exemption, 80C (up to ₹1,50,000), 80D, home-loan interest.">
            <CurrencyField value={ded} onChange={setDed} />
          </FormField>
        </div>
      </Card>
      <Card title="Tax for FY 2026-27" aria-live="polite">
        <FactRow label="Comparison">
          <Fact label="New regime" value={formatINR(n.tax)} tone={better === 'new' ? 'success' : undefined} />
          <Fact label="Old regime" value={formatINR(o.tax)} tone={better === 'old' ? 'success' : undefined} />
        </FactRow>
        <p className="yx-ps-p">
          {better ? `The ${better} regime saves you ${formatINR(Math.abs(n.tax - o.tax))} this year.` : 'Both regimes come to the same tax.'} Taxable income: new {formatINR(n.taxable)}, old {formatINR(o.taxable)}.
        </p>
      </Card>
    </div>
  );
}

function HraCalc() {
  const [basic, setBasic] = useState<number | null>(4_80_000);
  const [hra, setHra] = useState<number | null>(2_40_000);
  const [rent, setRent] = useState<number | null>(2_64_000);
  const [metro, setMetro] = useState(true);
  const r = hraExemption({ basicDa: basic ?? 0, hra: hra ?? 0, rent: rent ?? 0, metro });
  const why = { actual: 'the HRA you receive', rent: 'rent paid minus 10% of basic', percent: metro ? '50% of basic (metro)' : '40% of basic' }[r.rule];
  return (
    <div className="yx-split">
      <Card title="Yearly figures" className="yx-split__main">
        <div className="yx-ps-stack">
          <FormField label="Basic + DA">
            <CurrencyField value={basic} onChange={setBasic} />
          </FormField>
          <FormField label="HRA received">
            <CurrencyField value={hra} onChange={setHra} />
          </FormField>
          <FormField label="Rent paid">
            <CurrencyField value={rent} onChange={setRent} />
          </FormField>
          <Checkbox checked={metro} onChange={setMetro} label="I live in Delhi, Mumbai, Kolkata or Chennai" />
        </div>
      </Card>
      <Card title="HRA exemption" aria-live="polite">
        <FactRow label="Result">
          <Fact label="Exempt" value={formatINR(r.exempt)} tone="success" />
          <Fact label="Taxable HRA" value={formatINR(r.taxable)} />
        </FactRow>
        <p className="yx-ps-p">The exemption is the lowest of three amounts; here it is {why}. Only in the old regime.</p>
      </Card>
    </div>
  );
}

function GratuityCalc() {
  const [pay, setPay] = useState<number | null>(52_000);
  const [years, setYears] = useState<number | null>(7);
  const [months, setMonths] = useState<number | null>(8);
  const r = gratuity({ monthlyBasicDa: pay ?? 0, years: years ?? 0, months: months ?? 0 });
  return (
    <div className="yx-split">
      <Card title="Your service" className="yx-split__main">
        <div className="yx-ps-stack">
          <FormField label="Last drawn basic + DA (monthly)">
            <CurrencyField value={pay} onChange={setPay} />
          </FormField>
          <FieldRow>
            <FormField label="Years of service">
              <NumberField value={years} onChange={setYears} min={0} max={50} />
            </FormField>
            <FormField label="Extra months">
              <NumberField value={months} onChange={setMonths} min={0} max={11} />
            </FormField>
          </FieldRow>
        </div>
      </Card>
      <Card title="Gratuity" aria-live="polite">
        {r.eligible ? (
          <>
            <FactRow label="Result">
              <Fact label="Gratuity" value={formatINR(r.amount)} tone="success" />
              <Fact label="Years counted" value={r.countedYears} />
            </FactRow>
            <p className="yx-ps-p">15 ÷ 26 × {formatINR(pay ?? 0)} × {r.countedYears} years. More than 6 extra months count as a full year.{r.capped ? ' Capped at ₹20,00,000.' : ''}</p>
          </>
        ) : (
          <InlineAlert tone="info" title="Not yet eligible">
            Gratuity needs 5 years of continuous service, except on death or disablement.
          </InlineAlert>
        )}
      </Card>
    </div>
  );
}

function PfEsiCalc() {
  const [basic, setBasic] = useState<number | null>(18_000);
  const [gross, setGross] = useState<number | null>(19_500);
  const pfWage = Math.min(basic ?? 0, 15_000);
  const e = esi(gross ?? 0);
  return (
    <div className="yx-split">
      <Card title="Monthly pay" className="yx-split__main">
        <div className="yx-ps-stack">
          <FormField label="Basic + DA">
            <CurrencyField value={basic} onChange={setBasic} />
          </FormField>
          <FormField label="Gross pay">
            <CurrencyField value={gross} onChange={setGross} />
          </FormField>
        </div>
      </Card>
      <Card title="Contributions a month" aria-live="polite">
        <DescriptionList
          items={[
            { label: 'PF · employee 12%', value: formatINR(Math.round(pfWage * 0.12)) },
            { label: 'PF · employer (EPF 3.67% + EPS 8.33%)', value: formatINR(Math.round(pfWage * 0.12)) },
            { label: 'ESI · employee 0.75%', value: e.applies ? formatINR(e.employee) : 'Not applicable above ₹21,000 gross' },
            { label: 'ESI · employer 3.25%', value: e.applies ? formatINR(e.employer) : 'Not applicable' },
          ]}
        />
      </Card>
    </div>
  );
}

function LeaveCalc() {
  const [pay, setPay] = useState<number | null>(38_000);
  const [days, setDays] = useState<number | null>(18);
  return (
    <div className="yx-split">
      <Card title="Your leave" className="yx-split__main">
        <div className="yx-ps-stack">
          <FormField label="Monthly basic + DA">
            <CurrencyField value={pay} onChange={setPay} />
          </FormField>
          <FormField label="Days to encash">
            <NumberField value={days} onChange={setDays} min={0} max={300} />
          </FormField>
        </div>
      </Card>
      <Card title="Encashment" aria-live="polite">
        <FactRow label="Result">
          <Fact label="Amount" value={formatINR(leaveEncashment(pay ?? 0, days ?? 0))} tone="success" />
        </FactRow>
        <p className="yx-ps-p">Basic + DA ÷ 26 × days. Your company may use 30 instead of 26.</p>
      </Card>
    </div>
  );
}

function LetterGen() {
  const [kind, setKind] = useState<string | null>('offer');
  const [name, setName] = useState('Meenakshi Sundaram');
  const [role, setRole] = useState('Quality Analyst');
  const [ctc, setCtc] = useState<number | null>(6_80_000);
  return (
    <div className="yx-split">
      <Card title="Letter details" className="yx-split__main">
        <div className="yx-ps-stack">
          <FormField label="Letter">
            <Select value={kind} onChange={setKind} options={[{ value: 'offer', label: 'Offer letter' }, { value: 'appointment', label: 'Appointment letter' }, { value: 'payslip', label: 'Payslip' }]} />
          </FormField>
          <FormField label="Candidate name">
            <TextField value={name} onChange={setName} />
          </FormField>
          <FormField label="Designation">
            <TextField value={role} onChange={setRole} />
          </FormField>
          <FormField label="Annual CTC">
            <CurrencyField value={ctc} onChange={setCtc} />
          </FormField>
        </div>
      </Card>
      <Card title="Preview" footer={<Button icon={Download}>Download PDF</Button>}>
        <div className="yx-ps-preview">
          <strong>{kind === 'payslip' ? 'Payslip' : kind === 'appointment' ? 'Appointment letter' : 'Offer of employment'}</strong>
          <p className="yx-ps-p">Dear {name},</p>
          <p className="yx-ps-p">
            We are pleased to offer you the position of {role} at an annual cost to company of {formatINR(ctc ?? 0)}, subject to the terms attached.
          </p>
          <p className="yx-ps-muted">Sample letter for reference. Check it with your legal adviser before use.</p>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* T9-24 Integrations directory                                        */
/* ================================================================== */

// T9-24
/** Built from the product's own catalogue: partner, category, data moved, direction, status (YX-GRO-16). */
export function IntegrationsDirectoryScreen({ items, defaultCategory = 'All', defaultQuery = '' }: { items: Integration[]; defaultCategory?: string; defaultQuery?: string }) {
  const [cat, setCat] = useState<string | null>(defaultCategory);
  const [q, setQ] = useState(defaultQuery);
  const cats = ['All', ...Array.from(new Set(items.map((i) => i.category)))];
  const shown = useMemo(
    () => items.filter((i) => (cat === 'All' || i.category === cat) && (!q || `${i.partner} ${i.data}`.toLowerCase().includes(q.toLowerCase()))),
    [items, cat, q],
  );
  return (
    <TenantPortal tenant="YukthiX" portal="Integrations" access={{ kind: 'public' }} footer={YX_FOOTER}>
      <section className="yx-ps-hero">
        <h1>Integrations</h1>
        <p>Every integration listed here exists in the product today, or is marked Beta or Coming.</p>
      </section>
      <div className="yx-ps-row">
        <FormField label="Search integrations" hideLabel>
          <TextField value={q} onChange={setQ} prefix={<Icon icon={Search} />} placeholder="Search by partner or data" />
        </FormField>
        <FormField label="Category" hideLabel>
          <Select value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c === 'All' ? 'All categories' : c }))} />
        </FormField>
      </div>
      {shown.length === 0 ? (
        <EmptyState
          title="No results for these filters"
          action={
            <Button
              onClick={() => {
                setCat('All');
                setQ('');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Integrations, scrolls sideways on small screens">
          <table className="yx-ps-slabgrid">
            <caption className="yx-visually-hidden">Integrations</caption>
            <thead>
              <tr>
                <th scope="col">Partner</th>
                <th scope="col">Category</th>
                <th scope="col">What data moves</th>
                <th scope="col">Direction</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <th scope="row">{i.partner}</th>
                  <td>{i.category}</td>
                  <td>{i.data}</td>
                  <td>{i.direction}</td>
                  <td>
                    <Badge tone={i.status === 'Live' ? 'success' : i.status === 'Beta' ? 'info' : 'neutral'}>{i.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </TenantPortal>
  );
}

/* ================================================================== */
/* T9-25 Academy                                                       */
/* ================================================================== */

export type AcademyView = 'catalogue' | 'certificate' | 'verify' | 'verify-expired' | 'verify-not-found';

// T9-25
/** Admin and partner courses with certification; certificates expire and have a public verify link (YX-GRO-17). */
export function AcademyScreen({
  view,
  courses,
  certificate,
  today,
}: {
  view: AcademyView;
  courses: { id: string; title: string; audience: string; lessons: number; hours: number; certificate: boolean; progress: number; required?: string }[];
  certificate: { id: string; name: string; course: string; issuedOn: Date; expiresOn: Date };
  today: Date;
}) {
  const expired = view === 'verify-expired';
  const cert = expired ? { ...certificate, expiresOn: new Date(2026, 5, 30) } : certificate;
  return (
    <TenantPortal
      tenant="YukthiX"
      portal="Academy"
      access={view.startsWith('verify') ? { kind: 'public' } : { kind: 'otp', identity: 'suresh.p@kaverifoods.in', endsOn: new Date(2027, 11, 31), today }}
      footer={YX_FOOTER}
      nav={view.startsWith('verify') ? [] : [{ label: 'Courses', active: view === 'catalogue' }, { label: 'My certificates', active: view === 'certificate' }]}
    >
      {view === 'catalogue' && (
        <>
          <section className="yx-ps-hero">
            <h1>YukthiX Academy</h1>
            <p>Short courses for admins and partners. Certificates are valid for 2 years.</p>
          </section>
          <Tabs defaultValue="Admins">
            <TabsList aria-label="Audience">
              <TabsTrigger value="Admins">For admins</TabsTrigger>
              <TabsTrigger value="Partners">For partners</TabsTrigger>
            </TabsList>
            {['Admins', 'Partners'].map((a) => (
              <TabsContent key={a} value={a}>
                <div className="yx-ps-grid">
                  {courses
                    .filter((c) => c.audience === a)
                    .map((c) => (
                      <Card key={c.id} title={c.title} actions={c.certificate ? <Badge tone="info">Certificate</Badge> : undefined} footer={<Button size="sm" variant={c.progress > 0 && c.progress < 100 ? 'primary' : 'secondary'}>{c.progress === 0 ? 'Start' : c.progress === 100 ? 'Review' : 'Continue'}</Button>}>
                        <div className="yx-ps-stack">
                          <p className="yx-ps-muted">
                            {c.lessons} lessons · about {c.hours} hours
                          </p>
                          {c.required && <p className="yx-ps-muted">{c.required}.</p>}
                          <Meter label={`${c.title} progress`} value={c.progress} max={100} warnAt={101} dangerAt={101} />
                        </div>
                      </Card>
                    ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}
      {view === 'certificate' && (
        <Card title={certificate.course} actions={<Badge tone="success">Valid</Badge>}>
          <div className="yx-ps-pass">
            <QrCode value={certificate.id} size={140} label={`Verify certificate ${certificate.id}`} />
            <div className="yx-ps-stack">
              <DescriptionList
                items={[
                  { label: 'Awarded to', value: certificate.name },
                  { label: 'Issued', value: formatDate(certificate.issuedOn) },
                  { label: 'Valid until', value: `${formatDate(certificate.expiresOn)} · ${daysUntil(certificate.expiresOn, today)} days left` },
                  { label: 'Certificate ID', value: certificate.id, mono: true, copyValue: certificate.id },
                ]}
              />
              <div className="yx-ps-row">
                <Button icon={Download}>Download certificate</Button>
                <Button icon={ExternalLink}>Copy public verify link</Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      {view.startsWith('verify') && (
        <>
          <section className="yx-ps-hero">
            <h1>Verify a YukthiX certificate</h1>
            <p>academy.yukthix.com/verify/{certificate.id}</p>
          </section>
          {view === 'verify-not-found' ? (
            <InlineAlert tone="danger" title="No certificate has this ID">
              Check the ID on the certificate, or ask the holder for a fresh verify link.
            </InlineAlert>
          ) : (
            <Card title={expired ? 'This certificate has expired' : 'This certificate is valid'} actions={<Badge tone={expired ? 'warning' : 'success'}>{expired ? 'Expired' : 'Valid'}</Badge>}>
              <DescriptionList
                items={[
                  { label: 'Holder', value: cert.name },
                  { label: 'Course', value: cert.course },
                  { label: 'Issued', value: formatDate(cert.issuedOn) },
                  { label: expired ? 'Expired on' : 'Valid until', value: formatDate(cert.expiresOn) },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </TenantPortal>
  );
}
