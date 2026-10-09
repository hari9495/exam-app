import { API_BASE } from '../../../../../../lib/api-client';

// US-G-215: the public help centre's sitemap, as the API builds it (public articles only, their last update).
export async function GET(_req: Request, { params }: { params: Promise<{ org: string; space: string }> }) {
  const { org, space } = await params;
  const res = await fetch(`${API_BASE}/desk/help-centre/${encodeURIComponent(org)}/${encodeURIComponent(space)}/sitemap.xml`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return new Response('Not found', { status: 404 });
  return new Response(await res.text(), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
