/**
 * UI surface abstraction.
 * 
 * Chrome Extension: Side Panel (360px min, browser-managed lifecycle)
 * Tauri Native: Custom window (full control, overlays, PiP)
 * 
 * @see Knowledge Base: Wave 5.4 — Adaptive UI Surface
 */

export interface WindowOptions {
  width?: number;
  height?: number;
  transparent?: boolean;
  alwaysOnTop?: boolean;
}

export interface UIProvider {
  environment: 'extension' | 'desktop';

  /** Window controls — null in extension context (browser manages). */
  windowControls: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  } | null;

  /** Open a new window/tab. */
  openNewWindow: (url: string, options?: WindowOptions) => Promise<void>;
}
