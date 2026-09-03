'use client';

// v2 Branding (org-admin). Format-only re-skin of the old (org-admin)/settings/branding page on
// v2 primitives + tokens. Same hooks (useOrgBranding / useUpdateBranding / useUpdateBrandingLogo),
// same validation, optimistic watermark toggle and gating; only presentation changes
// (old ui kit → ui-v2, useToast → inline notice, CollapsibleSection → static cards).
import { useState, useEffect } from 'react';
import { ImageIcon } from 'lucide-react';
import { useOrgBranding, useUpdateBranding, useUpdateBrandingLogo } from '../../../../../lib/hooks/useBranding';
import { Button, Cb, dt } from '../../../../../components/ui-v2';
import { STATUS } from '../../../../../components/ui-v2/viz';

// Prudent's own brand colors (Science Blue / Lightning Yellow / white text) -- what an
// org gets by default when it hasn't picked its own, and what "Use Prudent defaults"
// resets to.
const PRUDENT_PRIMARY_COLOR = '#0053e2';
const PRUDENT_ACCENT_COLOR = '#ffc220';
const PRUDENT_TEXT_COLOR = '#ffffff';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px' };
const sectionTitle: React.CSSProperties = { fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: ink, margin: 0 };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const errorText: React.CSSProperties = { fontSize: 12.5, color: 'var(--danger)', margin: '10px 0 0' };

type Notice = { type: 'success' | 'error'; text: string } | null;

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  // Typed hex tracks independently of `value` so a mid-edit string like "#12" (not yet a
  // valid 6-digit hex) doesn't get clobbered by the picker's own onChange -- only a valid
  // hex is ever forwarded to the parent.
  const [typedHex, setTypedHex] = useState(value);
  useEffect(() => setTypedHex(value), [value]);

  const isValid = HEX_COLOR_PATTERN.test(typedHex);

  function handleHexChange(next: string) {
    const withHash = next.startsWith('#') ? next : `#${next}`;
    setTypedHex(withHash);
    if (HEX_COLOR_PATTERN.test(withHash)) onChange(withHash);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: ink }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* A bare type=color input collapses to a thin sliver under the shared field styling,
            so it's styled directly here rather than through TextField. */}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          style={{ height: 40, width: 40, flexShrink: 0, cursor: 'pointer', borderRadius: 8, border: '1px solid var(--hair)', padding: 2, background: 'var(--paper)' }}
        />
        <input
          type="text"
          value={typedHex}
          onChange={(e) => handleHexChange(e.target.value)}
          aria-label={`${label} hex code`}
          spellCheck={false}
          maxLength={7}
          style={{
            width: 120, borderRadius: 8, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase',
            color: ink, background: 'var(--surface)', outline: 'none',
            border: `1px solid ${isValid ? 'color-mix(in srgb, var(--ink) 15%, var(--hair))' : 'var(--danger)'}`,
          }}
        />
      </div>
      {!isValid && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>Enter a 6-digit hex code, e.g. #0053E2.</span>}
    </div>
  );
}

export default function V2BrandingSettingsPage() {
  const { data: branding, isLoading, isError, error: loadError } = useOrgBranding();
  const updateBranding = useUpdateBranding();
  const updateLogo = useUpdateBrandingLogo();
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };
  const [primaryColor, setPrimaryColor] = useState(PRUDENT_PRIMARY_COLOR);
  const [accentColor, setAccentColor] = useState(PRUDENT_ACCENT_COLOR);
  const [textColor, setTextColor] = useState(PRUDENT_TEXT_COLOR);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [colorsError, setColorsError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  // An org that has never picked its own colors comes back with primaryColor/accentColor/
  // textColor all null -- the state above already defaults to Prudent's colors, so there's
  // nothing to overwrite here for that case, and this effect only fires once real values exist.
  useEffect(() => {
    if (branding?.primaryColor) setPrimaryColor(branding.primaryColor);
    if (branding?.accentColor) setAccentColor(branding.accentColor);
    if (branding?.textColor) setTextColor(branding.textColor);
    if (branding) setWatermarkEnabled(branding.loginWatermarkEnabled);
  }, [branding]);

  function handleWatermarkToggle(next: boolean) {
    // Optimistic: flip immediately, revert if the save fails. The change is small enough
    // to save on toggle rather than behind a separate button.
    setWatermarkEnabled(next);
    updateBranding.mutate(
      { loginWatermarkEnabled: next },
      {
        onSuccess: () => notify('success', next ? 'Logo watermark enabled.' : 'Logo watermark disabled.'),
        onError: (err) => {
          setWatermarkEnabled(!next);
          setLogoError(err instanceof Error ? err.message : 'Failed to update watermark setting');
        },
      },
    );
  }

  function handleUsePrudentDefaults() {
    setPrimaryColor(PRUDENT_PRIMARY_COLOR);
    setAccentColor(PRUDENT_ACCENT_COLOR);
    setTextColor(PRUDENT_TEXT_COLOR);
  }

  function handleColorsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setColorsError(null);
    updateBranding.mutate(
      { primaryColor, accentColor, textColor },
      {
        onSuccess: () => notify('success', 'Colors updated.'),
        onError: (err) => setColorsError(err instanceof Error ? err.message : 'Failed to update colors'),
      },
    );
  }

  function handleLogoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLogoError(null);
    if (!logoFile) return;
    updateLogo.mutate(logoFile, {
      onSuccess: () => {
        notify('success', 'Logo updated.');
        setLogoFile(null);
      },
      onError: (err) => setLogoError(err instanceof Error ? err.message : 'Failed to upload logo'),
    });
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Branding Settings</h1>
        <p style={{ ...desc, marginTop: 6 }}>Theme the candidate exam experience and staff console with your organization&apos;s colors and logo.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      {isError && (
        <div role="alert" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)', color: 'var(--danger)' }}>
          Couldn&apos;t load your current branding: {loadError instanceof Error ? loadError.message : 'unknown error'}. You can still upload a logo.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Colors */}
        <section style={card}>
          <h2 style={sectionTitle}>Colors</h2>
          <p style={desc}>
            Used to theme the candidate exam experience and staff console for your organization. Font Color is the
            text/label color shown on top of buttons and highlights that use your Primary Color -- pick one that
            stays readable against it.
          </p>
          <form onSubmit={handleColorsSubmit} style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <ColorSwatch label="Primary Color" value={primaryColor} onChange={setPrimaryColor} />
              <ColorSwatch label="Accent Color" value={accentColor} onChange={setAccentColor} />
              <ColorSwatch label="Font Color" value={textColor} onChange={setTextColor} />
            </div>
            {/* Colours stay gated until the current values load, so a save can't overwrite
                the org's real colours with this component's Prudent-default state. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <Button type="submit" disabled={!branding} loading={updateBranding.isPending}>Save colors</Button>
              <button type="button" className="v2-hoverbtn" style={dt.toolBtn} disabled={!branding} onClick={handleUsePrudentDefaults}>Use Prudent defaults</button>
            </div>
          </form>
          {colorsError && <p role="alert" style={errorText}>{colorsError}</p>}
        </section>

        {/* Logo */}
        <section style={card}>
          <h2 style={sectionTitle}>Logo</h2>
          <p style={desc}>Shown on the login page, invitation emails, and the candidate exam header.</p>
          <div style={{ display: 'flex', height: 96, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px dashed var(--hair)', background: 'var(--surface)', marginTop: 14 }}>
            {isLoading ? (
              <span style={{ fontSize: 13, color: muted }}>Loading…</span>
            ) : branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="Organization logo" style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: muted }}>
                <ImageIcon size={22} />
                <span style={{ fontSize: 11.5 }}>No logo uploaded</span>
              </div>
            )}
          </div>
          <form onSubmit={handleLogoSubmit} style={{ marginTop: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: ink }}>
              Upload new logo (PNG, JPEG, or SVG, max 2MB)
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                style={{ marginTop: 6, display: 'block', width: '100%', fontSize: 13, color: muted }}
              />
            </label>
            {/* Gated on the FILE, not on the branding fetch: uploading a logo does not
                need the current branding, and coupling them meant one failed GET
                disabled the upload button entirely. */}
            <div style={{ marginTop: 14 }}>
              <Button type="submit" disabled={!logoFile} loading={updateLogo.isPending}>Upload logo</Button>
            </div>
          </form>
          {logoError && <p role="alert" style={errorText}>{logoError}</p>}

          {/* Watermark opt-in. Gated on a logo existing -- with no logo there is nothing to
              render as the watermark. The hint sets the transparent-background expectation,
              since an opaque logo silhouettes to a faint block rather than the mark. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--hair)', paddingTop: 16, marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: ink, cursor: (!branding?.logoUrl || updateBranding.isPending) ? 'default' : 'pointer', opacity: (!branding?.logoUrl || updateBranding.isPending) ? 0.5 : 1 }}>
              <Cb checked={watermarkEnabled} onChange={(v) => { if (branding?.logoUrl && !updateBranding.isPending) handleWatermarkToggle(v); }} />
              Show our logo as a watermark on the login page
            </label>
            <p style={{ paddingLeft: 25, fontSize: 11.5, color: muted, margin: 0 }}>
              {branding?.logoUrl
                ? 'Renders your logo as a large tone-on-tone silhouette on the login panel. Works best with a transparent-background logo.'
                : 'Upload a logo first to enable the login watermark.'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
