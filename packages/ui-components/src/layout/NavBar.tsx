import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './NavBar.css';

export const NavBar: React.FC = () => {
  const [url, setUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleNavigate = useCallback(async () => {
    if (!url) return;
    let targetUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      targetUrl = `https://${url}`;
    }
    setIsLoading(true);
    try {
      await invoke('navigate_browser', { url: targetUrl });
    } catch (err) {
      console.error('Navigation failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const url = await invoke<string>('get_browser_url');
        if (url !== 'about:blank') {
          setCurrentUrl(url);
        }
      } catch {
        // ignore
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="nav-bar">
      <div className="nav-bar__controls">
        <button className="nav-bar__btn" title="Back">←</button>
        <button className="nav-bar__btn" title="Forward">→</button>
        <button 
          className={`nav-bar__btn ${isLoading ? 'nav-bar__btn--loading' : ''}`} 
          onClick={handleNavigate}
          title="Reload"
        >
          {isLoading ? '...' : '↻'}
        </button>
      </div>
      <div className="nav-bar__input-wrapper">
        <input 
          className="nav-bar__input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
          placeholder="Enter URL and press Enter..."
        />
      </div>
      <div className="nav-bar__status" title={currentUrl}>
        {currentUrl || 'No page loaded'}
      </div>
    </div>
  );
};
