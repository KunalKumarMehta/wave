import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NavBar } from '@wave/ui-components/src/layout/NavBar.js';
import { PlatformProvider } from '@wave/ui-components';
import { invoke } from '@tauri-apps/api/core';
import React from 'react';

const mockIpc = { environment: 'desktop' as const, on: vi.fn(), send: vi.fn() };
const mockStorage = {
  config: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), delete: vi.fn() },
  secure: { getSecret: vi.fn(), setSecret: vi.fn(), deleteSecret: vi.fn() },
};
const mockUi = {
  environment: 'desktop' as const,
  windowControls: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
  openNewWindow: vi.fn(),
  copyToClipboard: vi.fn(),
  openExternal: vi.fn(),
};

describe('NavBar Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue('https://initial.com');
  });

  it('should trigger navigation when URL is submitted', async () => {
    render(
      <PlatformProvider ipc={mockIpc as any} storage={mockStorage as any} ui={mockUi as any}>
        <NavBar />
      </PlatformProvider>
    );

    const input = screen.getByPlaceholderText(/enter url/i);
    fireEvent.change(input, { target: { value: 'wave.ai' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(invoke).toHaveBeenCalledWith('navigate_browser', { url: 'https://wave.ai' });
  });

  it('should display the current URL', async () => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_browser_url') return Promise.resolve('https://current-page.com');
      return Promise.resolve(undefined);
    });

    render(
      <PlatformProvider ipc={mockIpc as any} storage={mockStorage as any} ui={mockUi as any}>
        <NavBar />
      </PlatformProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByText('https://current-page.com')).toBeTruthy();

    vi.useRealTimers();
  });
});
