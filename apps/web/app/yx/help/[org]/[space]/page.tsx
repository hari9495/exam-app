import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { helpHome } from './help-data';
import { HelpSearch } from './help-client';

// The public help centre (US-B-107, US-G-215): server-rendered so search engines read it, with a page title, a
// description and a canonical address. Only public articles ever reach this page (the API's reader policy).
type Params = { params: Promise<{ org: string; space: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { org, space } = await params;
  const home = await helpHome(org, space);
  if (!home) return { title: 'Help centre', robots: { index: false } };
  return {
    title: { absolute: `${home.space.name} | ${home.company}` },
    description: `Answers and how-to guides from ${home.company}.`,
    alternates: { canonical: home.canonical },
  };
}

export default async function PublicHelpHome({ params }: Params) {
  const { org, space } = await params;
  const home = await helpHome(org, space);
  if (!home) notFound();
  const base = `/yx/help/${encodeURIComponent(org)}/${encodeURIComponent(space)}`;
  const sp = home.spaces[0];
  const cats = sp?.categories ?? [];
  const inCat = (id: string | null) => home.articles.filter((a) => a.categoryId === id);
  return (
    <main className="yx-auth__page yx-desk yx-help-public">
      <header className="yx-ops-stack" data-gap="sm">
        <p className="yx-ops-muted">{home.company}</p>
        <h1 className="yx-help-public__title">{home.space.name}</h1>
      </header>
      <HelpSearch org={org} space={space} />
      {home.featured.length > 0 && (
        <section aria-labelledby="popular">
          <h2 id="popular" className="yx-ops-card__title">
            Popular answers
          </h2>
          <ArticleLinks base={base} items={home.featured} />
        </section>
      )}
      {cats
        .filter((c) => !c.parentId)
        .map((c) => {
          const subs = cats.filter((x) => x.parentId === c.id);
          const items = [...inCat(c.id), ...subs.flatMap((s) => inCat(s.id))];
          return items.length ? (
            <section key={c.id} aria-labelledby={`c-${c.id}`}>
              <h2 id={`c-${c.id}`} className="yx-ops-card__title">
                {c.name}
              </h2>
              <ArticleLinks base={base} items={items} />
            </section>
          ) : null;
        })}
      {inCat(null).length > 0 && (
        <section aria-labelledby="more">
          <h2 id="more" className="yx-ops-card__title">
            More answers
          </h2>
          <ArticleLinks base={base} items={inCat(null)} />
        </section>
      )}
      {home.articles.length === 0 && <p className="yx-ops-muted">No articles yet.</p>}
    </main>
  );
}

function ArticleLinks({ base, items }: { base: string; items: { id: string; slug: string; title: string; summary: string | null }[] }) {
  return (
    <ul className="yx-ops-list">
      {items.map((a) => (
        <li key={a.id} className="yx-ops-list__item">
          <span className="yx-ops-list__main">
            <a className="yx-desk-link" href={`${base}/${a.slug}`}>
              {a.title}
            </a>
            {a.summary && <span className="yx-ops-list__sub">{a.summary}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
