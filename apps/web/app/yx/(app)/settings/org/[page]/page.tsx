'use client';

import { useParams } from 'next/navigation';
import { SETTINGS_GROUPS, type SettingDef, type SettingsPageDef } from '@yukthix/ui/hiring';
import { RegistrySettingsPage } from '../../../../../../lib/yx-registry-settings';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { useAuth } from '../../../../../../lib/auth-context';
import { apiFetch } from '../../../../../../lib/api-client';

// Settings › Organisation (1.1, 1.5, 1.6) (S-7, answer 1321): the drawn page with the settings that were on Company rules, with
// "Different for" where a setting allows it. HR's settings key changes them.
const PAGES = ['1.1', '1.5', '1.6'];
const canEdit = (has: (k: string) => boolean) => has('org.settings.manage');

// Answer 2422 (retiring /v2 Branding): 1.1's designed Logo and Brand colour, live from the company's branding. The logo is
// uploaded as soon as it is chosen; the colour saves with the page. Both need the company settings key (org:manage_settings),
// never while acting for someone else; the API checks both and audits each change.
const LOGO = 'org.company.logo';
const COLOUR = 'org.brand.primary_colour';
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '1.1')!;
const designed = (key: string) => design.sections.flatMap((s) => s.settings).find((d) => d.key === key)!;
type Branding = { logoUrl: string | null; primaryColor: string | null };

function withBranding(page: SettingsPageDef, b: Branding, editable: boolean): SettingsPageDef {
  const locked = editable ? undefined : 'Changed by people with the company settings key.';
  const fields: SettingDef[] = [
    { ...designed(LOGO), value: b.logoUrl, starter: !b.logoUrl, scope: 'Company', locked },
    { ...designed(COLOUR), value: b.primaryColor ?? '', starter: !b.primaryColor, scope: 'Company', locked },
  ];
  return { ...page, sections: [{ title: 'Logo and brand colour', settings: fields }, ...page.sections] };
}

export default function YxSettingsPage() {
  const { page } = useParams<{ page: string }>();
  const perms = useYxPermissions();
  const { accessToken, impersonating, actingSuperAdmin } = useAuth();
  const branding = page === 'company-and-branding';
  const brand = useApi<Branding>(branding ? '/organizations/branding' : null);
  const write = useApiWrite();
  const editable = perms.has('org:manage_settings') && !impersonating && !actingSuperAdmin;
  if (!branding) return <RegistrySettingsPage slug={page} pageIds={PAGES} links={{}} canEdit={canEdit} />;
  return (
    <RegistrySettingsPage
      slug={page}
      pageIds={PAGES}
      links={{}}
      canEdit={(has) => canEdit(has) || editable}
      decorate={(p) => (brand.data ? withBranding(p, brand.data, editable) : p)}
      onSaveOther={async (values) => {
        if (typeof values[COLOUR] === 'string' && values[COLOUR]) await write('PATCH', '/organizations/branding', { primaryColor: values[COLOUR].trim().toUpperCase() });
      }}
      onUploadImage={
        editable
          ? async (_key, file) => {
              const body = new FormData();
              body.append('file', file);
              await apiFetch('/organizations/branding/logo', { method: 'POST', body }, accessToken ?? undefined);
              await brand.refetch();
            }
          : undefined
      }
    />
  );
}
