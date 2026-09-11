'use client';

// v2 Settings -> Careers site (Zoho #14). Configure the org's public careers page
// (enable/disable, headline, intro copy, banner image) and link out to the public page.
// Layout/card styling mirrors settings/apply-consent + settings/branding; the (org-admin)
// layout already gates entry to org_admin / acting super_admin.
import { useEffect, useState } from 'react';
import { ImageIcon, ExternalLink } from 'lucide-react';
import { useCareersSettings, useUpdateCareersSettings, useUploadCareersBanner } from '../../../../../lib/hooks/useCareersSettings';
import { useAuth } from '../../../../../lib/auth-context';
// Imported directly from Button.tsx, not the ui-v2 barrel: the barrel re-exports DataTable,
// which pulls in @tanstack/react-table's ESM build and breaks under this repo's jest transform.
import { Button } from '../../../../../components/ui-v2/Button';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: ink, marginBottom: 6 };
const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  padding: '9px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))',
  background: 'var(--paper)',
  color: ink,
  outline: 'none',
  fontFamily: 'inherit',
};
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 140, resize: 'vertical' };
const errorText: React.CSSProperties = { fontSize: 12.5, color: 'var(--danger)', margin: '10px 0 0' };

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function V2CareersSettingsPage() {
  const { data, isLoading, isError } = useCareersSettings();
  const update = useUpdateCareersSettings();
  const uploadBanner = useUploadCareersBanner();
  const { organizationSlug } = useAuth();

  const [enabled, setEnabled] = useState(false);
  const [headline, setHeadline] = useState('');
  const [intro, setIntro] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setHeadline(data.headline ?? '');
    setIntro(data.intro ?? '');
  }, [data]);

  function handleSave() {
    update.mutate(
      { enabled, headline: headline.trim() ? headline : null, intro: intro.trim() ? intro : null },
      {
        onSuccess: () => notify('success', 'Careers settings saved.'),
        onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to save careers settings.'),
      },
    );
  }

  function handleBannerUpload(e: React.FormEvent) {
    e.preventDefault();
    setBannerError(null);
    if (!bannerFile) return;
    uploadBanner.mutate(bannerFile, {
      onSuccess: () => {
        notify('success', 'Banner updated.');
        setBannerFile(null);
      },
      onError: (err) => setBannerError(err instanceof Error ? err.message : 'Failed to upload banner'),
    });
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Careers site</h1>
          <p style={{ ...desc, marginTop: 6 }}>
            A public page listing your open, publicly-applyable jobs that have opted into careers listing.
          </p>
        </div>
        {organizationSlug && (
          <a
            href={`/careers/${organizationSlug}`}
            target="_blank"
            rel="noreferrer"
            className="v2-hoverbtn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--org-primary, #0053e2)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            View public careers page <ExternalLink size={13} />
          </a>
        )}
      </div>

      {notice && (
        <div
          role="status"
          style={{
            marginBottom: 12,
            fontSize: 13,
            padding: '9px 13px',
            borderRadius: 9,
            border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`,
            background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)',
            color: notice.type === 'success' ? '#15803d' : 'var(--danger)',
          }}
        >
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load careers settings.</p>}

      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: ink, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-label="Enable careers site"
            style={{ width: 15, height: 15, accentColor: 'var(--org-primary, #0053e2)' }}
          />
          Enable careers site
        </label>
        <p style={desc}>When disabled, the public careers page returns a not-found response for every visitor.</p>

        <div style={{ marginTop: 16 }}>
          <label style={label} htmlFor="careers-headline">Headline</label>
          <input
            id="careers-headline"
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            style={inputStyle}
            placeholder="Join our team"
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={label} htmlFor="careers-intro">Intro</label>
          <textarea
            id="careers-intro"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            style={textareaStyle}
            placeholder="A short description of what it's like to work here."
          />
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={handleSave} loading={update.isPending}>Save</Button>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 }}>Banner</h2>
        <p style={desc}>Shown at the top of the public careers page.</p>
        <div style={{ display: 'flex', height: 96, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px dashed var(--hair)', background: 'var(--surface)', marginTop: 14 }}>
          {data?.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.bannerUrl} alt="Current careers banner" style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: muted }}>
              <ImageIcon size={22} />
              <span style={{ fontSize: 11.5 }}>No banner uploaded</span>
            </div>
          )}
        </div>
        <form onSubmit={handleBannerUpload} style={{ marginTop: 14 }}>
          <label style={label} htmlFor="careers-banner-file">
            Upload new banner (PNG, JPEG, or SVG, max 2MB)
            <input
              id="careers-banner-file"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
              style={{ marginTop: 6, display: 'block', width: '100%', fontSize: 13, color: muted, fontWeight: 400 }}
            />
          </label>
          <div style={{ marginTop: 14 }}>
            <Button type="submit" disabled={!bannerFile} loading={uploadBanner.isPending}>Upload banner</Button>
          </div>
        </form>
        {bannerError && <p role="alert" style={errorText}>{bannerError}</p>}
      </div>
    </div>
  );
}
