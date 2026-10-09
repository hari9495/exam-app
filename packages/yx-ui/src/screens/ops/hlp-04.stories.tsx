import type { Meta, StoryObj } from '@storybook/react-vite';
import { KbEditorScreen } from './helpdesk';
import { ARTICLES, KB_HTML, KB_VERSIONS } from './helpdesk-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-04 · Knowledge base editor', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Published: S = { render: () => <KbEditorScreen article={ARTICLES[0]} html={KB_HTML} versions={KB_VERSIONS} mode="published" today={TODAY} /> };
export const Draft: S = { name: 'New draft', render: () => <KbEditorScreen article={ARTICLES[5]} html="<p>Install the VPN client from the company portal.</p>" versions={[]} mode="draft" today={TODAY} /> };
export const ReviewDue: S = { name: 'Review due', render: () => <KbEditorScreen article={ARTICLES[3]} html="<p>Letters are issued from Me, Documents and letters.</p>" versions={KB_VERSIONS.slice(1)} mode="review-due" today={TODAY} /> };
