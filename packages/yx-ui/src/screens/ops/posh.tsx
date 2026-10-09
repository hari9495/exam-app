// POSH screens (M08 YX-POSH, restricted to Internal Committee members): CMP-09 IC console, CMP-10 complaint filing,
// CMP-11 POSH case workspace with the statutory clock and Confidential watermark.
import { useState } from 'react';
import { ArrowLeft, Scale, Send, Users } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { DataTable } from '../../components/table';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { MenuItem } from '../../components/menu';
import { Dialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { StatCard } from '../../components/charts';
import { formatDate } from '../../lib/format';
import { Actions, CardGrid, ClockPanel, Confidential, Facts, MembersList, OpsDesk, StatusTrail, Workspace, type CaseMember } from './ops-kit';
import { addDays, icIssues, poshClock, poshFilingWindow, type IcMember } from './ops-rules';
import { RestrictedNotFound } from './cases';
import type { Device } from './helpdesk';

export interface PoshCaseRow {
  id: string;
  filed: Date;
  stage: string;
  workplace: string;
  conciliation: string;
  nextDue: Date | null;
  status: string;
}

/* =========================================================================================
 * CMP-09 · IC console (committee, validity, cases, annual report builder, awareness log)
 * ======================================================================================= */

export interface IcConsoleScreenProps {
  members: IcMember[];
  cases: PoshCaseRow[];
  awareness: { id: string; date: Date; title: string; audience: string; attended: number }[];
  today: Date;
  /** IC member (full), HR (anonymised counts and assigned actions only), or not allowed. */
  persona?: 'ic' | 'hr' | 'none';
  tab?: 'committee' | 'cases' | 'report' | 'awareness';
}
export function IcConsoleScreen({ members, cases, awareness, today, persona = 'ic', tab = 'committee' }: IcConsoleScreenProps) {
  const [current, setCurrent] = useState(tab);
  const [logOpen, setLogOpen] = useState(false);
  const [attended, setAttended] = useState<number | null>(null);
  if (persona === 'none') return <RestrictedNotFound area="compliance" />;
  const issues = icIssues(members, today);
  const open = cases.filter((c) => c.status === 'Open').length;
  const over90 = cases.filter((c) => c.status === 'Open' && addDays(c.filed, 90) < today).length;

  if (persona === 'hr')
    return (
      <OpsDesk area="compliance" active="Statutory hub" member={false}>
        <PageHeader title="POSH summary" description="HR sees anonymised counts and the actions assigned to HR. Case details stay with the Internal Committee." />
        <CardGrid min="sm">
          <StatCard label="Complaints this year" value={cases.length} drill={{ label: 'Counts only', href: '#' }} />
          <StatCard label="Open" value={open} drill={{ label: 'Counts only', href: '#' }} />
          <StatCard label="Awareness sessions" value={awareness.length} drill={{ label: 'View session log', href: '#aw' }} />
        </CardGrid>
        <Card title="Actions assigned to HR">
          <DataTable
            label="Actions assigned to HR"
            columns={[
              { key: 'a', header: 'Action', value: (r: { a: string; due: Date }) => r.a, width: 380 },
              { key: 'd', header: 'Due', type: 'date', value: (r) => r.due },
            ]}
            rows={[{ a: 'Transfer the respondent to another reporting line (IC recommendation, POSH-0005)', due: new Date(2026, 9, 14) }]}
            getRowId={(r) => r.a}
            rowButtons={() => <Button size="sm">Mark done</Button>}
          />
        </Card>
      </OpsDesk>
    );

  return (
    <OpsDesk area="compliance" active="POSH" member>
      <Confidential note="Confidential. Visible to Internal Committee members only. System admins and support can't open it. Every view is logged.">
        <ObjectHeader
          name="Internal Committee · Kaveri Foods Pvt Ltd"
          icon={Users}
          secondary="Covers Bengaluru head office, Chennai office and Hosur plant"
          status={issues.length ? <Badge tone="danger">Committee not valid</Badge> : <Badge tone="success">Committee valid</Badge>}
          facts={[
            { label: 'Members', value: members.length },
            { label: 'Open complaints', value: open },
            { label: 'Past 90 days', value: over90 },
            { label: 'Annual report', value: 'Due 31 Jan 2027' },
          ]}
          actions={<Button variant="primary" onClick={() => setCurrent('report')}>Build annual report</Button>}
        />
        {issues.length > 0 && (
          <PageBanner tone="danger" action={<Button size="sm">Edit committee</Button>}>
            Committee not valid: {issues.join('; ')}. This also shows on the compliance calendar.
          </PageBanner>
        )}
        <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
          <TabsList aria-label="IC console">
            <TabsTrigger value="committee">Committee</TabsTrigger>
            <TabsTrigger value="cases" count={open}>
              Complaints
            </TabsTrigger>
            <TabsTrigger value="report">Annual report</TabsTrigger>
            <TabsTrigger value="awareness" count={awareness.length}>
              Awareness log
            </TabsTrigger>
          </TabsList>
          <TabsContent value="committee">
            <DataTable
              label="Committee members"
              columns={[
                { key: 'n', header: 'Member', type: 'person', value: (m: IcMember) => m.name, person: (m) => ({ name: m.name, secondary: m.role === 'presiding' ? 'Presiding officer' : m.role === 'external' ? 'External member (NGO / legal)' : 'Member' }) },
                { key: 'w', header: 'Woman', value: (m) => (m.woman ? 'Yes' : 'No') },
                { key: 'f', header: 'Tenure from', type: 'date', value: (m) => m.tenureFrom },
                { key: 't', header: 'Tenure to', type: 'date', value: (m) => m.tenureTo },
                { key: 'l', header: 'Login', value: (m) => (m.role === 'external' ? 'External, case-scoped' : 'Employee') },
              ]}
              rows={members}
              getRowId={(m) => m.name}
            />
            <p className="yx-ops-muted">Rules from the P07 POSH parameters: senior woman presiding, at least half women, one external member, tenure up to 3 years.</p>
          </TabsContent>
          <TabsContent value="cases">
            <DataTable
              label="POSH complaints"
              columns={[
                { key: 'id', header: 'Case', type: 'id', value: (c: PoshCaseRow) => c.id },
                { key: 'f', header: 'Filed', type: 'date', value: (c) => c.filed },
                { key: 'w', header: 'Workplace', value: (c) => c.workplace },
                { key: 's', header: 'Stage', value: (c) => c.stage },
                { key: 'c', header: 'Conciliation', value: (c) => c.conciliation },
                { key: 'd', header: 'Next due', value: (c) => c.nextDue, render: (c) => (c.nextDue ? <span className="yx-ops-row">{formatDate(c.nextDue)}{c.nextDue < today && <Badge tone="danger">Overdue</Badge>}</span> : '—') },
                { key: 'i', header: 'Inquiry by', type: 'date', value: (c) => addDays(c.filed, 90) },
              ]}
              rows={cases}
              getRowId={(c) => c.id}
              onRowClick={() => {}}
              empty={<EmptyState compact title="No complaints." />}
            />
          </TabsContent>
          <TabsContent value="report">
            <Card title="Annual report 2026 (draft)">
              <div className="yx-ops-stack">
                <p className="yx-ops-muted">Format and due date from the P07 POSH parameters. Built from complaints and the awareness log; submitted to the employer and the District Officer.</p>
                <Facts
                  items={[
                    { label: 'Complaints received', value: cases.length },
                    { label: 'Disposed of', value: cases.filter((c) => c.status === 'Closed').length },
                    { label: 'Pending more than 90 days', value: over90, tone: over90 ? 'danger' : undefined },
                    { label: 'Workshops and sessions', value: awareness.length },
                    { label: 'Action taken', value: '1 transfer, 1 written warning' },
                  ]}
                />
                <StatusTrail steps={[{ label: 'Draft' }, { label: 'Reviewed by presiding officer' }, { label: 'Submitted to employer' }, { label: 'Submitted to District Officer' }]} current={0} />
                <Actions>
                  <Button>Preview report</Button>
                  <Button>Send for review</Button>
                </Actions>
              </div>
            </Card>
          </TabsContent>
          <TabsContent value="awareness">
            <div className="yx-ops-stack">
              <Actions end>
                <Button onClick={() => setLogOpen(true)}>Log a session</Button>
              </Actions>
              <DataTable
                label="Awareness sessions"
                columns={[
                  { key: 'd', header: 'Date', type: 'date', value: (a: IcConsoleScreenProps['awareness'][number]) => a.date },
                  { key: 't', header: 'Session', value: (a) => a.title, width: 280 },
                  { key: 'au', header: 'Audience', value: (a) => a.audience },
                  { key: 'n', header: 'Attended', type: 'number', value: (a) => a.attended, total: 'sum' },
                ]}
                rows={awareness}
                getRowId={(a) => a.id}
              />
            </div>
          </TabsContent>
        </Tabs>
      </Confidential>
      <Dialog
        open={logOpen}
        onOpenChange={setLogOpen}
        title="Log an awareness session"
        footer={
          <>
            <Button onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setLogOpen(false)}>
              Save session
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <FormField label="Session" required>
            <TextField />
          </FormField>
          <FieldRow>
            <FormField label="Date" required>
              <DatePicker value={today} onChange={() => {}} />
            </FormField>
            <FormField label="Attended" required>
              <NumberField value={attended} onChange={setAttended} min={0} />
            </FormField>
          </FieldRow>
          <FormField label="Audience">
            <TextField />
          </FormField>
        </div>
      </Dialog>
    </OpsDesk>
  );
}

/* =========================================================================================
 * CMP-10 · POSH complaint filing (T4, D+M, Emp)
 * ======================================================================================= */

export interface PoshFilingScreenProps {
  device?: Device;
  today: Date;
  incidentDate?: Date | null;
  onBehalf?: boolean;
  filed?: boolean;
  alumni?: boolean;
}
export function PoshComplaintScreen({ device = 'desk', today, incidentDate = null, onBehalf, filed, alumni }: PoshFilingScreenProps) {
  const [incident, setIncident] = useState<Date | null>(incidentDate);
  const [who, setWho] = useState(onBehalf ? 'behalf' : 'self');
  const [conc, setConc] = useState(false);
  const [place, setPlace] = useState<string | null>('blr');
  const windowState = incident ? poshFilingWindow(incident, today) : null;
  const body = filed ? (
    <div className="yx-ops-stack">
      <InlineAlert tone="success" title="Your complaint is with the Internal Committee">
        Reference POSH-0008. Only the committee members on your case can see it. HR and your manager are not told.
      </InlineAlert>
      <ClockPanel title="What the committee must do" today={today} items={poshClock(today).slice(0, 2)} source="Time limits from P07 POSH parameters" />
      <p className="yx-ops-muted">You'll get “You have an update on a confidential matter” when something changes. Details are only in the app.</p>
    </div>
  ) : (
    <div className="yx-ops-stack">
      {alumni && <InlineAlert tone="info">You have left Kaveri Foods. You can still file within the legal window; you'll follow the case through your alumni login.</InlineAlert>}
      <FormField label="Who is filing?" required>
        <RadioGroup
          value={who}
          onChange={setWho}
          options={[
            { value: 'self', label: 'I am the aggrieved woman' },
            { value: 'behalf', label: 'On her behalf', description: 'For example a relative, friend or co-worker, when she can’t file herself' },
          ]}
        />
      </FormField>
      {who === 'behalf' && (
        <FieldRow>
          <FormField label="Her name" required>
            <TextField />
          </FormField>
          <FormField label="Your relationship to her" required>
            <TextField />
          </FormField>
        </FieldRow>
      )}
      <FieldRow>
        <FormField label="When did it happen?" required helper="If it happened more than once, the most recent date">
          <DatePicker value={incident} onChange={setIncident} max={today} />
        </FormField>
        <FormField label="Workplace" required>
          <Select value={place} onChange={setPlace} options={[{ value: 'blr', label: 'Bengaluru head office' }, { value: 'maa', label: 'Chennai office' }, { value: 'hsr', label: 'Hosur plant' }, { value: 'other', label: 'Outside office (work travel, client site)' }]} />
        </FormField>
      </FieldRow>
      {windowState === 'extension-needed' && (
        <InlineAlert tone="warning" title="More than 3 months ago">
          The committee can accept it up to 3 more months if there was a reason you couldn't file earlier. Tell them the reason below.
        </InlineAlert>
      )}
      {windowState === 'out-of-window' && <InlineAlert tone="danger">This is more than 6 months after the incident. The committee can't take it as a POSH complaint; you can still raise a grievance.</InlineAlert>}
      {windowState === 'extension-needed' && (
        <FormField label="Why you couldn't file earlier" required>
          <TextArea rows={3} />
        </FormField>
      )}
      <FormField label="Who is the complaint about?" required helper="They are told only when the committee sends the formal notice.">
        <TextField />
      </FormField>
      <Checkbox label="They are not a Kaveri Foods employee" description="A contractor, vendor, client or visitor. The committee coordinates with their employer." />
      <FormField label="What happened" required>
        <TextArea rows={6} />
      </FormField>
      <FormField label="Witnesses" optional>
        <TextField />
      </FormField>
      <FormField label="Evidence" optional helper="Messages, photos, documents. Stored encrypted.">
        <FileUpload multiple upload={async () => {}} />
      </FormField>
      <Checkbox checked={conc} onChange={setConc} label="I want to try conciliation first" description="Only if you ask. It can't be based on a money settlement. You can still ask for an inquiry later." />
    </div>
  );
  if (device === 'phone')
    return (
      <PhoneFrame tab="me" title="Complaint to the Internal Committee" back={<IconButton icon={ArrowLeft} label="Back" />} hideTabs>
        <p className="yx-ops-muted">Only committee members on your case see this. Every view is logged.</p>
        {body}
        {!filed && (
          <Button variant="primary" icon={Send} fullWidth disabled={windowState === 'out-of-window'}>
            File complaint
          </Button>
        )}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="helpdesk" active="Speak-up" member={false}>
      <PageHeader title="Complaint to the Internal Committee" description="Sexual harassment at work. Filed only with the Internal Committee; HR does not see it." />
      <Card
        footer={
          !filed && (
            <Actions end>
              <Button>Save draft</Button>
              <Button variant="primary" icon={Send} disabled={windowState === 'out-of-window'}>
                File complaint
              </Button>
            </Actions>
          )
        }
      >
        <div className="yx-ops-narrow">{body}</div>
      </Card>
    </OpsDesk>
  );
}

/* =========================================================================================
 * CMP-11 · POSH case workspace (statutory clock, members, Confidential watermark)
 * ======================================================================================= */

export interface PoshCaseScreenProps {
  caseId: string;
  filed: Date;
  today: Date;
  members: CaseMember[];
  timeline: { id: string; at: Date; who: string; text: string }[];
  done?: { notice?: Date | null; inquiry?: Date | null; report?: Date | null; action?: Date | null };
  conciliation?: boolean;
  member?: boolean;
  tab?: string;
}
export function PoshCaseScreen({ caseId, filed, today, members, timeline, done = {}, conciliation, member = true, tab = 'timeline' }: PoshCaseScreenProps) {
  const [current, setCurrent] = useState(tab);
  if (!member) return <RestrictedNotFound area="compliance" />;
  const clock = poshClock(filed, done);
  const stage = done.report ? 4 : done.inquiry ? 3 : done.notice ? 2 : 1;
  return (
    <OpsDesk area="compliance" active="POSH" member>
      <Confidential note="Confidential. Visible only to the Internal Committee members on this case. Not used in performance or any other module.">
        <ObjectHeader
          name={`POSH complaint ${caseId}`}
          icon={Scale}
          secondary={`Filed ${formatDate(filed)} · Bengaluru head office`}
          status={
            <>
              <Badge tone="info">{conciliation ? 'Conciliation requested' : ['Filed', 'Notice to respondent', 'Inquiry', 'IC report', 'Employer action'][stage]}</Badge>
            </>
          }
          facts={[
            { label: 'Complainant', value: 'Shown to IC members on the case' },
            { label: 'Respondent', value: 'Senior manager, Sales' },
            { label: 'Inquiry due', value: formatDate(addDays(filed, 90)) },
          ]}
          actions={
            <>
              <Button>Schedule hearing</Button>
              <Button variant="primary">{done.notice ? (done.inquiry ? 'Submit IC report' : 'Record hearing') : 'Send notice to respondent'}</Button>
            </>
          }
          menu={
            <>
              <MenuItem>Record conciliation</MenuItem>
              <MenuItem>Interim relief (transfer, leave)</MenuItem>
              <MenuItem>Close with outcome</MenuItem>
            </>
          }
        />
        <StatusTrail steps={['Filed', 'Notice to respondent', 'Inquiry and hearings', 'IC report', 'Employer action', 'Appeal window', 'Closed'].map((label) => ({ label }))} current={stage} label="POSH stages" />
        <ClockPanel title="Statutory clock" items={clock} today={today} source="P07 POSH parameters, version 2013-12 (in force)" />
        {conciliation && <InlineAlert tone="info">The complainant asked for conciliation. No money settlement can be its basis. If it fails, the inquiry continues on the same clock.</InlineAlert>}
        <Workspace
          main={
            <Tabs value={current} onValueChange={setCurrent}>
              <TabsList aria-label="Case sections">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="hearings">Hearings</TabsTrigger>
                <TabsTrigger value="report">IC report</TabsTrigger>
              </TabsList>
              <TabsContent value="timeline">
                <ol className="yx-ops-conv">
                  {timeline.map((t) => (
                    <li key={t.id} className="yx-ops-msg">
                      <span className="yx-ops-msg__meta">
                        <span className="yx-ops-msg__who">{t.who}</span>
                        <span>{formatDate(t.at)}</span>
                      </span>
                      <p className="yx-ops-msg__body">{t.text}</p>
                    </li>
                  ))}
                </ol>
              </TabsContent>
              <TabsContent value="hearings">
                <DataTable
                  label="Hearings"
                  columns={[
                    { key: 'd', header: 'Date', type: 'date', value: (h: { d: Date; who: string; s: string }) => h.d },
                    { key: 'w', header: 'Heard', value: (h) => h.who },
                    { key: 's', header: 'Status', type: 'status', value: (h) => h.s, statusTone: (v) => (v === 'Held' ? 'success' : 'info') },
                  ]}
                  rows={done.notice ? [{ d: addDays(filed, 20), who: 'Complainant', s: 'Held' }, { d: addDays(filed, 34), who: 'Respondent', s: 'Scheduled' }] : []}
                  getRowId={(h) => h.who}
                  empty={<EmptyState compact title="No hearings yet." description="Hearings start after the notice to the respondent." />}
                />
              </TabsContent>
              <TabsContent value="report">
                {done.inquiry ? (
                  <div className="yx-ops-stack">
                    <DescriptionList items={[{ label: 'Finding', value: 'Allegation proved in part' }, { label: 'Recommendation', value: 'Written warning; transfer the respondent to another reporting line' }, { label: 'Report sent to employer', value: done.report ? formatDate(done.report) : 'Not yet' }]} />
                    {done.report && <InlineAlert tone="warning">The employer must act on the recommendation by {formatDate(addDays(done.report, 60))}.</InlineAlert>}
                  </div>
                ) : (
                  <EmptyState compact title="The report comes after the inquiry." />
                )}
              </TabsContent>
            </Tabs>
          }
          rail={
            <Card>
              <MembersList members={members} />
            </Card>
          }
        />
      </Confidential>
    </OpsDesk>
  );
}
