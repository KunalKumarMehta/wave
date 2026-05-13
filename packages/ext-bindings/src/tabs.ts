/**
 * Chrome Extension Tab implementation via chrome.tabs API.
 */

import type { Tab, TabController } from '@wave/core/src/domain/tab-manager.js';

export class ExtTabController implements TabController {
  async openTab(url: string): Promise<Tab> {
    const tab = await chrome.tabs.create({ url });
    return {
      id: String(tab.id),
      url: tab.url || url,
      title: tab.title || '',
      active: true,
    };
  }

  async closeTab(id: string): Promise<void> {
    await chrome.tabs.remove(Number(id));
  }

  async switchTab(id: string): Promise<void> {
    await chrome.tabs.update(Number(id), { active: true });
  }

  async listTabs(): Promise<Tab[]> {
    const tabs = await chrome.tabs.query({});
    return tabs.map((t) => ({
      id: String(t.id),
      url: t.url || '',
      title: t.title || '',
      active: t.active,
    }));
  }
}
