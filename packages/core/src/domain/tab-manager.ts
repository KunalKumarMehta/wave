/**
 * Tab Manager — tracks and orchestrates multiple browser tabs.
 */

export interface Tab {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

export interface TabController {
  openTab(url: string): Promise<Tab>;
  closeTab(id: string): Promise<void>;
  switchTab(id: string): Promise<void>;
  listTabs(): Promise<Tab[]>;
}

export class TabManager {
  private controller: TabController;
  private currentTabId: string | null = null;
  private maxTabs: number;

  constructor(controller: TabController, maxTabs = 10) {
    this.controller = controller;
    this.maxTabs = maxTabs;
  }

  async openTab(url: string): Promise<Tab> {
    const tabs = await this.controller.listTabs();
    if (tabs.length >= this.maxTabs) {
      throw new Error(
        `Wave supports at most ${this.maxTabs} open tabs. Close a tab before opening a new one.`,
      );
    }
    const tab = await this.controller.openTab(url);
    this.currentTabId = tab.id;
    return tab;
  }

  async closeTab(id: string): Promise<void> {
    await this.controller.closeTab(id);
    if (this.currentTabId === id) {
      const tabs = await this.listTabs();
      this.currentTabId = tabs.length > 0 ? tabs[0].id : null;
    }
  }

  async switchTab(id: string): Promise<void> {
    await this.controller.switchTab(id);
    this.currentTabId = id;
  }

  async listTabs(): Promise<Tab[]> {
    return this.controller.listTabs();
  }

  getCurrentTabId(): string | null {
    return this.currentTabId;
  }

  setCurrentTabId(id: string | null) {
    this.currentTabId = id;
  }
}
