# Storybook tests

- `visual.spec.ts`: a screenshot of every design-system story (everything outside `Screens/*`) in light and dark.
  It is compared with the baseline in `__screenshots__/<platform>/` (Git LFS).
- `a11y.spec.ts`: a WCAG 2.2 AA axe scan of every story, `Screens/*` included, in light and dark.

CI (`.github/workflows/ci.yml`, job `yx-ui`) runs both on Linux, so `__screenshots__/linux` is what CI compares with.
`__screenshots__/win32` is for local runs on Windows with the installed Chrome (`npm run test:visual`).

## Updating the Linux baselines after an intended change

Fonts and anti-aliasing differ between machines, so take Linux baselines on the CI runner, never on a laptop:

1. Push the change, then run **Actions › yx-ui visual baselines › Run workflow** on your branch.
2. Download the `yx-ui-visual-baselines-linux` artifact from that run.
3. Unzip it over `packages/yx-ui/tests/__screenshots__/linux/` and check the changed images show only what you meant
   to change.
4. Commit them (they go to Git LFS through `.gitattributes`) and push. The `yx-ui visual` job then passes.

A failing `yx-ui visual` job also uploads its diffs (`*-diff.png`) as the `yx-ui-visual-1` artifact, so you can see
what moved before you decide whether to update the baselines.

## Local runs

`npm run test:visual` and `npm run test:a11y` build Storybook first; `npm run test:visual:update` refreshes the
baselines for your own platform.
