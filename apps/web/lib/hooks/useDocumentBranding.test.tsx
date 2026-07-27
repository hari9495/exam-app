import { renderHook } from '@testing-library/react';
import { useDocumentBranding } from './useDocumentBranding';

let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

function iconLink() {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]');
}

function seedNextIconLink() {
  // What the App Router emits for app/icon.png, including the hints it sets.
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = '/icon.png?icon.abc123.png';
  link.setAttribute('sizes', '512x512');
  link.setAttribute('type', 'image/png');
  document.head.appendChild(link);
  return link;
}

describe('useDocumentBranding', () => {
  beforeEach(() => {
    document.head.replaceChildren();
    document.title = '';
    mockPathname = '/dashboard';
  });

  it('applies the organisation name and logo', () => {
    seedNextIconLink();
    renderHook(() => useDocumentBranding('Acme Corp', 'https://blob.example/acme.png?sig=x'));

    expect(document.title).toBe('Acme Corp');
    expect(iconLink()!.href).toContain('acme.png');
  });

  it('falls back to the product defaults when the org has no branding', () => {
    seedNextIconLink();
    renderHook(() => useDocumentBranding(null, null));

    expect(document.title).toBe('Prudent Hire');
    expect(iconLink()!.getAttribute('href')).toBe('/icon.png');
  });

  it('treats an empty name as unbranded rather than blanking the tab', () => {
    renderHook(() => useDocumentBranding('', null));
    expect(document.title).toBe('Prudent Hire');
  });

  it('does not append another icon link when one already exists', () => {
    seedNextIconLink();
    renderHook(() => useDocumentBranding('Acme Corp', 'https://blob.example/acme.png'));

    expect(document.querySelectorAll('link[rel~="icon"]')).toHaveLength(1);
  });

  // Regression from production: React re-inserts its own copy of the
  // app/icon.png link during hydration, so head really does end up with two.
  // Updating only the first left the second pointing at the product icon, and
  // browsers pick between duplicates unpredictably -- the org logo would have
  // been shown or ignored at random.
  it('updates every icon link when the document has duplicates', () => {
    seedNextIconLink();
    seedNextIconLink();

    renderHook(() => useDocumentBranding('Acme Corp', 'https://blob.example/acme.png'));

    const hrefs = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')].map((l) => l.getAttribute('href'));
    expect(hrefs).toHaveLength(2);
    expect(hrefs.every((h) => h === 'https://blob.example/acme.png')).toBe(true);
  });

  it('resets every duplicate back to the default when branding goes away', () => {
    seedNextIconLink();
    seedNextIconLink();

    renderHook(() => useDocumentBranding(null, null));

    const hrefs = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')].map((l) => l.getAttribute('href'));
    expect(hrefs.every((h) => h === '/icon.png')).toBe(true);
  });

  it('drops the size/type hints Next set for its own 512x512 PNG', () => {
    const link = seedNextIconLink();
    renderHook(() => useDocumentBranding('Acme Corp', 'https://blob.example/acme.svg'));

    // The org logo is arbitrary in dimensions and format; keeping those
    // attributes would describe the file incorrectly.
    expect(link.hasAttribute('sizes')).toBe(false);
    expect(link.hasAttribute('type')).toBe(false);
  });

  it('creates an icon link when the document has none', () => {
    renderHook(() => useDocumentBranding('Acme Corp', 'https://blob.example/acme.png'));
    expect(iconLink()).not.toBeNull();
  });

  // The regression this hook is most likely to suffer. On client-side
  // navigation the App Router re-applies the static metadata from layout.tsx,
  // resetting document.title. Without pathname in the dependency list the
  // branding would apply once and vanish on the first link click.
  it('re-applies branding after a client-side navigation resets the title', () => {
    seedNextIconLink();
    const { rerender } = renderHook(() => useDocumentBranding('Acme Corp', 'https://blob.example/acme.png'));
    expect(document.title).toBe('Acme Corp');

    document.title = 'Prudent Hire'; // what the router does on navigate
    mockPathname = '/exams';
    rerender();

    expect(document.title).toBe('Acme Corp');
  });

  it('restores defaults when branding goes away, e.g. on logout', () => {
    seedNextIconLink();
    const { rerender } = renderHook(({ n, l }) => useDocumentBranding(n, l), {
      initialProps: { n: 'Acme Corp' as string | null, l: 'https://blob.example/acme.png' as string | null },
    });
    expect(document.title).toBe('Acme Corp');

    rerender({ n: null, l: null });

    expect(document.title).toBe('Prudent Hire');
    expect(iconLink()!.getAttribute('href')).toBe('/icon.png');
  });
});
