import { API_BASE } from '../../../../lib/api-client';
import { originOf } from '../../../../lib/request-origin';

// M10 AT3 (S9): the careers sitemap for Google for Jobs. Built on each request, so a closed job is gone at once.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET(req: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const res = await fetch(`${API_BASE}/public/careers/${encodeURIComponent(orgSlug)}/sitemap`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return new Response('Not found', { status: 404 });
  const data = (await res.json()) as { jobs: { slug: string; updatedAt: string }[]; companies: string[] };
  const base = `${originOf(req.headers)}/careers/${encodeURIComponent(orgSlug)}`;
  const urls = [
    `<url><loc>${esc(base)}</loc></url>`,
    ...data.companies.map((c) => `<url><loc>${esc(`${base}?company=${encodeURIComponent(c)}`)}</loc></url>`),
    ...data.jobs.map((j) => `<url><loc>${esc(`${base}/jobs/${encodeURIComponent(j.slug)}`)}</loc><lastmod>${esc(j.updatedAt)}</lastmod></url>`),
  ];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
