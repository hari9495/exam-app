import { useState } from 'react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { Badge } from '../../../components/display';
import { InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { FileUpload } from '../../../components/upload';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import type { CareersEntity, CareersEntityPage, CareersSettings, ConsentNotice, ConsentPurpose, LoadState } from './types';

// Recruitment batch AT3, wired (M10-BUILD-DESIGN §6, §13): the public careers site, a page per company in the group,
// and the privacy notices applicants accept. Replaces the older Settings › Careers site and Applicant consent pages.

const PURPOSE: Record<ConsentPurpose, { title: string; note: string }> = {
  application: { title: 'Applying for a job', note: 'Every applicant must accept this.' },
  talent_pool: { title: 'Keeping details for other roles', note: 'Optional. Only applicants who tick it can be kept in talent pools.' },
};
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export interface CareersSiteScreenProps {
  state: LoadState;
  onRetry?: () => void;
  settings: CareersSettings | null;
  /** The public address, e.g. https://hr.example.com/careers/acme. */
  publicUrl: string;
  onSave: (s: Omit<CareersSettings, 'bannerUrl'>) => Promise<unknown>;
  onUploadBanner: (file: File) => Promise<unknown>;
  entities: CareersEntity[];
  onSaveEntity: (legalEntityId: string, page: CareersEntityPage) => Promise<unknown>;
  onRemoveEntity: (legalEntityId: string) => Promise<unknown>;
  notices: ConsentNotice[];
  onPublishNotice: (purpose: ConsentPurpose, text: string) => Promise<unknown>;
}

export function CareersSiteScreen(p: CareersSiteScreenProps) {
  return (
    <LivePage title="Careers site" description="Your public jobs page, a page for each company in the group, and what applicants agree to." state={p.state} onRetry={p.onRetry} what="careers site settings" grantedBy="your admin">
      {p.settings && <SiteCard key={JSON.stringify(p.settings)} {...p} settings={p.settings} />}
      <EntitiesCard {...p} />
      <NoticesCard {...p} />
    </LivePage>
  );
}

function SiteCard(p: CareersSiteScreenProps & { settings: CareersSettings }) {
  const { busy, error, run } = useRun();
  const [s, setS] = useState(p.settings);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<CareersSettings>) => { setS((x) => ({ ...x, ...patch })); setSaved(false); };
  return (
    <Card title="Public page">
      {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
      {saved && !error && <Text as="p" tone="secondary">Saved.</Text>}
      <Checkbox label="Show the careers site" description="Lists open jobs that are set to appear on the careers site." checked={s.enabled} onChange={(v) => set({ enabled: v })} />
      <Checkbox label="Careers assistant" description="Lets visitors ask questions about your open jobs." checked={s.assistantEnabled} onChange={(v) => set({ assistantEnabled: v })} />
      <FormField id="cs-head" label="Headline" optional>
        <TextField value={s.headline ?? ''} onChange={(v) => set({ headline: v })} maxLength={200} />
      </FormField>
      <FormField id="cs-intro" label="Introduction" optional>
        <TextArea value={s.intro ?? ''} onChange={(v) => set({ intro: v })} maxLength={5000} rows={4} />
      </FormField>
      <FormField id="cs-banner" label="Banner image" optional helper={p.settings.bannerUrl ? 'A banner is set. Upload a new one to replace it.' : 'Shown behind the headline.'}>
        <FileUpload id="cs-banner" accept={['.png', '.jpg', '.jpeg', '.webp']} maxSize={5 * 1024 * 1024} multiple={false} upload={(file) => p.onUploadBanner(file).then(() => undefined)} />
      </FormField>
      <div className="yx-tim-row">
        <Button variant="primary" loading={busy === 'save'} onClick={() => void run('save', async () => { await p.onSave({ enabled: s.enabled, assistantEnabled: s.assistantEnabled, headline: s.headline?.trim() || null, intro: s.intro?.trim() || null }); setSaved(true); })}>
          Save public page
        </Button>
        {p.settings.enabled && (
          <Button asChild>
            <a href={p.publicUrl} target="_blank" rel="noopener noreferrer">Open the careers site</a>
          </Button>
        )}
      </div>
    </Card>
  );
}

function EntitiesCard(p: CareersSiteScreenProps) {
  const [editing, setEditing] = useState<CareersEntity | null>(null);
  const [removing, setRemoving] = useState<CareersEntity | null>(null);
  const cols: TableColumn<CareersEntity>[] = [
    { key: 'name', header: 'Company', value: (e) => e.name },
    { key: 'page', header: 'Page', value: (e) => e.page?.slug ?? '', render: (e) => (e.page ? <Text>{`?company=${e.page.slug}`}</Text> : <Badge tone="neutral">Not set up</Badge>) },
    {
      key: 'actions',
      header: 'Actions',
      value: () => '',
      render: (e) => (
        <div className="yx-tim-row">
          <Button size="sm" onClick={() => setEditing(e)}>{e.page ? `Edit page for ${e.name}` : `Set up page for ${e.name}`}</Button>
          {e.page && <Button size="sm" variant="danger" onClick={() => setRemoving(e)}>Remove page</Button>}
        </div>
      ),
    },
  ];
  return (
    <Card title="Company pages">
      <Text as="p" tone="secondary">Each company in the group can have its own page with its own headline and colour, showing only its jobs.</Text>
      <DataTable label="Company pages" columns={cols} rows={p.entities} getRowId={(e) => e.id} empty={<Text tone="secondary">Add companies under Organisation to give them their own page.</Text>} />
      {editing && <EntityDialog entity={editing} onClose={() => setEditing(null)} onSave={p.onSaveEntity} />}
      {removing && (
        <ConfirmDialog open onOpenChange={(o) => !o && setRemoving(null)} destructive title={`Remove the careers page for ${removing.name}?`} consequence="Its jobs still show on the main careers page. Links to this page stop working." confirmLabel="Remove page" onConfirm={async () => { await p.onRemoveEntity(removing.id); setRemoving(null); }} />
      )}
    </Card>
  );
}

function EntityDialog(p: { entity: CareersEntity; onClose: () => void; onSave: CareersSiteScreenProps['onSaveEntity'] }) {
  const [slug, setSlug] = useState(p.entity.page?.slug ?? '');
  const [headline, setHeadline] = useState(p.entity.page?.headline ?? '');
  const [intro, setIntro] = useState(p.entity.page?.intro ?? '');
  const [color, setColor] = useState(p.entity.page?.primaryColor ?? '');
  const slugBad = slug !== '' && !SLUG.test(slug);
  const colorBad = color !== '' && !COLOR.test(color);
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title={`Careers page for ${p.entity.name}`} confirmLabel="Save page" confirmDisabled={!slug || slugBad || colorBad} onConfirm={async () => {
      await p.onSave(p.entity.id, { slug, headline: headline.trim() || null, intro: intro.trim() || null, primaryColor: color || null });
      p.onClose();
    }}>
      <FormField id="ce-slug" label="Web address" required helper="Lower-case letters, numbers and hyphens, for example kaveri-foods." error={slugBad ? 'Use lower-case letters, numbers and single hyphens.' : undefined}>
        <TextField value={slug} onChange={setSlug} maxLength={60} />
      </FormField>
      <FormField id="ce-head" label="Headline" optional>
        <TextField value={headline} onChange={setHeadline} maxLength={200} />
      </FormField>
      <FormField id="ce-intro" label="About this company" optional>
        <TextArea value={intro} onChange={setIntro} maxLength={2000} rows={3} />
      </FormField>
      <FormField id="ce-color" label="Brand colour" optional helper="A hex colour, for example #1f6feb." error={colorBad ? 'Use a colour like #1f6feb.' : undefined}>
        <TextField value={color} onChange={setColor} maxLength={7} />
      </FormField>
    </ConfirmDialog>
  );
}

function NoticesCard(p: CareersSiteScreenProps) {
  const [publishing, setPublishing] = useState<ConsentPurpose | null>(null);
  const latest = (k: ConsentPurpose) => p.notices.filter((n) => n.purpose === k).sort((a, b) => b.version - a.version)[0];
  const cols: TableColumn<ConsentNotice>[] = [
    { key: 'purpose', header: 'For', value: (n) => PURPOSE[n.purpose].title },
    { key: 'version', header: 'Version', type: 'number', value: (n) => n.version },
    { key: 'publishedAt', header: 'Published', type: 'date', value: (n) => n.publishedAt },
  ];
  return (
    <Card title="Privacy notices">
      <Text as="p" tone="secondary">A published notice never changes. Publishing new words makes a new version; every applicant keeps the version they accepted.</Text>
      {(Object.keys(PURPOSE) as ConsentPurpose[]).map((k) => {
        const n = latest(k);
        return (
          <div key={k} className="yx-tim-stack">
            <Text as="p" weight="semibold">{PURPOSE[k].title} {n ? <Badge tone="info">{`Version ${n.version}`}</Badge> : <Badge tone="neutral">Not published</Badge>}</Text>
            <Text as="p" tone="secondary">{PURPOSE[k].note}</Text>
            {n && <Text as="p">{n.text}</Text>}
            <div>
              <Button size="sm" onClick={() => setPublishing(k)}>{n ? `Publish a new version: ${PURPOSE[k].title.toLowerCase()}` : `Publish notice: ${PURPOSE[k].title.toLowerCase()}`}</Button>
            </div>
          </div>
        );
      })}
      <DataTable label="Notice versions" columns={cols} rows={p.notices} getRowId={(n) => n.id} empty={<Text tone="secondary">No notices yet. Without one, applicants are not asked to agree to anything.</Text>} />
      {publishing && <NoticeDialog purpose={publishing} current={latest(publishing)} onClose={() => setPublishing(null)} onPublish={p.onPublishNotice} />}
    </Card>
  );
}

function NoticeDialog(p: { purpose: ConsentPurpose; current: ConsentNotice | undefined; onClose: () => void; onPublish: CareersSiteScreenProps['onPublishNotice'] }) {
  const [text, setText] = useState(p.current?.text ?? '');
  const ok = text.trim().length >= 10 && text.trim() !== p.current?.text;
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title={`Publish version ${(p.current?.version ?? 0) + 1}: ${PURPOSE[p.purpose].title.toLowerCase()}`} consequence="Applicants from now on see these words. You cannot edit a version once it is published." confirmLabel="Publish version" confirmDisabled={!ok} onConfirm={async () => {
      await p.onPublish(p.purpose, text.trim());
      p.onClose();
    }}>
      <FormField id="cn-text" label="Notice text" required helper="Say what you collect, why, and how long you keep it (at least 10 characters).">
        <TextArea value={text} onChange={setText} maxLength={5000} rows={6} />
      </FormField>
    </ConfirmDialog>
  );
}
