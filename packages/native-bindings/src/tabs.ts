/**
 * Native (Desktop) Tab implementation.
 * Orchestrates Tauri webview and external Chrome tabs.
 */

import type { Tab, TabController } from '@wave/core/src/domain/tab-manager.js';
import { invoke } from '@tauri-apps/api/core';

export class NativeTabController implements TabController {
  async openTab(url: string): Promise<Tab> {
    try {
      // Try to open in external Chrome via CDP HTTP endpoint
      const res = await fetch(`http://localhost:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
      if (res.ok) {
        const data = await res.json();
        return {
          id: data.id,
          url: data.url,
          title: data.title || '',
          active: true,
        };
      }
    } catch (err) {
      console.warn('[Wave] Failed to open external tab, navigating embedded browser:', err);
    }

    // Fallback: Navigate the embedded browser
    await invoke('navigate_browser', { url });
    return {
      id: 'browser',
      url,
      title: 'Embedded Browser',
      active: true,
    };
  }

  async closeTab(id: string): Promise<void> {
    if (id === 'browser') return;
    try {
      await fetch(`http://localhost:9222/json/close/${id}`);
    } catch (err) {
      console.error('[Wave] Failed to close tab:', err);
    }
  }

  async switchTab(id: string): Promise<void> {
    if (id === 'browser') return;
    try {
      await fetch(`http://localhost:9222/json/activate/${id}`);
    } catch (err) {
      console.error('[Wave] Failed to switch tab:', err);
    }
  }

  async listTabs(): Promise<Tab[]> {
    const tabs: Tab[] = [];
    
    // Always include embedded browser
    tabs.push({ id: 'browser', url: '', title: 'Embedded Browser', active: true });

    try {
      const res = await fetch('http://localhost:9222/json');
      const data = await res.json();
      data.filter((t: any) => t.type === 'page').forEach((t: any) => {
        tabs.push({
          id: t.id,
          url: t.url,
          title: t.title || '',
          active: false, // Activation state is managed externally
        });
      });
    } catch (err) {
      // Chrome might not be running
    }

    return tabs;
  }
}
