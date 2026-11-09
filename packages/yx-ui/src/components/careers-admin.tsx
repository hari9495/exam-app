import { useState } from 'react';
import { Button } from './button';
import { Badge } from './display';
import { FormField } from './field';
import { Text } from './foundations';
import { TextArea, TextField } from './inputs';
import { ConfirmDialog } from './overlay';
import { Card } from './shell';
import { DataTable, type TableColumn } from './table';
import { formatDate } from '../lib/format';

// Surfaces/Careers, staff side (founder decision 8): next to the page builder, a page for each company in the group and
// the versioned privacy notices applicants accept. A published notice never changes; new words make a new version.

export interface CareersEntityPage {
  slug: string;
  headline: string | null;
  intro: string | null;
  primaryColor: string | null;
}

/** A legal entity and its own careers page, if it has one. */
export interface CareersEntity {
  id: string;
  name: string;
  page: CareersEntityPage | null;
}

export type ConsentPurpose = 'application' | 'talent_pool';

export interface ConsentNotice {
  id: string;
  purpose: ConsentPurpose;
  version: number;
  text: string;
  publishedAt: string;
}

const PURPOSE: Record<ConsentPurpose, { title: string; note: string }> = {
  application: { title: 'Applying for a job', note: 'Every applicant must accept this.' },
  talent_pool: { title: 'Keeping details for other roles', note: 'Optional. Only applicants who tick it can be kept in talent pools.' },
};
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export interface CareersCompanyPagesProps {
  entities: CareersEntity[];
  onSaveEntity: (legalEntityId: string, page: CareersEntityPage) => Promise<unknown>;
  onRemoveEntity: (legalEntityId: string) => Promise<unknown>;
}

/** Each company in the group can have its own careers page (?company=) with its own headline and colour. */
export function CareersCompanyPages(p: CareersCompanyPagesProps) {
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
        <div className="yx-page-builder__site">
          <Button size="sm" onClick={() => setEditing(e)}>
            {e.page ? `Edit page for ${e.name}` : `Set up page for ${e.name}`}
          </Button>
          {e.page && (
            <Button size="sm" variant="danger" onClick={() => setRemoving(e)}>
              Remove page
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <Card title="Company pages">
      <Text as="p" tone="secondary">
        Each company in the group can have its own page with its own headline and colour, showing only its jobs.
      </Text>
      <DataTable label="Company pages" columns={cols} rows={p.entities} getRowId={(e) => e.id} empty={<Text tone="secondary">Add companies under Organisation to give them their own page.</Text>} />
      {editing && <EntityDialog entity={editing} onClose={() => setEditing(null)} onSave={p.onSaveEntity} />}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          destructive
          title={`Remove the careers page for ${removing.name}?`}
          consequence="Its jobs still show on the main careers page. Links to this page stop working."
          confirmLabel="Remove page"
          onConfirm={async () => {
            await p.onRemoveEntity(removing.id);
            setRemoving(null);
          }}
        />
      )}
    </Card>
  );
}

function EntityDialog(p: { entity: CareersEntity; onClose: () => void; onSave: CareersCompanyPagesProps['onSaveEntity'] }) {
  const [slug, setSlug] = useState(p.entity.page?.slug ?? '');
  const [headline, setHeadline] = useState(p.entity.page?.headline ?? '');
  const [intro, setIntro] = useState(p.entity.page?.intro ?? '');
  const [color, setColor] = useState(p.entity.page?.primaryColor ?? '');
  const slugBad = slug !== '' && !SLUG.test(slug);
  const colorBad = color !== '' && !COLOR.test(color);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      size="md"
      onOpenChange={(o) => !o && p.onClose()}
      title={`Careers page for ${p.entity.name}`}
      confirmLabel="Save page"
      onConfirm={async () => {
        setTried(true);
        if (!slug || slugBad) {
          document.getElementById('ce-slug')?.focus();
          return false;
        }
        if (colorBad) {
          document.getElementById('ce-color')?.focus();
          return false;
        }
        await p.onSave(p.entity.id, { slug, headline: headline.trim() || null, intro: intro.trim() || null, primaryColor: color || null });
        p.onClose();
      }}
    >
      <FormField id="ce-slug" label="Web address" required rule="Lower-case letters, numbers and hyphens, for example kaveri-foods." error={slugBad ? 'Use lower-case letters, numbers and single hyphens.' : tried && !slug ? 'Enter the web address.' : undefined}>
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

export interface CareersNoticesProps {
  notices: ConsentNotice[];
  onPublishNotice: (purpose: ConsentPurpose, text: string) => Promise<unknown>;
}

/** The privacy notices applicants accept, by purpose, with every published version. */
export function CareersNotices(p: CareersNoticesProps) {
  const [publishing, setPublishing] = useState<ConsentPurpose | null>(null);
  const latest = (k: ConsentPurpose) => p.notices.filter((n) => n.purpose === k).sort((a, b) => b.version - a.version)[0];
  const cols: TableColumn<ConsentNotice>[] = [
    { key: 'purpose', header: 'For', value: (n) => PURPOSE[n.purpose].title },
    { key: 'version', header: 'Version', type: 'number', value: (n) => n.version },
    { key: 'publishedAt', header: 'Published', value: (n) => n.publishedAt, render: (n) => formatDate(new Date(n.publishedAt)) },
  ];
  return (
    <Card title="Privacy notices">
      <Text as="p" tone="secondary">
        A published notice never changes. Publishing new words makes a new version; every applicant keeps the version they accepted.
      </Text>
      {(Object.keys(PURPOSE) as ConsentPurpose[]).map((k) => {
        const n = latest(k);
        return (
          <div key={k} className="yx-apply__consent">
            <Text as="p" weight="semibold">
              {PURPOSE[k].title} {n ? <Badge tone="info">{`Version ${n.version}`}</Badge> : <Badge tone="neutral">Not published</Badge>}
            </Text>
            <Text as="p" tone="secondary">
              {PURPOSE[k].note}
            </Text>
            {n && <Text as="p">{n.text}</Text>}
            <div>
              <Button size="sm" onClick={() => setPublishing(k)}>
                {n ? `Publish a new version: ${PURPOSE[k].title.toLowerCase()}` : `Publish notice: ${PURPOSE[k].title.toLowerCase()}`}
              </Button>
            </div>
          </div>
        );
      })}
      <DataTable label="Notice versions" columns={cols} rows={p.notices} getRowId={(n) => n.id} empty={<Text tone="secondary">No notices yet. Without one, applicants are not asked to agree to anything.</Text>} />
      {publishing && <NoticeDialog purpose={publishing} current={latest(publishing)} onClose={() => setPublishing(null)} onPublish={p.onPublishNotice} />}
    </Card>
  );
}

function NoticeDialog(p: { purpose: ConsentPurpose; current: ConsentNotice | undefined; onClose: () => void; onPublish: CareersNoticesProps['onPublishNotice'] }) {
  const [text, setText] = useState(p.current?.text ?? '');
  const ok = text.trim().length >= 10 && text.trim() !== p.current?.text;
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      size="md"
      onOpenChange={(o) => !o && p.onClose()}
      title={`Publish version ${(p.current?.version ?? 0) + 1}: ${PURPOSE[p.purpose].title.toLowerCase()}`}
      consequence="Applicants from now on see these words. You cannot edit a version once it is published."
      confirmLabel="Publish version"
      onConfirm={async () => {
        setTried(true);
        if (!ok) {
          document.getElementById('cn-text')?.focus();
          return false;
        }
        await p.onPublish(p.purpose, text.trim());
        p.onClose();
      }}
    >
      <FormField id="cn-text" label="Notice text" required rule="At least 10 characters." helper="Say what you collect, why, and how long you keep it." error={!tried || ok ? null : text.trim().length < 10 ? 'Enter a notice of at least 10 characters.' : 'Change the words to publish a new version.'}>
        <TextArea value={text} onChange={setText} maxLength={5000} rows={6} />
      </FormField>
    </ConfirmDialog>
  );
}
