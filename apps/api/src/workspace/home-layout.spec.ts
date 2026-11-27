import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { WorkspaceController } from './workspace.controller';
import { checkLayout } from './home-layout.service';

// T2-F 79 (answer 2884): the stored layout's rules.
describe('checkLayout', () => {
  it('keeps a good layout as given', () => {
    expect(checkLayout({ order: ['stats', 'coming'], hidden: ['tasks'], sizes: { coming: 12 } })).toEqual({ order: ['stats', 'coming'], hidden: ['tasks'], sizes: { coming: 12 } });
    expect(checkLayout({ order: [], hidden: [], sizes: {} })).toEqual({ order: [], hidden: [], sizes: {} });
  });
  it('pinned widgets are never ordered or hidden; no widget twice; sizes 4, 6 or 12 only', () => {
    const bads: Parameters<typeof checkLayout>[0][] = [
      { order: ['actions'], hidden: [], sizes: {} },
      { order: [], hidden: ['nudge'], sizes: {} },
      { order: ['stats'], hidden: ['stats'], sizes: {} },
      { order: [], hidden: [], sizes: { coming: 8 } },
      { order: [], hidden: [], sizes: { 'bad id': 4 } },
    ];
    for (const bad of bads) expect(() => checkLayout(bad)).toThrow();
  });
  it("the layout routes are the caller's own (no permission key)", () => {
    const proto = WorkspaceController.prototype as unknown as Record<string, object>;
    for (const m of ['homeLayout', 'saveHomeLayout', 'resetHomeLayout']) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[m])).toBeUndefined();
      expect(Reflect.getMetadata(PATH_METADATA, proto[m])).toBe('home/layout');
    }
  });
});
