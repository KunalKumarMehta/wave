# Wave — Agent Architecture

> How Wave's browser agent sees pages, thinks, and acts.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Side Panel (React)                     │
│  ┌─────────┐  ┌────────────┐  ┌───────────┐  ┌───────────┐ │
│  │ InputBar │  │ MessageList│  │ Settings  │  │ CostBadge │ │
│  └────┬────┘  └─────▲──────┘  └───────────┘  └───────────┘ │
│       │             │                                        │
│       ▼             │                                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              chrome.runtime.connect (port)               │ │
│  │         "cloud-stream" or "agent-stream"                 │ │
│  └──────────────────────┬──────────────────────────────────┘ │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   Service Worker (background.ts)              │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐│
│  │ Message Router│   │ Stream Router│   │ CDP Orchestrator ││
│  │ (ping, keys) │   │ (cloud/agent)│   │ (attach, extract)││
│  └──────────────┘   └──────┬───────┘   └────────┬─────────┘│
│                            │                     │          │
│  ┌────────────────────────┐│  ┌─────────────────┐│         │
│  │   Provider Adapters    ││  │  AX Serializer  ││         │
│  │ ┌───────┐ ┌─────────┐ ││  │  (tree→markdown)││         │
│  │ │OpenAI │ │Anthropic│ ││  └─────────────────┘│         │
│  │ └───────┘ └─────────┘ ││                     │          │
│  │ ┌───────┐             ││  ┌─────────────────┐│         │
│  │ │Gemini │             ││  │ Context Builder  ││         │
│  │ └───────┘             ││  │ (token budget)   ││         │
│  └────────────────────────┘│  └─────────────────┘│         │
│                            │                     │          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              chrome.debugger (CDP 1.3)                  │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Active Tab  │
                    │  (web page)  │
                    └──────────────┘
```

---

## 2. Dual-Mode Routing

Wave automatically detects whether a user query is about the current page:

```
User: "What is recursion?"        → cloud-stream (regular chat)
User: "What's on this page?"      → agent-stream (page-aware)
User: "Click the login button"    → agent-stream (page-aware)
```

### Detection Keywords
```ts
const pageKeywords = [
  'this page', 'this site', 'this tab', 'the page', 'current page',
  'summarize', 'summarise', 'what is this', "what's on",
  'click', 'type', 'fill', 'navigate', 'scroll',
  'find on', 'read', 'extract', 'scrape',
];
```

---

## 3. Page Context Extraction Pipeline

When a page-aware query is detected:

```
1. Side Panel queries active HTTP tab
2. Opens "agent-stream" port to Service Worker
3. Service Worker pipeline:
   a. chrome.debugger.attach(tabId)
   b. Accessibility.enable
   c. Accessibility.getFullAXTree (depth: 4)
   d. DOM.getDocument → get URL
   e. chrome.tabs.get → get title
   f. chrome.debugger.detach (dismiss banner)
   g. serializeAXTree → Markdown+refs
   h. ContextBuilder.pageContext(markdown, url, title)
   i. Stream LLM response
```

### AX Tree Serialization

**Input (Chrome's raw AX tree):**
```json
{
  "nodeId": "42",
  "role": {"value": "button"},
  "name": {"value": "Submit"},
  "backendDOMNodeId": 157
}
```

**Output (Wave's Markdown+refs):**
```
[ref=e1] button "Submit"
[ref=e2] textbox "Email" value="user@example.com"
[ref=e3] link "Forgot password?"
navigation "Main menu"
  [ref=e4] link "Home"
  [ref=e5] link "About"
  [ref=e6] link "Contact"
```

### Filtering Rules
- **Interactive elements** (button, link, textbox, etc.) → get `[ref=eN]` tag
- **Structural elements** (navigation, heading, form) → included for context, no ref
- **Generic/ignored/hidden** → skipped
- **Max depth:** 4 levels
- **Max elements:** 100 interactive + structural

---

## 4. Context Builder Token Budget

The context builder assembles the LLM prompt with hard token limits:

```
┌─────────────────────────────┐
│ Priority 0: System Prompt   │ ← ALWAYS included (even over budget)
│ (agent instructions)        │
├─────────────────────────────┤
│ Priority 2: Page Context    │ ← URL + Title + AX tree
│ (Markdown+refs)             │
├─────────────────────────────┤
│ Priority 10: History        │ ← Newest first, oldest dropped
│ (last 4 messages for agent) │
├─────────────────────────────┤
│ Priority 1: User Query      │ ← ALWAYS included (even over budget)
│ (what the user asked)       │
└─────────────────────────────┘

Total budget: 8192 tokens (agent mode)
```

### Token Estimation
- DOM content: **3.2 characters per token** (many special chars)
- Prose: **4.0 characters per token**
- Example: 1000-char AX tree ≈ 312 tokens

---

## 5. Agent System Prompt

The agent prompt enforces strict grounding:

```
You are Wave, an AI browser agent.

You will receive:
1. The page URL and title (use these to identify the site — NEVER guess)
2. The page's accessibility tree showing visible elements.

CRITICAL RULES — FOLLOW STRICTLY:
- ONLY describe elements that appear in the provided tree.
- NEVER invent, hallucinate, or assume content not explicitly listed.
- If you cannot determine specific content, say "several items/images"
  rather than guessing specific names.
- Always identify the page by its provided URL, not by guessing.
```

---

## 6. Agent Action System

### Available Actions

| Action | Parameters | CDP Commands Used |
|--------|-----------|-------------------|
| `click(ref)` | `ref`, `backendNodeId` | `DOM.getBoxModel` → `Input.dispatchMouseEvent` (press+release) |
| `type(ref, text)` | `ref`, `backendNodeId`, `text` | `DOM.focus` → `Input.dispatchKeyEvent` (Ctrl+A) → `Input.insertText` |
| `scroll(direction)` | `direction`, `amount` | `Input.dispatchMouseEvent` (mouseWheel) |
| `navigate(url)` | `url` | `Page.navigate` |
| `done(summary)` | `summary` | (none — signals completion) |

### Action Execution Flow (Current — One-Shot)
```
User asks "Summarize this page"
  → Extract AX tree
  → Build context (system + page + query)
  → Stream LLM response
  → Display response
  (end)
```

### Action Execution Flow (Target — Multi-Step Loop)
```
User asks "Click the login button and enter my email"
  → Extract AX tree
  → LLM: "I'll click the login button [ref=e5]"
  → Execute click(e5) via CDP
  → Wait for page update
  → Re-extract AX tree
  → LLM: "I see an email field [ref=e12]. Typing..."
  → Execute type(e12, "user@email.com") via CDP
  → Re-extract AX tree
  → LLM: "done(Clicked login, entered email)"
  (end)
```

> **Status:** One-shot mode works. Multi-step loop is the primary Sprint 8 target.

---

## 7. Provider Failover

The `ProviderRouter` implements automatic failover:

```
Primary (Gemini) → rate limit 429
  ↓ retry once with 1s backoff
  ↓ still failing
  → Failover to OpenAI
  ↓ stream succeeds
  → User sees: "⚡ Switching from gemini to openai: Rate limited"
```

### Failover triggers:
- HTTP 429 (rate limit)
- HTTP 5xx (server error)
- Network failure
- NOT: 4xx auth errors (those are user config issues)

> **Status:** `ProviderRouter` class is implemented but not yet wired into the service worker. Currently uses direct adapter selection.

---

## 8. Element Reference Map

When the AX tree is serialized, a `Map<string, SerializedElement>` is created:

```ts
{
  "e1": { ref: "e1", role: "button", name: "Submit", backendNodeId: 157, depth: 2 },
  "e2": { ref: "e2", role: "textbox", name: "Email", backendNodeId: 201, depth: 2, value: "..." },
}
```

This map is returned alongside the markdown and used by the action dispatcher to resolve `ref` → `backendNodeId` → CDP coordinates.

### Current limitation
The element map is returned from `handleGetPageContext` but is not persisted between the extraction step and the action step. For multi-step agent loops, the map needs to be cached per-tab in the service worker.

---

## 9. Security Model

```
┌────────────────────────┐     ┌─────────────────────────┐
│     chrome.storage     │     │   chrome.debugger       │
│       .session         │     │   (CDP 1.3)             │
│                        │     │                         │
│  API keys (ephemeral)  │     │  Attach to active tab   │
│  Wiped on browser      │     │  Read AX tree           │
│  close                 │     │  Dispatch input events   │
│                        │     │  Visible banner shown    │
│  Accessible from Side  │     │  Auto-detach after use   │
│  Panel via setAccess   │     │                         │
│  Level                 │     │  Cannot access ext pages │
└────────────────────────┘     └─────────────────────────┘
```

---

## 10. Future Agent Capabilities (Planned)

| Capability | Complexity | Blocked By |
|-----------|-----------|------------|
| Multi-step action loop | Medium | Sprint 8 work |
| Screenshot + vision model | High | Vision API integration |
| Form auto-fill | Medium | Agent loop + type action |
| Tab management | Low | Already have CDP |
| File download monitoring | Medium | Downloads API |
| Cookie/auth awareness | High | Security review needed |
| Cross-tab workflows | High | Multi-tab orchestration |
