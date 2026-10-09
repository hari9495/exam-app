import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { WorkspaceShell, type WorkspaceLink } from '../auth/shell';
import { KnowledgeScreen } from './knowledge';
import { KB_ARTICLE, kbProps } from './kb-data';

const meta: Meta = { title: 'Screens/Service desk/HLP-04 Knowledge', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LINKS: WorkspaceLink[] = [
  { id: 'desk-tickets', label: 'Tickets', href: '#tickets', group: 'Service desk' },
  { id: 'desk-knowledge', label: 'Knowledge', href: '#knowledge', group: 'Service desk' },
];
const shell = (children: React.ReactNode) => (
  <WorkspaceShell active="desk-knowledge" links={LINKS} company="Kaveri Foods" profileHref="#" name="Suresh Pillai" email="it-agent@kaveri.test" onSignOut={() => {}}>
    <div className="yx-auth__page">{children}</div>
  </WorkspaceShell>
);

function Live() {
  const [articleId, setArticleId] = useState<string | null>(null);
  return <KnowledgeScreen {...kbProps({ articleId, article: articleId === KB_ARTICLE.id ? KB_ARTICLE : null, onOpenArticle: setArticleId })} />;
}

export const Articles: S = { name: 'SD-1.24 Spaces and articles', render: () => shell(<Live />) };
export const Editor: S = { name: 'SD-1.24 Article editor with review', render: () => shell(<KnowledgeScreen {...kbProps({ articleId: KB_ARTICLE.id, article: KB_ARTICLE })} />) };
export const Author: S = { name: 'SD-1.24 Article editor · author only', render: () => shell(<KnowledgeScreen {...kbProps({ articleId: KB_ARTICLE.id, article: { ...KB_ARTICLE, canPublish: false }, canSeeGaps: false, bin: null })} />) };
