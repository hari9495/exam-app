import type { Meta, StoryObj } from '@storybook/react-vite';
import { ok, play, press } from '../_kit/story-play';
import { ArticleDrawer, type KbArticleView } from '../desk/help-kb';
import { OpsDesk } from './ops-kit';

// Helpdesk HLP-20 · Help article (founder answer 1603, 12 Nov 2026): the article a requester opens from the help centre,
// the portal or a search, drawn in the HLP-04 article look; the same component those pages render.
const meta: Meta = { title: 'Screens/Helpdesk/HLP-20 · Help article', component: ArticleDrawer, parameters: { layout: 'fullscreen' }, decorators: [(Story) => <OpsDesk area="helpdesk" active="Help centre"><Story /></OpsDesk>] };
export default meta;
type S = StoryObj;

const WIFI: KbArticleView = { id: 'a1', number: 12, title: 'Connect to the office Wi-Fi', summary: 'Join KaveriStaff with your work sign-in.', bodyHtml: '<p>Choose <strong>KaveriStaff</strong>, then sign in with your work email.</p><ol><li>Open Wi-Fi settings.</li><li>Pick KaveriStaff.</li><li>Sign in with your work email and password.</li></ol>', language: 'en', languages: ['en', 'hi'], fallback: false, updatedAt: '2026-10-08T10:00:00Z' };
const drawer = (article: KbArticleView = WIFI) => <ArticleDrawer open onOpenChange={() => undefined} article={article} onFeedback={ok} onSolved={ok} onStillNeedHelp={() => undefined} onLanguage={() => undefined} timeZone="Asia/Kolkata" />;
export const ArticleRead: S = { name: 'Was this helpful?', render: () => drawer() };
export const ArticleVoteAgain: S = { name: 'A second vote (toast)', render: () => drawer(), play: play(press('Yes'), press('No')) };
export const ArticleSolved: S = { name: 'This solved it (toast)', render: () => drawer(), play: play(press('This solved it')) };
export const ArticleFallback: S = { name: 'Not in your language yet (shown in English)', render: () => drawer({ ...WIFI, language: 'en', languages: ['en'], fallback: true }) };
