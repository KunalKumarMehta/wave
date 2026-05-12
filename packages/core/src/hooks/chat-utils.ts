/**
 * Shared utilities for Wave chat — used by both Extension and Desktop.
 */

/** Generate a unique message/conversation ID */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Detect if a user query is about the current page (agent mode).
 * Returns true for queries that need page awareness via AX tree.
 */
export function isPageQuery(query: string): boolean {
  const pageKeywords = [
    'this page', 'this site', 'this tab', 'the page', 'current page',
    'summarize', 'summarise', 'what is this', "what's on",
    'click', 'type', 'fill', 'navigate', 'scroll',
    'find on', 'read', 'extract', 'scrape',
  ];
  return pageKeywords.some((kw) => query.toLowerCase().includes(kw));
}

/** System prompt for regular (non-agent) chat */
export const CHAT_SYSTEM_PROMPT = 'You are Wave, an AI browser assistant. Be concise, helpful, and precise.';

/** System prompt for generating conversation titles */
export const TITLE_SYSTEM_PROMPT = 'Summarize the user prompt into a short 3-5 word title. Output ONLY the title, no quotes.';
