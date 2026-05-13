import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { getClickScript, getTypeScript } from '../../../packages/native-bindings/src/dom-extractor';

describe('Agent Action Scripts', () => {
  let dom: JSDOM;

  beforeEach(() => {
    const html = fs.readFileSync(path.resolve(__dirname, '../test-fixtures/test-page.html'), 'utf8');
    dom = new JSDOM(html, { url: 'http://localhost:3000', runScripts: 'dangerously' });
    
    Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 100, height: 20 })
    });
  });

  it('should type into an element', () => {
    const elements = Array.from(dom.window.document.querySelectorAll('button, a, input, textarea, select, [role], h1, h2, h3, h4, h5, h6, [onclick], [tabindex]'));
    const emailIndex = elements.findIndex(el => (el as any).id === 'email');
    const ref = 'e' + (emailIndex + 1);

    const script = getTypeScript(ref, 'test@wave.ai');
    dom.window.eval(script);

    const input = dom.window.document.getElementById('email') as HTMLInputElement;
    expect(input.value).toBe('test@wave.ai');
  });

  it('should click an element', () => {
    const elements = Array.from(dom.window.document.querySelectorAll('button, a, input, textarea, select, [role], h1, h2, h3, h4, h5, h6, [onclick], [tabindex]'));
    const btnIndex = elements.findIndex(el => (el as any).id === 'login-btn');
    const ref = 'e' + (btnIndex + 1);

    const script = getClickScript(ref);
    dom.window.eval(script);

    const status = dom.window.document.getElementById('status');
    expect(status?.textContent).toContain('Logging in');
  });
});
