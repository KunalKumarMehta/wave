import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TabManager } from '../src/domain/tab-manager.js';
import type { Tab, TabController } from '../src/domain/tab-manager.js';

function makeTabs(n: number): Tab[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    url: `https://example.com/${i}`,
    title: `Tab ${i}`,
    active: i === 0,
  }));
}

describe('TabManager', () => {
  let list: Tab[];
  let controller: TabController;

  beforeEach(() => {
    list = makeTabs(3);
    controller = {
      listTabs: vi.fn(async () => list),
      openTab: vi.fn(async (url: string) => {
        const tab: Tab = {
          id: `new-${list.length}`,
          url,
          title: 'New',
          active: true,
        };
        list = [...list, tab];
        return tab;
      }),
      closeTab: vi.fn(async (id: string) => {
        list = list.filter((t) => t.id !== id);
      }),
      switchTab: vi.fn(async () => {}),
    };
  });

  it('opens a tab when under the limit', async () => {
    const mgr = new TabManager(controller, 10);
    const tab = await mgr.openTab('https://wave.test');
    expect(tab.url).toBe('https://wave.test');
    expect(controller.openTab).toHaveBeenCalled();
  });

  it('rejects openTab when at maxTabs', async () => {
    list = makeTabs(10);
    const mgr = new TabManager(controller, 10);
    await expect(mgr.openTab('https://full.test')).rejects.toThrow(/at most 10 open tabs/);
    expect(controller.openTab).not.toHaveBeenCalled();
  });

  it('respects custom maxTabs', async () => {
    list = makeTabs(2);
    const mgr = new TabManager(controller, 2);
    await expect(mgr.openTab('https://x.test')).rejects.toThrow(/at most 2 open tabs/);
  });
});
