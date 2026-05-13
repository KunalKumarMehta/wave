import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { DOM_EXTRACTOR_SCRIPT } from '../../../packages/native-bindings/src/dom-extractor';

describe('DOM Extraction Script', () => {
  let dom: JSDOM;

  beforeEach(() => {
    const htmlPath = path.resolve(__dirname, '../test-fixtures/test-page.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    dom = new JSDOM(html, { url: 'http://localhost:3000', runScripts: 'dangerously' });
    
    // Mocking everything needed by the script
    Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20 })
    });

    dom.window.getComputedStyle = (el: any) => ({
      display: 'block',
      visibility: 'visible',
      getPropertyValue: (prop: string) => {
        if (prop === 'display') return 'block';
        if (prop === 'visibility') return 'visible';
        return '';
      }
    } as any);
  });

  it('should find elements in the DOM', () => {
    const buttons = dom.window.document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should extract elements via the script', () => {
    // The script is an IIFE that returns a string
    const result = dom.window.eval(DOM_EXTRACTOR_SCRIPT);
    const data = JSON.parse(result);
    
    expect(data.elements.length).toBeGreaterThan(0);
    const loginBtn = data.elements.find((el: any) => el.name === 'Login');
    expect(loginBtn).toBeDefined();
    expect(loginBtn.role).toBe('button');
  });
});
