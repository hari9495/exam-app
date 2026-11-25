// Settings map · Group 5 · Documents & Communication (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { DocumentTypeDrawer, documentTypesPage, type DocTypeRow } from './document-types-live';
import { EventEmailSheet, SenderAddressSheet } from './hiring-emails';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 5 · Documents & Communication',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 5 · Documents & Communication', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={5} /> };
export const OverviewLoading: S = { name: 'Group 5 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={5} state="loading" /> };

export const P5_1: S = { name: '5.1 Document types', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.1" /> };
export const P5_1_ReadOnly: S = { name: '5.1 Document types · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.1" readOnly /> };
export const P5_2: S = { name: '5.2 Letters', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.2" /> };
export const P5_2_ReadOnly: S = { name: '5.2 Letters · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.2" readOnly /> };
export const P5_3: S = { name: '5.3 Signatories & e-sign', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.3" /> };
export const P5_3_ReadOnly: S = { name: '5.3 Signatories & e-sign · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.3" readOnly /> };
export const P5_4: S = { name: '5.4 Notifications', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.4" /> };
export const P5_4_ReadOnly: S = { name: '5.4 Notifications · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.4" readOnly /> };
// Answer 2429 (retiring /v2): the hiring emails' sheets: a sender address, an interview email, an approval email.
const page54 = (sheet: ReactNode) => (
  <>
    <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.4" />
    {sheet}
  </>
);
const noop = async () => {};
export const P5_4_SenderNew: S = { name: '5.4 Notifications · add sender address', render: () => page54(<SenderAddressSheet sender={null} canEdit onSave={noop} onClose={() => {}} />) };
export const P5_4_SenderEdit: S = { name: '5.4 Notifications · edit sender address', render: () => page54(<SenderAddressSheet sender={{ id: 's1', label: 'Kaveri Foods Careers', address: 'careers@kaverifoods.in', isDefault: true }} canEdit onSave={noop} onDelete={noop} onClose={() => {}} />) };
export const P5_4_InterviewEmail: S = { name: '5.4 Notifications · interview email (standard wording)', render: () => page54(<EventEmailSheet kind="interview" email={{ eventType: 'invite', subject: null, body: null, enabled: true, defaultSubject: 'Interview invitation: {{jobTitle}} at {{orgName}}', defaultBody: 'Hi {{candidateName}}, you are invited to interview for {{jobTitle}} at {{orgName}}. Proposed times: {{interviewTimes}}. Please confirm here: {{confirmLink}}' }} canEdit onSave={noop} onClose={() => {}} />) };
export const P5_4_ApprovalEmail: S = { name: '5.4 Notifications · approval email, view only', render: () => page54(<EventEmailSheet kind="approval" email={{ eventType: 'approval.requested', subject: '{{actorName}} asks you to approve {{subjectLabel}}', body: 'Open it here: {{link}}', enabled: true }} canEdit={false} onClose={() => {}} />) };
export const P5_5: S = { name: '5.5 WhatsApp & SMS', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.5" /> };
export const P5_5_ReadOnly: S = { name: '5.5 WhatsApp & SMS · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.5" readOnly /> };
export const P5_6: S = { name: '5.6 Announcements', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.6" /> };
export const P5_6_ReadOnly: S = { name: '5.6 Announcements · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.6" readOnly /> };
export const P5_7: S = { name: '5.7 Policies', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.7" /> };
export const P5_7_ReadOnly: S = { name: '5.7 Policies · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.7" readOnly /> };
export const P5_8: S = { name: '5.8 Helpdesk', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.8" /> };
export const P5_8_ReadOnly: S = { name: '5.8 Helpdesk · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.8" readOnly /> };
export const P5_9: S = { name: '5.9 Engage', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.9" /> };
export const P5_9_ReadOnly: S = { name: '5.9 Engage · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.9" readOnly /> };

// Settings S-8 (answer 1331): 5.1 live, the starter types and the company's own, and the type drawer.
const DOC_TYPES: DocTypeRow[] = [
  { key: 'pan_card', name: 'PAN card', sensitivity: 'confidential', requiresVerification: true, expiryTracked: false, reminderDays: [], uploadBy: ['person', 'hr'], system: true },
  { key: 'passport', name: 'Passport', sensitivity: 'confidential', requiresVerification: false, expiryTracked: true, reminderDays: [60, 30, 7], uploadBy: ['person', 'hr'], system: true },
  { key: 'c_fssai_food_handler', name: 'FSSAI food handler certificate', sensitivity: 'internal', requiresVerification: true, expiryTracked: true, reminderDays: [30], uploadBy: ['hr'], system: false },
];
const page51 = documentTypesPage(SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '5.1')!, DOC_TYPES);
const wait = () => new Promise((r) => setTimeout(r, 400));
export const P5_1_Live: S = { name: '5.1 Document types · live', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.1" live={{ page: page51, canEdit: true, lastChange: null, onSave: async () => undefined, listEditors: { 'doc.types': () => {} } }} /> };
export const DocumentTypeAdd: S = { name: '5.1 · Add document type', render: () => <DocumentTypeDrawer initial={null} onClose={() => {}} onSave={wait} /> };
export const DocumentTypeOwn: S = { name: '5.1 · Change a company type', render: () => <DocumentTypeDrawer initial={DOC_TYPES[2]!} onClose={() => {}} onSave={wait} onRetire={wait} /> };
export const DocumentTypeStarter: S = { name: '5.1 · A starter type (read-only)', render: () => <DocumentTypeDrawer initial={DOC_TYPES[1]!} onClose={() => {}} onSave={wait} /> };
