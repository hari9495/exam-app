// Runs inline before the page paints: dark or light from the choice made in the account menu (the same
// localStorage key as @yukthix/ui WorkspaceShell), else from the OS setting -- so the sign-in pages, where
// no menu exists yet, follow `prefers-color-scheme` too (DESIGN-SYSTEM §3; validation 8 Oct 2026).
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('yx-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()`;
