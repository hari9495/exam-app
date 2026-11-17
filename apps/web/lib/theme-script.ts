// Runs inline before the page paints: dark or light from the choice made in the account menu (the same
// localStorage key as @yukthix/ui WorkspaceShell), else from the OS setting -- so the sign-in pages, where
// no menu exists yet, follow `prefers-color-scheme` too (DESIGN-SYSTEM §3; validation 8 Oct 2026).
import { ACCESSIBILITY_SCRIPT } from '@yukthix/ui/a11y';

// Then the Accessibility menu's choices kept in this browser (answers 2330 to 2334): high contrast, text size and the
// rest set on <html> in the same plain script, so nothing flashes the default look first. Signed in, the account's
// saved choices replace these once they load (and are kept here for the next visit).
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('yx-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()` + ';' + ACCESSIBILITY_SCRIPT;
