import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { clear, play, press } from '../_kit/story-play';
import { KnowledgeScreen } from './knowledge';
import { KB_ARTICLE, kbProps } from './kb-data';

const meta: Meta = { title: 'Screens/Service desk/HLP-04 Knowledge', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LINKS: StoryLink[] = [
  { id: 'desk-tickets', label: 'Tickets', href: '#tickets', group: 'Service desk' },
  { id: 'desk-knowledge', label: 'Knowledge', href: '#knowledge', group: 'Service desk' },
];
const shell = (children: React.ReactNode) => (
  <LinksFrame active="desk-knowledge" links={LINKS}>
    <div className="yx-auth__page">{children}</div>
  </LinksFrame>
);

function Live() {
  const [articleId, setArticleId] = useState<string | null>(null);
  return <KnowledgeScreen {...kbProps({ articleId, article: articleId === KB_ARTICLE.id ? KB_ARTICLE : null, onOpenArticle: setArticleId })} />;
}

export const Articles: S = { name: 'SD-1.24 Spaces and articles', render: () => shell(<Live />) };
export const Editor: S = { name: 'SD-1.24 Article editor with review', render: () => shell(<KnowledgeScreen {...kbProps({ articleId: KB_ARTICLE.id, article: KB_ARTICLE })} />) };
export const Author: S = { name: 'SD-1.24 Article editor · author only', render: () => shell(<KnowledgeScreen {...kbProps({ articleId: KB_ARTICLE.id, article: { ...KB_ARTICLE, canPublish: false }, canSeeGaps: false, bin: null })} />) };

// Founder rules (28 Oct 2026): buttons are never greyed out; done is a toast.
const editor = () => shell(<KnowledgeScreen {...kbProps({ articleId: KB_ARTICLE.id, article: KB_ARTICLE })} />);
export const EditorTooEarly: S = { name: 'SD-1.24 Article editor · Save draft pressed with no title', render: editor, play: play(clear(/^Title/), press('Save draft')) };
export const EditorSaved: S = { name: 'SD-1.24 Article editor · draft saved (toast)', render: editor, play: play(press('Save draft')) };
export const NewCategoryTooEarly: S = { name: 'SD-1.24 Categories · Add category pressed with no name', render: () => shell(<Live />), play: play(press('Add category')) };
