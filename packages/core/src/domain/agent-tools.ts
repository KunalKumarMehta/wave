/**
 * Agent tools — defines the actions the agent can take on a page.
 * These are sent as function/tool definitions to the LLM.
 */

export const AGENT_TOOLS = [
  {
    name: 'click',
    description: 'Click on an interactive element identified by its ref attribute.',
    parameters: {
      type: 'object' as const,
      properties: {
        ref: { type: 'string', description: 'Element reference like "e5"' },
        description: { type: 'string', description: 'Brief description of what you are clicking and why' },
      },
      required: ['ref', 'description'],
    },
  },
  {
    name: 'type',
    description: 'Type text into an input field identified by its ref. Clears existing content first.',
    parameters: {
      type: 'object' as const,
      properties: {
        ref: { type: 'string', description: 'Element reference like "e3"' },
        text: { type: 'string', description: 'Text to type' },
        description: { type: 'string', description: 'Brief description of what you are typing and why' },
      },
      required: ['ref', 'text', 'description'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page up or down.',
    parameters: {
      type: 'object' as const,
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Pixels to scroll. Default 400.' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL.',
    parameters: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Full URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'open_tab',
    description: 'Open a new browser tab with the specified URL.',
    parameters: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Full URL to open' },
        description: { type: 'string', description: 'Why you are opening this tab' },
      },
      required: ['url', 'description'],
    },
  },
  {
    name: 'switch_tab',
    description: 'Switch to a different open tab by its ID.',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Tab ID from list_tabs' },
        description: { type: 'string', description: 'Why you are switching to this tab' },
      },
      required: ['id', 'description'],
    },
  },
  {
    name: 'close_tab',
    description: 'Close an open tab by its ID.',
    parameters: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Tab ID to close' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_tabs',
    description: 'Get a list of all currently open tabs with their IDs and titles.',
    parameters: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'done',
    description: 'Signal that the task is complete. Include a summary of what was accomplished.',
    parameters: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string', description: 'Summary of actions taken and result' },
      },
      required: ['summary'],
    },
  },
];

export const AGENT_SYSTEM_PROMPT = `You are Wave, an AI browser agent. You can see and interact with multiple browser tabs.

You will receive:
1. The page URL and title (use these to identify the site — NEVER guess the site from the page structure alone)
2. The page's accessibility tree showing visible elements. Each interactive element has a [ref=eN] tag.
3. A list of all currently open tabs (if more than one).

CRITICAL RULES — FOLLOW STRICTLY:
- ONLY describe elements that appear in the provided accessibility tree. NEVER invent, hallucinate, or assume content that is not explicitly listed.
- Use the exact ref values from the page structure for any actions.
- Use the exact tab IDs from the tab list for switching or closing tabs.
- Emit ONLY ONE action per response. After each action you will receive the updated page state.

ACTION FORMAT:
When you need to act on the page, first briefly explain what you're doing and why, then emit exactly ONE action as a JSON block:

\`\`\`json
{"action": "click", "ref": "e5", "description": "Clicking the login button"}
\`\`\`

Available actions:
- click: \`{"action": "click", "ref": "eN", "description": "why"}\`
- type: \`{"action": "type", "ref": "eN", "text": "content", "description": "why"}\`
- scroll: \`{"action": "scroll", "direction": "down|up", "description": "why"}\`
- navigate: \`{"action": "navigate", "url": "https://...", "description": "why"}\`
- open_tab: \`{"action": "open_tab", "url": "https://...", "description": "why"}\`
- switch_tab: \`{"action": "switch_tab", "id": "tabId", "description": "why"}\`
- close_tab: \`{"action": "close_tab", "id": "tabId"}\`
- list_tabs: \`{"action": "list_tabs"}\`
- done: \`{"action": "done", "summary": "summary"}\`

RULES FOR ACTIONS:
- When a task requires multiple sites (e.g. comparing prices), open new tabs and switch between them.
- After opening a tab, you will need to switch to it to see its content.
- When the task is complete, emit done.`;
