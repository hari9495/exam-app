// HLP-06 Speak-up filing, live (Helpdesk design wiring): the designed SpeakUpScreen and CheckReportScreen in cases.tsx
// render these when the page passes `live`. Same layout as the design: the report form (kind, how to report, what
// happened, when, where, who, someone outside, witnesses, files, worried about retaliation), the filed states (the
// clock for a named report; the reply code shown once for an anonymous one), and the no-login "Check my report" page.
// States only the real records have are drawn in the same look: a topic list from the company's settings, "it is
// about a case officer", nobody chosen to receive reports yet, POSH with no Internal Committee, the late POSH window,
// and the set-up of the case officer lists. The server checks every rule again (docs/yukthix/helpdesk-design-map.md 4e).
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Send } from "lucide-react";
import { PhoneFrame, PortalFrame } from "../_kit/frames";
import { Button, IconButton } from "../../components/button";
import { Badge } from "../../components/display";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  NoAccessState,
  Skeleton,
} from "../../components/feedback";
import { FieldRow, FormField, useTooEarly } from "../../components/field";
import { TextArea, TextField } from "../../components/inputs";
import { Checkbox, RadioGroup, Switch } from "../../components/choice";
import { Select } from "../../components/select";
import { Segment } from "../../components/segment";
import { DatePicker } from "../../components/date";
import { FileUpload } from "../../components/upload";
import { DataTable } from "../../components/table";
import { Card, PageHeader } from "../../components/shell";
import { Dialog } from "../../components/overlay";
import { useNarrow } from "../../components/stepper";
import { formatDate } from "../../lib/format";
import { errorText } from "../org/org-kit";
import type { LoadState } from "../desk/types";
import {
  AccessCodeCard,
  Actions,
  ClockPanel,
  OpsDesk,
  useSay,
} from "./ops-kit";
import { AnonThread } from "./cases";
import { recordedIcIssues } from "./ops-rules";

export type SpeakUpKindLive = "grievance" | "whistleblower" | "posh";
export type SpeakUpTeam = "grievance" | "ethics" | "ic" | "escalation" | "safety" | "ir";
export interface NamedRef {
  id: string;
  name: string;
}
/** GET desk/speakup/form. */
export interface SpeakUpFormData {
  company: string;
  org: string;
  anonymous: "all" | "ethics_only" | "off";
  categories: { grievance: string[]; whistleblower: string[] };
  locations: NamedRef[];
  officers: NamedRef[];
  ready: Record<SpeakUpKindLive, boolean>;
  posh: {
    filingMonths: number;
    extensionMonths: number;
    source: string;
  } | null;
  ackDays: number;
  me: string | null;
}
export interface SpeakUpInput {
  kind: SpeakUpKindLive;
  category?: string;
  summary: string;
  happenedOn?: string;
  locationId?: string;
  involved?: string;
  outsideName?: string;
  outsideEmployer?: string;
  witnesses?: string;
  retaliationWorry?: boolean;
  aboutUserId?: string;
  /** Anonymous only (HLP-06 decision 1): where to say "You have an update"; stored encrypted. */
  alertEmail?: string;
}
/** POST desk/speakup/reports (named) or desk/speakup/public/reports (anonymous, with the code). */
export interface FiledReport {
  id: string;
  number: string;
  kind: SpeakUpKindLive;
  routedTo: SpeakUpTeam;
  team: string;
  late: boolean;
  clock: { key: string; label: string; due: string | null }[];
  source: string | null;
  code?: string;
}
/** POST desk/speakup/public/check. */
export interface ReporterView {
  number: string;
  kind: SpeakUpKindLive;
  status: "received" | "acknowledged" | "investigation" | "closed";
  filedAt: string;
  team: string;
  messages: {
    id: string;
    from: "reporter" | "team";
    at: string;
    text: string;
  }[];
}

const KIND_TITLE: Record<SpeakUpKindLive, string> = {
  grievance: "Grievance",
  whistleblower: "Fraud or ethics report",
  posh: "Sexual harassment complaint",
};
const STATUS_LABEL: Record<ReporterView["status"], string> = {
  received: "Received",
  acknowledged: "Acknowledged",
  investigation: "Investigation",
  closed: "Closed",
};
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => new Date(`${s}T00:00:00`);
const monthsBefore = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() - n, d.getDate());
/** Who may report without a name (company setting), as the server decides it. */
export const anonymousFor = (
  setting: SpeakUpFormData["anonymous"],
  kind: SpeakUpKindLive,
) =>
  kind !== "posh" &&
  setting !== "off" &&
  (setting !== "ethics_only" || kind === "whistleblower");

export interface LiveSpeakUp {
  state: LoadState;
  onRetry?: () => void;
  form: SpeakUpFormData | null;
  /** Named: as the signed-in person. Anonymous: through the no-login route (the page sends no sign-in). */
  onFile: (
    input: SpeakUpInput,
    identity: "named" | "anonymous",
  ) => Promise<FiledReport>;
  /** Files after filing: a named report by its id, an anonymous one with its reply code. */
  onUpload: (filed: FiledReport, file: File) => Promise<void>;
  /** Back to the Help centre. */
  onDone: () => void;
  /** The no-login "Check my report" address for this company. */
  checkHref: string;
  /** HLP-12: the accident report (the fourth choice sends people there). */
  accidentHref?: string;
  /** CMP-10: the designed POSH complaint form (batch F item 13); without it the complaint is filed here. */
  poshHref?: string;
  today: Date;
  /** Stories and tests only. */
  start?: {
    kind?: SpeakUpKindLive;
    identity?: "named" | "anonymous";
    filed?: FiledReport;
    poshForm?: boolean;
    tooEarly?: boolean;
    happenedOn?: string;
  };
}

function LiveSpeakUpForm({
  live,
  f,
  onFiled,
}: {
  live: LiveSpeakUp;
  f: SpeakUpFormData;
  onFiled: (r: FiledReport, failed: string[]) => void;
}) {
  const s = live.start ?? {};
  const [kind, setKind] = useState<SpeakUpKindLive | "accident">(s.kind ?? "grievance");
  const [poshForm, setPoshForm] = useState(Boolean(s.poshForm));
  const [identity, setIdentity] = useState<"named" | "anonymous">(
    s.identity ?? "named",
  );
  const [category, setCategory] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [when, setWhen] = useState<Date | null>(
    s.happenedOn ? fromIso(s.happenedOn) : null,
  );
  const [where, setWhere] = useState<string | null>(null);
  const [involved, setInvolved] = useState("");
  const [about, setAbout] = useState<string | null>(null);
  const [external, setExternal] = useState(false);
  const [outsideName, setOutsideName] = useState("");
  const [outsideEmployer, setOutsideEmployer] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [worry, setWorry] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [alertEmail, setAlertEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useSay();
  const accident = kind === "accident";
  const sk: SpeakUpKindLive = accident ? "grievance" : kind;
  const anonOk = anonymousFor(f.anonymous, sk);
  const who = anonOk ? identity : "named";
  const showForm = !accident && (kind !== "posh" || poshForm);
  const ready = accident || f.ready[sk];
  const cats = sk === "posh" ? [] : f.categories[sk];
  const late =
    kind === "posh" && f.posh && when
      ? when < monthsBefore(live.today, f.posh.filingMonths)
      : false;
  const early = useTooEarly(
    summary.trim().length < 10
      ? [
          {
            fieldId: "su-summary",
            message: "Say what happened (10 letters or more).",
          },
        ]
      : [],
  );
  useEffect(() => {
    if (s.tooEarly) early.stop();
    // Stories only: show the pressed-too-early state once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const file = async () => {
    if (!ready)
      return toast({
        tone: "default",
        title:
          kind === "posh"
            ? "Your company has not set up its Internal Committee yet."
            : "Your company has not chosen who receives these reports yet.",
      });
    if (early.stop()) return;
    setBusy(true);
    setError(null);
    try {
      const input: SpeakUpInput = {
        kind: sk,
        summary: summary.trim(),
        ...(category ? { category } : {}),
        ...(when ? { happenedOn: toIso(when) } : {}),
        ...(where ? { locationId: where } : {}),
        ...(involved.trim() ? { involved: involved.trim() } : {}),
        ...(about && kind !== "posh" ? { aboutUserId: about } : {}),
        ...(external && outsideName.trim()
          ? {
              outsideName: outsideName.trim(),
              outsideEmployer: outsideEmployer.trim(),
            }
          : {}),
        ...(witnesses.trim() ? { witnesses: witnesses.trim() } : {}),
        retaliationWorry: worry,
        ...(who === "anonymous" && alerts && alertEmail.trim() ? { alertEmail: alertEmail.trim() } : {}),
      };
      const r = await live.onFile(input, who);
      const failed: string[] = [];
      for (const x of files)
        await live.onUpload(r, x).catch(() => failed.push(x.name));
      onFiled(r, failed);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const fields = (
    <>
      {cats.length > 0 && (
        <FormField label="Topic">
          <Select
            value={category}
            onChange={setCategory}
            options={cats.map((c) => ({ value: c, label: c }))}
            placeholder="Choose a topic"
            clearable
          />
        </FormField>
      )}
      <FormField
        id="su-summary"
        label="What happened?"
        required
        helper="Facts, dates and amounts help most. Avoid guesses about motives."
        error={early.errorOf("su-summary")}
      >
        <TextArea
          rows={5}
          value={summary}
          onChange={setSummary}
          maxLength={10_000}
        />
      </FormField>
      <FieldRow>
        <FormField label="When did it happen?">
          <DatePicker value={when} onChange={setWhen} max={live.today} />
        </FormField>
        <FormField label="Where?">
          <Select
            value={where}
            onChange={setWhere}
            options={f.locations.map((l) => ({ value: l.id, label: l.name }))}
            placeholder="Choose a location"
            clearable
          />
        </FormField>
      </FieldRow>
      {late && f.posh && (
        <InlineAlert
          tone="warning"
          title={`More than ${f.posh.filingMonths} months ago`}
        >
          The law sets a time to complain, from the incident. The committee can
          still accept it, up to {f.posh.extensionMonths} more months, if
          something kept you from complaining earlier. Say why in “What
          happened”. ({f.posh.source})
        </InlineAlert>
      )}
      <FormField
        label="Who was involved?"
        optional
        helper="Names or roles. They are not told until the process formally notifies them."
      >
        <TextField value={involved} onChange={setInvolved} maxLength={300} />
      </FormField>
      {kind !== "posh" && f.officers.length > 0 && (
        <FormField
          label="Is it about someone on the case team?"
          optional
          helper="Then it goes to the next person (for example the audit committee chair), never to them."
        >
          <Select
            value={about}
            onChange={setAbout}
            options={f.officers.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="No"
            clearable
          />
        </FormField>
      )}
      <Checkbox
        checked={external}
        onChange={setExternal}
        label="Someone outside the company was involved"
        description="A contractor, vendor staff, client staff or visitor"
      />
      {external && (
        <FieldRow>
          <FormField label="Their name">
            <TextField
              value={outsideName}
              onChange={setOutsideName}
              maxLength={150}
            />
          </FormField>
          <FormField label="Their employer">
            <TextField
              value={outsideEmployer}
              onChange={setOutsideEmployer}
              maxLength={150}
            />
          </FormField>
        </FieldRow>
      )}
      <FormField label="Witnesses" optional>
        <TextField value={witnesses} onChange={setWitnesses} maxLength={300} />
      </FormField>
      <FormField
        label="Documents or photos"
        optional
        helper="PDF, JPG, PNG or Excel, up to 10 MB each. They are sent with the report."
      >
        <FileUpload
          multiple
          accept={[".pdf", ".jpg", ".png", ".xlsx"]}
          upload={async (x) => void setFiles((all) => [...all, x])}
        />
      </FormField>
      <Checkbox
        checked={worry}
        onChange={setWorry}
        label="I'm worried about retaliation"
        description="The case team is alerted and can act at once. You can also raise this later."
      />
      {who === "anonymous" && (
        <div className="yx-ops-stack" data-gap="sm">
          <Switch
            checked={alerts}
            onChange={setAlerts}
            label="Tell me when there's an update"
            description="Optional. Your email is stored encrypted; nobody at the company can see it. The alert says only “You have an update”."
          />
          {alerts && (
            <FormField label="Email for alerts" helper="Use a personal address if you want to stay anonymous.">
              <TextField value={alertEmail} onChange={setAlertEmail} type="email" maxLength={254} autoComplete="off" />
            </FormField>
          )}
        </div>
      )}
    </>
  );
  return (
    <div className="yx-ops-stack">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <FormField label="What would you like to report?" required>
        <RadioGroup
          value={kind}
          onChange={(v) => (setKind(v as SpeakUpKindLive | "accident"), setCategory(null))}
          options={[
            {
              value: "grievance",
              label: "A workplace grievance",
              description:
                "Pay, working conditions, a manager, transport, safety",
            },
            {
              value: "whistleblower",
              label: "Fraud or an ethics concern",
              description: "Goes to the ethics team, not HR",
            },
            {
              value: "posh",
              label: "Sexual harassment",
              description: "Filed with the Internal Committee only",
            },
            ...(live.accidentHref
              ? [
                  {
                    value: "accident",
                    label: "A workplace accident or injury",
                    description: "Goes to the safety team and HR",
                  },
                ]
              : []),
          ]}
        />
      </FormField>
      {accident && (
        <InlineAlert
          tone="info"
          title="Report the accident"
          actions={
            <Button size="sm" onClick={() => window.location.assign(live.accidentHref!)}>
              Continue to the accident report
            </Button>
          }
        >
          Near-misses are not recorded here; tell your safety officer. You can
          report for yourself or for someone else.
        </InlineAlert>
      )}
      {!ready && (
        <InlineAlert
          tone="warning"
          title={
            kind === "posh"
              ? "No Internal Committee yet"
              : "Nobody receives these reports yet"
          }
        >
          {kind === "posh"
            ? "Your company has not set up its Internal Committee, so the app cannot take this complaint. You can complain in writing to the Local Committee of your district. Tell your System Admin the committee is missing."
            : "Your company has not chosen its case officers yet, so the app cannot take this report. Tell your System Admin."}
        </InlineAlert>
      )}
      {accident ? null : kind === "posh" && !poshForm ? (
        <InlineAlert
          tone="info"
          title="This goes to the Internal Committee"
          actions={
            <Button size="sm" onClick={() => (live.poshHref ? window.location.assign(live.poshHref) : setPoshForm(true))}>
              Continue to the complaint form
            </Button>
          }
        >
          Only the committee members on your case can see it. HR does not. It is
          made with your name: the committee must be able to hear you.
        </InlineAlert>
      ) : (
        <>
          {kind !== "posh" && (
            <FormField label="How do you want to report?" required>
              <RadioGroup
                value={who}
                onChange={(v) => setIdentity(v as "named" | "anonymous")}
                options={[
                  {
                    value: "named",
                    label: "With my name, kept confidential",
                    description:
                      "Only the people handling the case can see your name.",
                  },
                  {
                    value: "anonymous",
                    label: "Anonymously",
                    description:
                      "Nobody, including the case team, can see who you are. You get a reply code to follow up.",
                    disabled: !anonOk,
                  },
                ]}
              />
            </FormField>
          )}
          {kind !== "posh" && !anonOk && (
            <p className="yx-ops-muted">
              {f.anonymous === "ethics_only"
                ? "Your company has switched anonymous grievances off. Fraud and ethics concerns can still be anonymous."
                : "Your company has switched anonymous reports off."}
            </p>
          )}
          {who === "anonymous" && (
            <p className="yx-ops-muted">
              Sent without your sign-in: the report does not record who you are,
              your device or your network address.
            </p>
          )}
          {showForm && fields}
        </>
      )}
      <Actions end>
        <Button onClick={live.onDone}>Cancel</Button>
        {showForm && (
          <Button
            variant="primary"
            icon={Send}
            loading={busy}
            onClick={() => void file()}
          >
            File report
          </Button>
        )}
      </Actions>
    </div>
  );
}

function Filed({
  live,
  r,
  failed,
}: {
  live: LiveSpeakUp;
  r: FiledReport;
  failed: string[];
}) {
  return (
    <div className="yx-ops-stack">
      {r.code ? (
        <>
          <InlineAlert tone="info" title="Your report is filed">
            {r.number} went to {r.team}. Nobody can see who filed it.
          </InlineAlert>
          <AccessCodeCard code={r.code} />
          <InlineAlert tone="warning">
            If you lose the code we can't recover it. You can file a follow-up
            report instead. Read answers and reply at{" "}
            <a href={live.checkHref}>Check my report</a>.
          </InlineAlert>
        </>
      ) : (
        <>
          <InlineAlert
            tone="info"
            title={`${KIND_TITLE[r.kind]} ${r.number} is filed`}
          >
            It went to {r.team}. Only the people handling it can see your name.
          </InlineAlert>
          <ClockPanel
            title="What happens next"
            today={live.today}
            source={r.source ?? undefined}
            items={r.clock.map((c) => ({
              key: c.key,
              label: c.label,
              due: c.due ? fromIso(c.due) : null,
            }))}
          />
        </>
      )}
      {failed.length > 0 && (
        <InlineAlert tone="warning">
          {failed.join(", ")} could not be added. The report is filed without{" "}
          {failed.length === 1 ? "it" : "them"}.
        </InlineAlert>
      )}
      <Actions end>
        <Button variant="primary" onClick={live.onDone}>
          Back to Help centre
        </Button>
      </Actions>
    </div>
  );
}

export function LiveSpeakUp({ live }: { live: LiveSpeakUp }) {
  const phone = useNarrow();
  const [filed, setFiled] = useState<{
    r: FiledReport;
    failed: string[];
  } | null>(live.start?.filed ? { r: live.start.filed, failed: [] } : null);
  const { toast } = useSay();
  const title = "Speak up";
  const body =
    live.state === "loading" || (!live.form && live.state === "ready") ? (
      <div
        className="yx-ops-stack"
        role="status"
        aria-busy="true"
        aria-label="Loading the form"
      >
        <Skeleton height={120} />
        <Skeleton height={200} />
      </div>
    ) : live.state === "error" || !live.form ? (
      <ErrorState
        title="We couldn't load the form."
        description="Try again in a moment."
        onRetry={live.onRetry}
      />
    ) : filed ? (
      <Filed live={live} r={filed.r} failed={filed.failed} />
    ) : (
      <LiveSpeakUpForm
        live={live}
        f={live.form}
        onFiled={(r, failed) => {
          setFiled({ r, failed });
          toast({ tone: "success", title: `${r.number} is filed` });
        }}
      />
    );
  if (live.state === "no-access")
    return (
      <OpsDesk area="helpdesk" active="Speak-up" member={false}>
        <PageHeader title={title} />
        <NoAccessState
          what="speak-up with your name"
          grantedBy="the person you act for to sign in themselves"
          note="A report is your own act, so this page is closed while you act for someone else."
        />
      </OpsDesk>
    );
  if (phone)
    return (
      <PhoneFrame
        tab="me"
        title={title}
        back={
          <IconButton icon={ArrowLeft} label="Back" onClick={live.onDone} />
        }
        hideTabs
      >
        <p className="yx-ops-muted">
          Only the people handling your report can see it. Every view is logged.
        </p>
        {body}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="helpdesk" active="Speak-up" member={false}>
      <PageHeader
        title={title}
        description="Raise a grievance or report a concern. You can do it with your name kept confidential, or anonymously."
      />
      <Card>
        <div className="yx-ops-form">{body}</div>
      </Card>
    </OpsDesk>
  );
}

/* ---------------- Check my report (no login) ---------------- */

export interface LiveCheckReport {
  company: string;
  onOpen: (code: string) => Promise<ReporterView>;
  onReply: (code: string, body: string) => Promise<ReporterView>;
  onUpload: (code: string, file: File) => Promise<void>;
  /** The speak-up form (a follow-up report). */
  followUpHref: string;
  /** Stories and tests only. */
  start?: {
    code?: string;
    view?: ReporterView;
    problem?:
      { kind: "wrong"; triesLeft: number } | { kind: "locked"; until: Date };
  };
}

export function LiveCheckReport({ live }: { live: LiveCheckReport }) {
  const [code, setCode] = useState(live.start?.code ?? "");
  const [view, setView] = useState<ReporterView | null>(
    live.start?.view ?? null,
  );
  const [problem, setProblem] = useState(live.start?.problem ?? null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useSay();
  const codeEarly = useTooEarly(
    code.replace(/[\s-]/g, "").length !== 16
      ? [
          {
            fieldId: "cr-code",
            message: "Enter the 16 characters of your reply code.",
          },
        ]
      : [],
  );
  const replyEarly = useTooEarly(
    !reply.trim()
      ? [{ fieldId: "cr-reply", message: "Write your reply first." }]
      : [],
  );
  const fail = (e: unknown) => {
    const err = e as {
      code?: string;
      body?: { triesLeft?: number; retryAfterSeconds?: number };
    };
    if (err.code === "SPEAKUP_LOCKED")
      setProblem({
        kind: "locked",
        until: new Date(
          Date.now() + (err.body?.retryAfterSeconds ?? 3600) * 1000,
        ),
      });
    else if (err.code === "SPEAKUP_WRONG_CODE")
      setProblem({ kind: "wrong", triesLeft: err.body?.triesLeft ?? 0 });
    else toast({ tone: 'error', title: errorText(e) });
  };
  const open = async () => {
    if (codeEarly.stop()) return;
    setBusy("open");
    try {
      setView(await live.onOpen(code));
      setProblem(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };
  const send = async () => {
    if (replyEarly.stop()) return;
    setBusy("reply");
    try {
      setView(await live.onReply(code, reply.trim()));
      setReply("");
      replyEarly.reset();
      toast({
        tone: "success",
        title: "Reply sent",
        description:
          "Only the case team reads it. They do not see who you are.",
      });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };
  const time = (d: Date) =>
    d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return (
    <PortalFrame tenant={live.company} portal="Check my report">
      {view ? (
        <>
          <PageHeader
            title={`Report ${view.number}`}
            status={<Badge tone="info">{STATUS_LABEL[view.status]}</Badge>}
            description={`Received ${formatDate(new Date(view.filedAt))}. Messages here reach ${view.team} only.`}
          />
          <Card title="Messages">
            {view.messages.length ? (
              <AnonThread
                messages={view.messages.map((m) => ({
                  id: m.id,
                  from: m.from,
                  at: new Date(m.at),
                  text: m.text,
                }))}
                viewer="reporter"
              />
            ) : (
              <EmptyState
                compact
                title="No messages yet."
                description="The case team will write here. Come back with your code."
              />
            )}
          </Card>
          {view.status !== "closed" && (
            <Card>
              <div className="yx-ops-stack">
                <FormField
                  id="cr-reply"
                  label="Reply"
                  error={replyEarly.errorOf("cr-reply")}
                >
                  <TextArea
                    rows={3}
                    value={reply}
                    onChange={setReply}
                    maxLength={5000}
                  />
                </FormField>
                <FormField label="Add a document or photo" optional>
                  <FileUpload
                    accept={[".pdf", ".jpg", ".png", ".xlsx"]}
                    upload={(x) => live.onUpload(code, x)}
                  />
                </FormField>
                <Actions end>
                  <Button
                    variant="primary"
                    icon={Send}
                    loading={busy === "reply"}
                    onClick={() => void send()}
                  >
                    Send reply
                  </Button>
                </Actions>
              </div>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <div className="yx-ops-stack yx-ops-form" data-size="sm">
            <PageHeader
              title="Check my report"
              description="Enter the reply code you got when you filed. We don't ask for your name."
            />
            {problem?.kind === "wrong" && (
              <InlineAlert tone="danger">
                That code doesn't match a report. Check each character and try
                again. You have {problem.triesLeft}{" "}
                {problem.triesLeft === 1 ? "try" : "tries"} left in this hour.
              </InlineAlert>
            )}
            {problem?.kind === "locked" && (
              <InlineAlert tone="danger">
                Too many tries. Try again after {time(problem.until)}. If you
                lost your code, file a follow-up report and mention the earlier
                one.
              </InlineAlert>
            )}
            <FormField
              id="cr-code"
              label="Reply code"
              helper="16 characters, like ABCD-EFGH-JKLM-NPQR"
              error={codeEarly.errorOf("cr-code")}
            >
              <TextField value={code} onChange={setCode} autoComplete="off" />
            </FormField>
            <Actions>
              <Button
                variant="primary"
                loading={busy === "open"}
                onClick={() =>
                  problem?.kind === "locked" && problem.until > new Date()
                    ? toast({
                        tone: 'warning',
                        title: `Too many tries. Try again after ${time(problem.until)}.`,
                      })
                    : void open()
                }
              >
                Open my report
              </Button>
              <Button onClick={() => window.location.assign(live.followUpHref)}>
                File a follow-up report
              </Button>
            </Actions>
          </div>
        </Card>
      )}
    </PortalFrame>
  );
}

/* ---------------- Set-up: who receives reports (speakup.setup.manage) ---------------- */

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface SpeakUpSetupData {
  members: {
    id: string;
    team: SpeakUpTeam;
    userId: string;
    name: string;
    role: "member" | "presiding" | "external";
    addedAt: string;
    /** Answer 2591 (Internal Committee only; null on members added before it was asked). */
    woman?: boolean | null;
    termEndsOn?: string | null;
  }[];
  users: { id: string; name: string; email: string }[];
  settings: {
    anonymous: string;
    ackDays: number;
    grievance: string[];
    whistleblower: string[];
  };
}
export interface LiveSpeakUpSetup {
  state: LoadState;
  onRetry?: () => void;
  data: SpeakUpSetupData | null;
  onAdd: (input: {
    team: SpeakUpTeam;
    userId: string;
    role?: "member" | "presiding" | "external";
    woman?: boolean;
    termEndsOn?: string;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** Settings › Company rules. */
  rulesHref: string;
  /** Stories and tests only. */
  start?: { adding?: SpeakUpTeam; tooEarly?: boolean };
}
const TEAMS: { team: SpeakUpTeam; title: string; note: string }[] = [
  {
    team: "grievance",
    title: "Grievance Redressal Committee",
    note: "Workplace grievances. With nobody here they go to the ethics team.",
  },
  {
    team: "ethics",
    title: "Ethics team",
    note: "Fraud and ethics concerns (the vigil mechanism).",
  },
  {
    team: "ic",
    title: "Internal Committee (POSH)",
    note: "Sexual harassment complaints. Only these members see them.",
  },
  {
    team: "escalation",
    title: "Escalation (for example the audit committee chair)",
    note: "Reports about one of the officers above go here instead.",
  },
  {
    team: "safety",
    title: "Safety team",
    note: "Workplace accidents and injuries, medical details included. They name the HR person who files each ESIC report.",
  },
  {
    team: "ir",
    title: "Industrial relations team",
    note: "Collective disputes with a union: the demands, conciliation, papers and the signed settlement. An outside lawyer can be added. Two of them are needed to send a settlement to payroll.",
  },
];
const ROLE_LABEL = {
  member: "Member",
  presiding: "Presiding officer",
  external: "External member",
} as const;

export function SpeakUpSetupScreen({ live }: { live: LiveSpeakUpSetup }) {
  const [adding, setAdding] = useState<SpeakUpTeam | null>(
    live.start?.adding ?? null,
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<"member" | "presiding" | "external">(
    "member",
  );
  const [woman, setWoman] = useState<"yes" | "no" | null>(null);
  const [termEnds, setTermEnds] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useSay();
  const today = new Date();
  const maxTerm = new Date(today.getFullYear() + 3, today.getMonth(), today.getDate());
  // Answer 2591: the committee list asks whether the member is a woman and when the term ends (at most 3 years).
  const early = useTooEarly([
    ...(userId ? [] : [{ fieldId: "ss-user", message: "Choose who to add." }]),
    ...(adding === "ic" && !woman ? [{ fieldId: "ss-woman", message: "Say whether this member is a woman." }] : []),
    ...(adding === "ic" && !termEnds ? [{ fieldId: "ss-term", message: "Choose the day their term ends." }] : []),
    ...(adding === "ic" && role === "presiding" && woman === "no" ? [{ fieldId: "ss-woman", message: "The presiding officer must be a senior woman employee." }] : []),
  ]);
  useEffect(() => {
    if (live.start?.tooEarly) early.stop();
    // Stories only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (live.state === "no-access")
    return (
      <OpsDesk area="helpdesk" active="Speak-up">
        <PageHeader title="Speak-up set-up" />
        <NoAccessState
          what="the speak-up set-up"
          grantedBy="your System Admin"
          note="The System Admin chooses the case officers; HR does not."
        />
      </OpsDesk>
    );
  const d = live.data;
  const add = async () => {
    if (early.stop() || !adding) return;
    setBusy(true);
    setError(null);
    try {
      await live.onAdd({
        team: adding,
        userId: userId!,
        ...(adding === "ic" || adding === "ir" ? { role } : {}),
        ...(adding === "ic" ? { woman: woman === "yes", termEndsOn: isoDay(termEnds!) } : {}),
      });
      toast({
        tone: "success",
        title: `${d?.users.find((u) => u.id === userId)?.name ?? "They"} added`,
        description: "New reports of this kind reach them from now on.",
      });
      setAdding(null);
      setUserId(null);
      setRole("member");
      setWoman(null);
      setTermEnds(null);
      early.reset();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <OpsDesk area="helpdesk" active="Speak-up">
      <PageHeader
        title="Speak-up set-up"
        description="Choose who receives reports. Ordinary HR and managers never see them unless they are on a list."
      />
      {live.state === "loading" || (!d && live.state === "ready") ? (
        <div
          className="yx-ops-stack"
          role="status"
          aria-busy="true"
          aria-label="Loading the set-up"
        >
          <Skeleton height={160} />
          <Skeleton height={160} />
        </div>
      ) : live.state === "error" || !d ? (
        <ErrorState
          title="We couldn't load the set-up."
          description="Try again in a moment."
          onRetry={live.onRetry}
        />
      ) : (
        <div className="yx-ops-stack">
          {(() => {
            const missing = TEAMS.filter(
              (t) =>
                (t.team === "ic" || t.team === "escalation" || t.team === "safety") &&
                !d.members.some((m) => m.team === t.team),
            );
            return missing.length > 0 ? (
              <InlineAlert tone="warning" title="Set-up is not finished">
                {missing
                  .map((t) =>
                    t.team === "ic"
                      ? "Add the Internal Committee: until then sexual harassment complaints are refused and sent to the district Local Committee."
                      : t.team === "safety"
                        ? "Add the safety team: until then accident reports are refused."
                        : "Add someone to Escalation: until then reports about a case officer are refused.",
                  )
                  .join(" ")}
              </InlineAlert>
            ) : null;
          })()}
          <div className="yx-ops-grid" data-min="lg">
            {TEAMS.map((t) => {
              const rows = d.members.filter((m) => m.team === t.team);
              return (
                <Card
                  key={t.team}
                  title={t.title}
                  actions={
                    <Button
                      size="sm"
                      icon={Plus}
                      onClick={() => (setAdding(t.team), setError(null))}
                    >
                      Add
                    </Button>
                  }
                >
                  <div className="yx-ops-stack">
                    <p className="yx-ops-muted">{t.note}</p>
                    {t.team === "ic" && rows.length > 0 && (() => {
                      const issues = recordedIcIssues(rows.map((r) => ({ name: r.name, role: r.role, woman: r.woman ?? null, since: r.addedAt.slice(0, 10), termEndsOn: r.termEndsOn ?? null })), today);
                      return issues.length > 0 ? <InlineAlert tone="warning" title="Committee not complete">{issues.join(". ")}.</InlineAlert> : null;
                    })()}
                    <DataTable
                      label={t.title}
                      columns={[
                        {
                          key: "name",
                          header: "Name",
                          value: (r: SpeakUpSetupData["members"][number]) =>
                            r.name,
                        },
                        {
                          key: "role",
                          header: "Role",
                          value: (r) =>
                            r.team === "ir" && r.role === "external"
                              ? "Outside lawyer"
                              : ROLE_LABEL[r.role],
                        },
                        ...(t.team === "ic"
                          ? [
                              { key: "woman", header: "Woman", value: (r: SpeakUpSetupData["members"][number]) => (r.woman == null ? "Not recorded" : r.woman ? "Yes" : "No") },
                              { key: "term", header: "Term ends", value: (r: SpeakUpSetupData["members"][number]) => r.termEndsOn ?? "", render: (r: SpeakUpSetupData["members"][number]) => (r.termEndsOn ? formatDate(new Date(`${r.termEndsOn}T00:00:00`)) : "Not recorded") },
                            ]
                          : []),
                      ]}
                      rows={rows}
                      getRowId={(r) => r.id}
                      rowActions={(r) => (
                        <Button
                          size="sm"
                          onClick={() =>
                            void live.onRemove(r.id).then(
                              () =>
                                toast({
                                  tone: "success",
                                  title: `${r.name} removed`,
                                  description:
                                    "Reports already routed to them stay with them.",
                                }),
                              (e) => toast({ tone: 'error', title: errorText(e) }),
                            )
                          }
                        >
                          Remove
                        </Button>
                      )}
                      empty={
                        <EmptyState
                          compact
                          title="Nobody yet."
                          description={
                            t.team === "ic"
                              ? "Sexual harassment complaints cannot be taken until the committee is set up."
                              : undefined
                          }
                        />
                      }
                    />
                  </div>
                </Card>
              );
            })}
            <Card title="Company rules">
              <div className="yx-ops-stack">
                <p className="yx-ops-muted">
                  Anonymous reports:{" "}
                  {d.settings.anonymous === "all"
                    ? "allowed"
                    : d.settings.anonymous === "ethics_only"
                      ? "fraud and ethics only"
                      : "off"}{" "}
                  · acknowledge within {d.settings.ackDays}{" "}
                  {d.settings.ackDays === 1 ? "day" : "days"}. POSH and
                  grievance committee time limits come from the law tables.
                </p>
                <Actions>
                  <Button
                    onClick={() => window.location.assign(live.rulesHref)}
                  >
                    Change in Company rules
                  </Button>
                </Actions>
              </div>
            </Card>
          </div>
        </div>
      )}
      <Dialog
        open={Boolean(adding)}
        onOpenChange={(o) => !o && setAdding(null)}
        size="sm"
        title={`Add to ${TEAMS.find((t) => t.team === adding)?.title ?? ""}`}
        footer={
          <>
            <Button onClick={() => setAdding(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void add()}>
              Add
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <FormField
            id="ss-user"
            label="Person"
            required
            error={early.errorOf("ss-user")}
          >
            <Select
              value={userId}
              onChange={setUserId}
              options={(d?.users ?? []).map((u) => ({
                value: u.id,
                label: `${u.name} · ${u.email}`,
              }))}
              placeholder="Choose a person"
              searchable
            />
          </FormField>
          {adding === "ir" && (
            <FormField label="Who they are">
              <Segment
                label="Who they are"
                value={role === "external" ? "external" : "member"}
                onChange={(v) => setRole(v)}
                options={[
                  { value: "member", label: "Company member" },
                  { value: "external", label: "Outside lawyer" },
                ]}
              />
            </FormField>
          )}
          {adding === "ic" && (
            <FormField label="Role on the committee">
              <RadioGroup
                value={role}
                onChange={(v) => setRole(v as typeof role)}
                options={[
                  {
                    value: "presiding",
                    label: "Presiding officer",
                    description: "A senior woman employee",
                  },
                  { value: "member", label: "Member" },
                  {
                    value: "external",
                    label: "External member",
                    description:
                      "From an NGO or someone familiar with the issues",
                  },
                ]}
              />
            </FormField>
          )}
          {adding === "ic" && (
            <>
              <FormField id="ss-woman" label="Is this member a woman?" required helper="At least half the committee must be women, and a woman presides." error={early.errorOf("ss-woman")}>
                <Segment label="Is this member a woman?" value={woman} onChange={(v) => setWoman(v)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
              </FormField>
              <FormField id="ss-term" label="Term ends" required helper="At most 3 years from today." error={early.errorOf("ss-term")}>
                <DatePicker value={termEnds} onChange={setTermEnds} min={new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)} max={maxTerm} />
              </FormField>
            </>
          )}
        </div>
      </Dialog>
    </OpsDesk>
  );
}
