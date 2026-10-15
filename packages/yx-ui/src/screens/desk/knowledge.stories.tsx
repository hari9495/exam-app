import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
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
