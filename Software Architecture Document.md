# SAD: Wave — Software Architecture Document

> **Version:** 0.2 (Updated 2026-05-11)  
> **Status:** Implemented through Sprint 7

---

## 1. High-Level Architecture

Wave is structured as a **platform-agnostic monorepo** with pluggable bindings.  
Current deployment: Chrome Extension (MV3). Future: Tauri + CEF native shell.

```
┌─────────────────────────────────────────────────────┐
│                    apps/extension                    │
│  ┌────────────────┐  ┌───────────────────────────┐  │
│  │  background.ts │  │     sidepanel.tsx          │  │
│  │  (Service Worker│  │     (React 19 App)        │  │
│  │   354 LOC)     │  │     350 LOC)              │  │
│  └───────┬────────┘  └──────────▲────────────────┘  │
│          │    chrome.runtime.connect (port)    │     │
│          └────────────────────────────────────┘     │
└──────────┼──────────────────────────────────────────┘
           │ imports
┌──────────▼──────────────────────────────────────────┐
│                   packages/                          │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────┐ │
│  │   core/      │  │ ext-bindings/ │  │ ui-      │ │
│  │  (domain)    │  │ (chrome impl) │  │ components│ │
│  │  1,568 LOC   │  │   381 LOC     │  │  894 LOC │ │
│  └──────────────┘  └───────────────┘  └──────────┘ │
│  ┌──────────────┐                                   │
│  │native-bindings│ (Tauri stub — 10 LOC)            │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

### Package Responsibilities

| Package | Purpose | Depends On |
|---------|---------|-----------|
| `@wave/core` | Platform-agnostic domain logic: adapters, serializers, state, types | None (leaf) |
| `@wave/ext-bindings` | Chrome Extension implementations of core interfaces | `@wave/core` |
| `@wave/ui-components` | Shared React components (chat, layout, generative UI) | `@wave/core`, `react` |
| `@wave/native-bindings` | Tauri implementations (stub) | `@wave/core` |
| `@wave/extension` | Chrome Extension entry point (Vite + CRXJS) | All packages |

---

## 2. Data Flow Architecture

### 2.1. Regular Chat (cloud-stream)

```
User types message
  → InputBar → handleSend()
  → chrome.runtime.connect("cloud-stream")
  → Service Worker receives port message
  → Selects adapter: adapters[provider]
  → adapter.stream(request, apiKey, onChunk, signal)
  → Adapter fetches provider API (SSE)
  → Chunks parsed and forwarded via port.postMessage
  → Side Panel updates message content incrementally
  → MarkdownRenderer renders formatted output
```

### 2.2. Page-Aware Chat (agent-stream)

```
User types "What's on this page?"
  → isPageQuery() detects keywords
  → chrome.tabs.query({ active, lastFocusedWindow })
  → chrome.runtime.connect("agent-stream")
  → Service Worker pipeline:
      1. chrome.debugger.attach(tabId)
      2. Accessibility.getFullAXTree(depth: 4)
      3. DOM.getDocument → URL
      4. chrome.tabs.get → title
      5. chrome.debugger.detach
      6. serializeAXTree() → Markdown+refs
      7. ContextBuilder: system + page(url, title, tree) + history + query
      8. adapter.stream(contextMessages, apiKey, onChunk)
  → Streamed to Side Panel with status updates
```

### 2.3. Agent Action (planned, Sprint 8)

```
LLM response contains tool call: click(ref="e5")
  → Parse tool call from response
  → Resolve ref → backendNodeId from element map
  → chrome.debugger.attach(tabId)
  → DOM.getBoxModel(backendNodeId) → coordinates
  → Input.dispatchMouseEvent(mousePressed + mouseReleased)
  → chrome.debugger.detach
  → Wait for page mutation
  → Re-extract AX tree
  → Feed new tree + action result to LLM
  → Repeat until done()
```

---

## 3. Streaming Adapters

All three adapters implement the same interface:

```typescript
interface StreamAdapter {
  stream(
    request: StreamRequest,
    apiKey: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void>;
}
```

### Provider-Specific Details

| Provider | Auth Header | Stream Format | Key Quirk |
|----------|------------|--------------|-----------|
| OpenAI | `Authorization: Bearer KEY` | SSE `data: {json}` | Terminates with `data: [DONE]` |
| Anthropic | `x-api-key: KEY` | SSE events (`content_block_delta`) | Requires `x-anthropic-dangerous-direct-browser-access: true` |
| Gemini | URL param `?key=KEY` | SSE `data: {json}` | Uses `generativelanguage.googleapis.com`, not Vertex AI |

---

## 4. AX Tree Serialization

### Input → Output

```
Chrome AX Tree (JSON, ~50KB)
  ↓ serializeAXTree()
  ↓ Filter: interactive + structural roles only
  ↓ Depth limit: 4 levels
  ↓ Element limit: 100
Markdown+refs (~2KB, 93% reduction)
```

### Role Classification

| Category | Roles | Gets [ref=eN]? |
|----------|-------|---------------|
| Interactive | button, link, textbox, checkbox, radio, combobox, tab, menuitem, slider | ✅ Yes |
| Structural | heading, navigation, main, form, dialog, list, table | ❌ No (context only) |
| Filtered | generic, none, StaticText (short), hidden, ignored | ❌ Skipped entirely |

---

## 5. Context Builder

Priority-based token budget allocation:

```
Priority 0: System prompt        → ALWAYS included (even over budget)
Priority 1: User query           → ALWAYS included (even over budget)
Priority 2: Page context         → URL + title + AX tree (truncated to fit)
Priority 10+: History            → Newest first, oldest dropped
```

### Token Estimation Heuristics
- DOM/structured content: **3.2 chars/token**
- Natural prose: **4.0 chars/token**
- Agent mode budget: **8,192 tokens**

---

## 6. Security Architecture

```
┌─────────────────────────────────────────┐
│            API Key Lifecycle            │
│                                         │
│  User enters key in Settings UI         │
│    → chrome.storage.session.set()       │
│    → Ephemeral (wiped on browser close) │
│    → Shared via setAccessLevel()        │
│    → Used in adapter.stream() calls     │
│    → Never persisted to disk            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│            CDP Access Model             │
│                                         │
│  chrome.debugger.attach() shows banner  │
│    → Read AX tree (passive observation) │
│    → Dispatch input events (actions)    │
│    → Auto-detach after each operation   │
│    → Cannot access extension pages      │
└─────────────────────────────────────────┘
```

---

## 7. UI Component Architecture

```
SidePanel (layout shell)
├── Header
│   ├── Logo (◉ Wave)
│   ├── CostBadge (tokens · $cost)
│   ├── ModelBadge (gemini-2.5)
│   ├── NewChat button (+)
│   └── Settings button (⚙)
├── Content (scrollable)
│   ├── SettingsView (when settings open)
│   │   ├── ProviderGrid
│   │   ├── ModelSelect
│   │   └── ApiKeyInput
│   └── MessageList (when chatting)
│       ├── UserBubble
│       └── AssistantBubble
│           └── MarkdownRenderer
│               ├── CodeBlock + CopyButton
│               ├── Headings, Lists, Links
│               └── ComponentRegistry (tool calls)
│                   ├── DataTable
│                   ├── GenericCard
│                   └── FallbackComponent
└── InputBar (fixed bottom)
    ├── Auto-resize textarea
    └── Send button
```

### Design System
- **Colors:** Dark mode with `#0a0a0f` background, `#6c63ff` accent
- **Typography:** Inter sans-serif, JetBrains Mono monospace
- **Layout:** 360px minimum width, flexbox-based
- **Animation:** 150ms cubic-bezier transitions
- **CSS:** All vanilla, BEM naming, custom properties in `:root`

---

## 8. Build Pipeline

```
Source (TypeScript + TSX + CSS)
  → Vite 6.4 + @crxjs/vite-plugin
  → Tree-shaking + minification
  → Output: apps/extension/dist/

Build targets:
  background.ts → service-worker-loader.js + background.ts-*.js (14.9KB)
  sidepanel.tsx → sidepanel.html-*.js (212.6KB, 66.8KB gzip)
  *.css         → sidepanel-*.css (12.7KB, 2.8KB gzip)
```

---

## 9. Testing Strategy

| Layer | Framework | Tests | Coverage |
|-------|----------|-------|----------|
| AX Serializer | Vitest | 9 | Role filtering, depth limits, element caps, property display |
| Context Builder | Vitest | 6 | Message ordering, budget enforcement, URL injection |
| Cost Tracker | Vitest | 8 | Pricing accuracy, accumulation, budget limits, formatting |
| UI Components | (planned) | — | Visual regression, interaction testing |
| Integration | (planned) | — | End-to-end page extraction + streaming |

---

## 10. Deployment

### Chrome Extension
1. `pnpm --filter @wave/extension build`
2. Load `apps/extension/dist/` as unpacked extension
3. No Chrome Web Store distribution yet

### Future: Tauri Native
- Replace `@wave/ext-bindings` with `@wave/native-bindings`
- Same `@wave/core` and `@wave/ui-components`
- CEF for browser rendering, Tauri for window management