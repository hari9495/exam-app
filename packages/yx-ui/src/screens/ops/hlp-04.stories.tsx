import type { Meta, StoryObj } from '@storybook/react-vite';
import { KbEditorScreen } from './helpdesk';
import { ARTICLES, KB_HTML, KB_VERSIONS } from './helpdesk-data';
import { TODAY } from '../_kit/data';
import { play, press } from '../_kit/story-play';
import { KB_ARTICLE, KB_DRAFT, KB_REVIEW_DUE, liveKb, openKb } from './helpdesk-kb-live-samples';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-04 · Knowledge base editor', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Published: S = { render: () => <KbEditorScreen article={ARTICLES[0]} html={KB_HTML} versions={KB_VERSIONS} mode="published" today={TODAY} /> };
export const Draft: S = { name: 'New draft', render: () => <KbEditorScreen article={ARTICLES[5]} html="<p>Install the VPN client from the company portal.</p>" versions={[]} mode="draft" today={TODAY} /> };
export const ReviewDue: S = { name: 'Review due', render: () => <KbEditorScreen article={ARTICLES[3]} html="<p>Letters are issued from Me, Documents and letters.</p>" versions={KB_VERSIONS.slice(1)} mode="review-due" today={TODAY} /> };

// States the real knowledge base has (Helpdesk design wiring, round 4; founder answer 1: the HLP design wins). Drawn in
// the same layout as the stories above.
export const Articles: S = { name: 'Knowledge base · articles in a space', render: () => <KbEditorScreen live={liveKb()} /> };
export const NewArticle: S = { name: 'New article', render: () => <KbEditorScreen live={liveKb({ start: { dialog: 'new-article' } })} /> };
export const NewSpace: S = { name: 'New space', render: () => <KbEditorScreen live={liveKb({ start: { dialog: 'new-space' } })} /> };
export const NoSpaces: S = { name: 'No spaces yet', render: () => <KbEditorScreen live={liveKb({ spaces: [], spaceId: null, articles: [] })} /> };
export const Categories: S = { name: 'Categories of a space', render: () => <KbEditorScreen live={liveKb({ start: { tab: 'categories' } })} /> };
export const Blocks: S = { name: 'Reusable blocks', render: () => <KbEditorScreen live={liveKb({ start: { tab: 'blocks' } })} /> };
export const Templates: S = { name: 'Article templates', render: () => <KbEditorScreen live={liveKb({ start: { tab: 'templates' } })} /> };
export const Gaps: S = { name: 'Content gaps', render: () => <KbEditorScreen live={liveKb({ start: { tab: 'gaps' } })} /> };
export const RecycleBin: S = { name: 'Recycle bin', render: () => <KbEditorScreen live={liveKb({ start: { tab: 'bin' } })} /> };
export const WaitingReview: S = { name: 'Publisher · a version waiting for your review', render: () => <KbEditorScreen live={openKb(KB_ARTICLE)} /> };
export const PublishConfirm: S = { name: 'Publisher · publish the reviewed version', render: () => <KbEditorScreen live={openKb(KB_ARTICLE, { start: { dialog: 'publish' } })} /> };
export const SendBack: S = { name: 'Publisher · send back with a note', render: () => <KbEditorScreen live={openKb(KB_ARTICLE, { start: { dialog: 'send-back' } })} /> };
export const Compare: S = { name: 'Versions · compare with the published one', render: () => <KbEditorScreen live={openKb(KB_ARTICLE, { start: { dialog: 'compare', compare: 2 } })} /> };
export const AuthorDraft: S = { name: 'Author · own draft, send for review', render: () => <KbEditorScreen live={openKb(KB_DRAFT)} /> };
export const SendTooEarly: S = { name: 'Author · Send for review pressed with no answer', render: () => <KbEditorScreen live={openKb({ ...KB_DRAFT, versions: [{ ...KB_DRAFT.versions[0], bodyHtml: '' }] })} />, play: play(press('Send for review')) };
export const ReviewDueLive: S = { name: 'Review due · mark reviewed', render: () => <KbEditorScreen live={openKb(KB_REVIEW_DUE)} /> };
export const OutOfDate: S = { name: 'Marked out of date', render: () => <KbEditorScreen live={openKb({ ...KB_ARTICLE, outdated: true, outdatedReason: 'The Wi-Fi name changed to Kaveri-Staff' })} /> };
export const Preview: S = { name: 'Preview as employee', render: () => <KbEditorScreen live={openKb(KB_DRAFT, { start: { dialog: 'preview' } })} /> };
export const Details: S = { name: 'Details · web address, dates, owner', render: () => <KbEditorScreen live={openKb(KB_ARTICLE, { start: { dialog: 'details' } })} /> };
export const ReadOnly: S = { name: 'Reader (no author rights) · read only', render: () => <KbEditorScreen live={openKb({ ...KB_ARTICLE, canAuthor: false, canPublish: false }, { blocks: null, templates: null, canSeeGaps: false, bin: null })} /> };
export const NoAccess: S = { name: 'No access', render: () => <KbEditorScreen live={liveKb({ state: 'no-access' })} /> };
