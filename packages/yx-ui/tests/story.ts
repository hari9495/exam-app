import type { Page } from '@playwright/test';

/**
 * Opens a story and waits for Storybook's own "storyRendered" event, which comes after the story's play function
 * (typing a name, focusing a step) has finished. Waiting a fixed time after the first paint raced those play functions:
 * a screenshot or an axe scan could catch the story half way.
 */
export async function openStory(page: Page, id: string, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __yxRendered?: boolean; __STORYBOOK_ADDONS_CHANNEL__?: { on(e: string, f: () => void): void } };
    const hook = setInterval(() => {
      if (!w.__STORYBOOK_ADDONS_CHANNEL__) return;
      clearInterval(hook);
      w.__STORYBOOK_ADDONS_CHANNEL__.on('storyRendered', () => (w.__yxRendered = true));
    }, 5);
  });
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  await page.waitForSelector('#storybook-root > *', { state: 'attached' });
  await page.waitForFunction(() => (window as unknown as { __yxRendered?: boolean }).__yxRendered === true);
  // storybook-addon-pseudo-states rewrites the stylesheets (:focus-visible → a class) when storyRendered fires. On a
  // slow runner a stylesheet can finish loading after that single event (the light theme renders once; dark renders
  // again on the theme switch), so the forced state never showed. Once every sheet has loaded, announce the render
  // again so the rewrite sees them all; for stories without forced states it changes nothing.
  await page.waitForLoadState('load');
  await page.evaluate((storyId) => {
    const w = window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit(e: string, id: string): void } };
    w.__STORYBOOK_ADDONS_CHANNEL__.emit('storyRendered', storyId);
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, id);
  // The addon tags the forced-state elements once, after the render. A full-page screenshot briefly gives the page a
  // 1x1 viewport (Chrome's capture beyond the viewport fires resize events), so a component that switches layout on a
  // media query (the stepper's step list below 1024 px) remounts and the new elements lose their pseudo-* class: the
  // stepper focus story was shot without its focus rings now and then. Tag elements again whenever the story's DOM
  // changes, with the same selectors and class names (pseudo-<state in kebab case>) the addon uses.
  await page.evaluate(() => {
    const w = window as unknown as { __STORYBOOK_PREVIEW__?: { currentRender?: { story?: { parameters?: { pseudo?: Record<string, unknown> } } } } };
    const { rootSelector: _root, ...pseudo } = w.__STORYBOOK_PREVIEW__?.currentRender?.story?.parameters?.pseudo ?? {};
    const forced = Object.entries(pseudo).flatMap(([state, sel]) =>
      typeof sel === 'string' || Array.isArray(sel) ? [[`pseudo-${state.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, [sel].flat().join(',')] as const] : [],
    );
    const root = document.getElementById('storybook-root');
    if (!forced.length || !root) return;
    const tag = () => forced.forEach(([cls, sel]) => root.querySelectorAll(sel).forEach((e) => e.classList.contains(cls) || e.classList.add(cls)));
    tag();
    new MutationObserver(tag).observe(root, { childList: true, subtree: true });
  });
  // The rewrite can still land after that (a dark-theme focus ring once missed): wait until every forced state on the
  // page (an element with class pseudo-focus-visible, ...) has a rewritten rule that matches that element. Any rule
  // with the class is not enough: other components' sheets were rewritten first while the story's own sheet (the
  // stepper's, loaded with the story) was not yet, so the focus story was shot without its ring now and then.
  await page.waitForFunction(() => {
    const selectors: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const r of rules) {
        if (r instanceof CSSStyleRule && r.selectorText.includes('.pseudo-')) selectors.push(r.selectorText);
        if ('cssRules' in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
      }
    };
    for (const sh of document.styleSheets) {
      try {
        walk(sh.cssRules);
      } catch {
        // a cross-origin sheet cannot be read; it has no story styles
      }
    }
    // The rule draws the element itself or something inside it (".yx-btn.pseudo-hover .icon").
    const matches = (e: Element, sel: string) => {
      try {
        return e.matches(sel) || e.querySelector(sel) !== null;
      } catch {
        return false;
      }
    };
    return [...document.querySelectorAll('[class*="pseudo-"]')].every((e) =>
      [...e.classList].filter((c) => c.startsWith('pseudo-')).every((c) => selectors.some((sel) => sel.includes(`.${c}`) && matches(e, sel))),
    );
  });
}
