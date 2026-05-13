/**
 * DOM Extractor script to be injected into the managed webview.
 * Extracts interactive elements and structural context for the agent.
 */
export const DOM_EXTRACTOR_SCRIPT = `
(function() {
  function getElementRole(el) {
    if (el.getAttribute('role')) return el.getAttribute('role');
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'button': return 'button';
      case 'a': return 'link';
      case 'input':
        if (['button', 'submit', 'reset'].includes(el.type)) return 'button';
        return 'textbox';
      case 'textarea': return 'textbox';
      case 'select': return 'combobox';
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': return 'heading';
      default: return '';
    }
  }

  function getElementLabel(el) {
    return (
      el.getAttribute('aria-label') ||
      el.innerText ||
      el.placeholder ||
      el.value ||
      el.title ||
      (el.tagName === 'INPUT' ? el.value : '')
    ).trim();
  }

  const elements = Array.from(document.querySelectorAll('button, a, input, textarea, select, [role], h1, h2, h3, h4, h5, h6, [onclick], [tabindex]'));
  
  const results = elements.map((el, index) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    if (window.getComputedStyle(el).display === 'none') return null;
    if (window.getComputedStyle(el).visibility === 'hidden') return null;

    const role = getElementRole(el);
    const label = getElementLabel(el);

    if (!role && !label) return null;

    return {
      ref: 'e' + (index + 1),
      tag: el.tagName.toLowerCase(),
      role: role,
      name: label, // We call it 'name' to match AX tree format
      value: el.value || '',
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };
  }).filter(Boolean);

  const context = {
    url: window.location.href,
    title: document.title,
    elements: results
  };

  return JSON.stringify(context);
})();
`;

/**
 * Generate a script to click an element by ref.
 */
export const getClickScript = (ref: string) => `
(function() {
  const elements = Array.from(document.querySelectorAll('button, a, input, textarea, select, [role], h1, h2, h3, h4, h5, h6, [onclick], [tabindex]'));
  // We need to use the same index logic as the extractor
  const el = elements.find((_, i) => 'e' + (i + 1) === '${ref}');
  if (el) {
    el.click();
    return true;
  }
  return false;
})();
`;

/**
 * Generate a script to type into an element by ref.
 */
export const getTypeScript = (ref: string, text: string) => `
(function() {
  const elements = Array.from(document.querySelectorAll('button, a, input, textarea, select, [role], h1, h2, h3, h4, h5, h6, [onclick], [tabindex]'));
  const el = elements.find((_, i) => 'e' + (i + 1) === '${ref}');
  if (el) {
    el.focus();
    if ('value' in el) {
      el.value = '${text.replace(/'/g, "\\'")}';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }
  return false;
})();
`;

/**
 * Wraps a script to send its result back to Wave via window.ipc.postMessage.
 */
export const wrapScriptForResult = (script: string, requestId: string) => `
(async function() {
  try {
    const result = await (async () => { 
      ${script} 
    })();
    const payload = JSON.stringify({ requestId: '${requestId}', result });
    if (window.ipc && window.ipc.postMessage) {
      window.ipc.postMessage(payload);
    } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc) {
      window.webkit.messageHandlers.ipc.postMessage(payload);
    } else if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
      window.chrome.webview.postMessage(payload);
    }
  } catch (e) {
    const errorPayload = JSON.stringify({ requestId: '${requestId}', error: e.message });
    if (window.ipc && window.ipc.postMessage) {
      window.ipc.postMessage(errorPayload);
    } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc) {
      window.webkit.messageHandlers.ipc.postMessage(errorPayload);
    } else if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
      window.chrome.webview.postMessage(errorPayload);
    }
  }
})();
`;
