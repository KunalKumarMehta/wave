import { describe, it, expect } from 'vitest';
import { serializeAXTree } from '../src/domain/ax-serializer.js';

// Helper to build mock AX nodes
function makeNode(id: string, role: string, name?: string, childIds?: string[], opts?: {
  ignored?: boolean;
  value?: string;
  backendDOMNodeId?: number;
  properties?: Array<{ name: string; value: { value: unknown } }>;
}) {
  return {
    nodeId: id,
    role: { value: role },
    name: name ? { value: name } : undefined,
    childIds,
    ignored: opts?.ignored,
    value: opts?.value ? { value: opts.value } : undefined,
    backendDOMNodeId: opts?.backendDOMNodeId,
    properties: opts?.properties,
  };
}

describe('AX Tree Serializer', () => {
  it('returns empty state for no nodes', () => {
    const result = serializeAXTree([]);
    expect(result.markdown).toBe('_Empty page_');
    expect(result.elements.size).toBe(0);
    expect(result.stats.totalNodes).toBe(0);
  });

  it('serializes interactive elements with refs', () => {
    const nodes = [
      makeNode('root', 'WebArea', 'Page', ['n1', 'n2']),
      makeNode('n1', 'button', 'Submit', undefined, { backendDOMNodeId: 100 }),
      makeNode('n2', 'textbox', 'Email', undefined, { backendDOMNodeId: 101, value: 'test@test.com' }),
    ];

    const result = serializeAXTree(nodes);
    
    expect(result.elements.size).toBe(2);
    expect(result.elements.has('e1')).toBe(true);
    expect(result.elements.has('e2')).toBe(true);
    expect(result.elements.get('e1')!.role).toBe('button');
    expect(result.elements.get('e1')!.name).toBe('Submit');
    expect(result.elements.get('e2')!.role).toBe('textbox');
    expect(result.elements.get('e2')!.value).toBe('test@test.com');
    expect(result.markdown).toContain('[ref=e1]');
    expect(result.markdown).toContain('[ref=e2]');
    expect(result.markdown).toContain('button "Submit"');
    expect(result.markdown).toContain('value="test@test.com"');
  });

  it('skips ignored nodes', () => {
    const nodes = [
      makeNode('root', 'WebArea', 'Page', ['n1', 'n2']),
      makeNode('n1', 'button', 'Visible'),
      makeNode('n2', 'button', 'Hidden', undefined, { ignored: true }),
    ];

    const result = serializeAXTree(nodes);
    expect(result.elements.size).toBe(1);
    expect(result.markdown).toContain('Visible');
    expect(result.markdown).not.toContain('Hidden');
  });

  it('skips generic/none roles', () => {
    const nodes = [
      makeNode('root', 'WebArea', 'Page', ['n1', 'n2']),
      makeNode('n1', 'generic', '', ['n2']),
      makeNode('n2', 'button', 'Click me'),
    ];

    const result = serializeAXTree(nodes);
    // WebArea is skipped (generic-like root), generic is skipped, only button remains
    expect(result.markdown).toContain('Click me');
    expect(result.markdown).not.toContain('generic');
  });

  it('includes structural roles without refs', () => {
    const nodes = [
      makeNode('root', 'WebArea', 'Page', ['n1']),
      makeNode('n1', 'navigation', 'Main nav', ['n2']),
      makeNode('n2', 'link', 'Home'),
    ];

    const result = serializeAXTree(nodes);
    expect(result.markdown).toContain('navigation "Main nav"');
    expect(result.markdown).toContain('[ref=e1] link "Home"');
    // Navigation is structural — should NOT have a [ref=] tag itself
    const lines = result.markdown.split('\n');
    const navLine = lines.find((l) => l.includes('navigation'));
    expect(navLine).toBeDefined();
    expect(navLine).not.toContain('[ref=');
  });

  it('respects maxDepth limit', () => {
    const nodes = [
      makeNode('root', 'WebArea', 'Page', ['n1']),
      makeNode('n1', 'navigation', 'Nav', ['n2']),
      makeNode('n2', 'list', 'List', ['n3']),
      makeNode('n3', 'listitem', 'Item', ['n4']),
      makeNode('n4', 'link', 'Deep link', ['n5']),
      makeNode('n5', 'button', 'Too deep'),
    ];

    const result = serializeAXTree(nodes, { maxDepth: 3 });
    expect(result.markdown).toContain('link "Deep link"');
    expect(result.markdown).not.toContain('Too deep');
  });

  it('respects maxElements limit', () => {
    const childIds: string[] = [];
    const nodes: ReturnType<typeof makeNode>[] = [
      makeNode('root', 'WebArea', 'Page', []),
    ];

    for (let i = 0; i < 20; i++) {
      const id = `btn${i}`;
      childIds.push(id);
      nodes.push(makeNode(id, 'button', `Button ${i}`));
    }
    nodes[0].childIds = childIds;

    const result = serializeAXTree(nodes, { maxElements: 5 });
    expect(result.elements.size).toBe(5);
  });

  it('shows disabled/checked/expanded properties', () => {
    const nodes = [
      makeNode('root', 'WebArea', 'Page', ['n1', 'n2']),
      makeNode('n1', 'button', 'Disabled btn', undefined, {
        properties: [{ name: 'disabled', value: { value: true } }],
      }),
      makeNode('n2', 'checkbox', 'Accept terms', undefined, {
        properties: [{ name: 'checked', value: { value: true } }],
      }),
    ];

    const result = serializeAXTree(nodes);
    expect(result.markdown).toContain('(disabled)');
    expect(result.markdown).toContain('(checked)');
  });

  it('estimates token count correctly', () => {
    const nodes = [
      makeNode('root', 'WebArea', 'Page', ['n1']),
      makeNode('n1', 'button', 'Submit'),
    ];

    const result = serializeAXTree(nodes);
    // Token estimate should be markdown.length / 3.2 (DOM ratio)
    const expected = Math.ceil(result.markdown.length / 3.2);
    expect(result.stats.outputTokenEstimate).toBe(expected);
  });
});
