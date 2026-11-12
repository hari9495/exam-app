import type { Meta, StoryObj } from '@storybook/react-vite';
import { ok, play, press, type } from '../_kit/story-play';
import { ArticleBody, type KbArticleView } from './help-kb';

// ArticleBody as the help centre, the portal and the knowledge pages render it (a live copy; not one of the five drawn
// in HLP-15 to HLP-19).
const meta: Meta = { title: 'Screens/Helpdesk/Live · Help article', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ Help article (requester): feedback once, solved is a toast
const WIFI: KbArticleView = { id: 'a1', number: 12, title: 'Connect to the office Wi-Fi', summary: 'Join KaveriStaff with your work sign-in.', bodyHtml: '<p>Choose <strong>KaveriStaff</strong>, then sign in with your work email.</p>', language: 'en', languages: ['en', 'hi'], fallback: false, updatedAt: '2026-10-08T10:00:00Z' };
const article = () => <ArticleBody article={WIFI} onFeedback={ok} onSolved={ok} onStillNeedHelp={() => undefined} onLanguage={() => undefined} timeZone="Asia/Kolkata" />;
export const ArticleRead: S = { name: 'Help article · was this helpful?', render: article };
export const ArticleVoteAgain: S = { name: 'Help article · a second vote (toast)', render: article, play: play(press('Yes'), press('No')) };
export const ArticleSolved: S = { name: 'Help article · This solved it (toast)', render: article, play: play(press('This solved it')) };
