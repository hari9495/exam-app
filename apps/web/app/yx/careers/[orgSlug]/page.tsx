import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { publicGet, visitorIp } from '../../../../lib/yx-careers';
import type { CareersPageResponse } from '../../../../lib/types';
import { CareersHome } from './careers-home';

// T9-09 careers home (founder decision 8): public and unauthenticated, rendered on the server so search engines see the
// jobs; the designed CareersSiteScreen with the company's builder layout. ?company= picks a group company's page.
type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ company?: string | string[] }> };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const fetchCareers = async (orgSlug: string, company?: string) => publicGet<CareersPageResponse>(`/careers/${encodeURIComponent(orgSlug)}${company ? `?company=${encodeURIComponent(company)}` : ''}`, visitorIp(await headers()));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { orgSlug } = await params;
  const data = await fetchCareers(orgSlug, one((await searchParams).company));
  if (!data) return { title: 'Careers', robots: { index: false } };
  return { title: { absolute: `Careers at ${data.companyName ?? data.orgName}` }, description: data.headline ?? `Open jobs at ${data.orgName}` };
}

export default async function YxCareersPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const company = one((await searchParams).company);
  return <CareersHome orgSlug={orgSlug} company={company ?? null} data={await fetchCareers(orgSlug, company)} />;
}
