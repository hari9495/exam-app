import { API_BASE } from '../../../../../lib/api-client';

// The public help centre's server-side reads (US-B-107, US-G-215): no session, public articles only, never cached by
// Next (an edit or a retired article shows at once). null on any failure so the page renders its own "not found".
// ponytail: server-side reads share the web server's address for the API's per-IP limit (60 a minute); put a CDN cache
// in front of /yx/help at go-live (GO-LIVE-CHECKLIST) before traffic grows.

export interface HelpHome {
  company: string;
  canonical: string;
  space: { name: string; slug: string; languages: string[] };
  spaces: { id: string; slug: string; name: string; categories: { id: string; parentId: string | null; name: string }[] }[];
  featured: { id: string; number: number; slug: string; title: string; summary: string | null }[];
  articles: { id: string; number: number; slug: string; title: string; summary: string | null; categoryId: string | null }[];
}

export interface HelpArticlePage {
  company: string;
  canonical: string;
  space: { name: string; slug: string };
  article: {
    id: string;
    number: number;
    slug: string;
    title: string;
    summary: string | null;
    bodyHtml: string;
    language: string;
    languages: string[];
    fallback: boolean;
    seoTitle: string | null;
    seoDescription: string | null;
    updatedAt: string;
  };
}

export type HelpArticleAnswer = HelpArticlePage | { redirect: string; permanent: boolean };

const enc = encodeURIComponent;

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/desk/help-centre/${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const helpHome = (org: string, space: string) => get<HelpHome>(`${enc(org)}/${enc(space)}`);
export const helpArticle = (org: string, space: string, key: string, lang?: string) =>
  get<HelpArticleAnswer>(`${enc(org)}/${enc(space)}/articles/${enc(key)}${lang ? `?lang=${enc(lang)}` : ''}`);
