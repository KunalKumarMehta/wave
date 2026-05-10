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

export const AGENT_SYSTEM_PROMPT = `You are Wave, an AI browser agent. You can see and interact with the current web page.

You will receive:
1. The page URL and title (use these to identify the site — NEVER guess the site from the page structure alone)
2. The page's accessibility tree showing visible elements. Each interactive element has a [ref=eN] tag.

CRITICAL RULES — FOLLOW STRICTLY:
- ONLY describe elements that appear in the provided accessibility tree. NEVER invent, hallucinate, or assume content that is not explicitly listed.
- If the tree shows navigation links like "Today's Deals" and "Gift Cards", report exactly those — do not add items from your training data.
- If you cannot determine specific content (e.g. product names, images), say "the page shows several items/images" rather than guessing specific names.
- Always identify the page by its provided URL, never by guessing from structure.
- Use the exact ref values from the page structure for any actions.
- If you can't find the right element, say so rather than guessing.

Available actions:
- click(ref): Click an element
- type(ref, text): Type into an input field
- scroll(direction): Scroll the page
- navigate(url): Go to a URL
- done(summary): Signal task completion`;
