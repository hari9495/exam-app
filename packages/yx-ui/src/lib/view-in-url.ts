import { useEffect, useRef } from 'react';

const inUrl = (param: string) => new URLSearchParams(window.location.search).get(param);
const setInUrl = (param: string, id: string | null, push: boolean) => {
  const u = new URL(window.location.href);
  if (id) u.searchParams.set(param, id);
  else u.searchParams.delete(param);
  // Our own pushes are flagged, so closing steps back instead of stacking the list on top.
  if (push) window.history.pushState({ ...window.history.state, yxView: param }, '', u);
  else window.history.replaceState(window.history.state, '', u);
};

/**
 * A full-page view held in screen state (a template, an email's wording) also lives in the address as ?param=id, so the
 * browser's Back and Forward move between it and the list and a reload keeps it open. `show` opens the view for an id
 * (null closes it) and says whether that id exists. Returns `close`, for the view's own back link.
 */
export function useViewInUrl(param: string, shown: string | null, ready: boolean, show: (id: string | null) => boolean) {
  const showRef = useRef(show);
  showRef.current = show;
  const restored = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!restored.current) {
      restored.current = true;
      const id = inUrl(param);
      if (id && !showRef.current(id)) setInUrl(param, null, false);
    }
    const onPop = () => void showRef.current(inUrl(param));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [param, ready]);
  useEffect(() => {
    const now = inUrl(param);
    if (restored.current && now !== shown) setInUrl(param, shown, now === null);
  }, [param, shown]);
  return () => (window.history.state?.yxView === param ? window.history.back() : void show(null));
}
