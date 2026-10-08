import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { helpArticle, type HelpArticlePage } from '../help-data';
import { ArticleActions } from '../help-client';

// One public help article (US-B-107, US-G-215, US-G-216): its search title and description, a canonical address, other
// languages as alternates; an old address answers with a permanent redirect (308) to where it lives now; a short
// number (/yx/help/<company>/<space>/12) goes to the article's own address. The body is HTML the API cleaned with its
// allow-list when it was saved (no scripts, no styles, no images).
type Params = { params: Promise<{ org: string; space: string; slug: string }>; searchParams: Promise<{ lang?: string }> };

const LANG_LABEL: Record<string, string> = { en: 'English', hi: 'हिन्दी', ta: 'தமிழ்', te: 'తెలుగు' };

async function load(p: Params): Promise<{ page: HelpArticlePage; base: string }> {
  const { org, space, slug } = await p.params;
  const { lang } = await p.searchParams;
  const answer = await helpArticle(org, space, slug, lang && /^(en|hi|ta|te)$/.test(lang) ? lang : undefined);
  if (!answer) notFound();
  if ('redirect' in answer) {
    // Only ever a path of this help centre (the API builds it); anything else is not followed.
    if (!answer.redirect.startsWith('/yx/help/')) notFound();
    if (answer.permanent) permanentRedirect(answer.redirect);
    redirect(answer.redirect);
  }
  return { page: answer, base: `/yx/help/${encodeURIComponent(org)}/${encodeURIComponent(space)}` };
}

export async function generateMetadata(p: Params): Promise<Metadata> {
  const { page } = await load(p);
  const a = page.article;
  const languages = Object.fromEntries(a.languages.filter((l) => l !== 'en').map((l) => [l, `${page.canonical}?lang=${l}`]));
  return {
    title: { absolute: `${a.seoTitle || a.title} | ${page.company}` },
    description: a.seoDescription || a.summary || undefined,
    alternates: { canonical: page.canonical, languages },
    openGraph: { title: a.seoTitle || a.title, description: a.seoDescription || a.summary || undefined, type: 'article' },
  };
}

export default async function PublicHelpArticle(p: Params) {
  const { page, base } = await load(p);
  const { org, space } = await p.params;
  const a = page.article;
  return (
    <main className="yx-auth__page yx-desk yx-help-public">
      <nav aria-label="Breadcrumb" className="yx-ops-muted yx-help-public__crumbs">
        <a className="yx-desk-link" href={base}>
          {page.space.name}
        </a>
      </nav>
      <article className="yx-ops-stack">
        <h1 className="yx-help-public__title">{a.title}</h1>
        {a.languages.length > 1 && (
          <p className="yx-ops-row" aria-label="Languages">
            {a.languages.map((l) =>
              l === a.language ? (
                <strong key={l}>{LANG_LABEL[l] ?? l}</strong>
              ) : (
                <a key={l} className="yx-desk-link" href={`${base}/${a.slug}${l === 'en' ? '' : `?lang=${l}`}`} hrefLang={l}>
                  {LANG_LABEL[l] ?? l}
                </a>
              ),
            )}
          </p>
        )}
        {a.fallback && <p className="yx-ops-muted">This article is not in your language yet, so it is shown in English.</p>}
        {a.summary && <p className="yx-ops-muted">{a.summary}</p>}
        <div className="yx-desk-body" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />
        <p className="yx-ops-muted">
          Article KB-{a.number} · last updated {new Date(a.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </article>
      <ArticleActions org={org} space={space} articleId={a.id} />
    </main>
  );
}
