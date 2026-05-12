# SAD: Wave — Software Architecture Document

> **Version:** 0.3 (Updated 2026-05-12)  
> **Status:** Implemented through Sprint 14 — dual-platform (Extension + Tauri)

---

## 1. High-Level Architecture

Wave is a **platform-agnostic monorepo** with pluggable bindings for Chrome Extension and Tauri Desktop.

```
┌──────────────────────────────────────────────────────────────┐
│                      apps/desktop (Tauri v2)                  │
│  ┌───────────────────────────────────────────────────┐       │
│  │ App.tsx (449 LOC) — React app with native bindings │       │
│  │   - NativeIPCProvider                             │       │
│  │   - NativeStorageProvider (tauri-plugin-store)    │       │
│  │   - NativeBrowserController (CDP via WebSocket)   │       │
│  └───────────────────┬───────────────────────────────┘       │
│                      │                                        │
│  Rust Backend (lib.rs):                                       │
│    - tauri-plugin-store                                       │
│    - tauri-plugin-global-shortcut (Cmd+Shift+Space)          │
│    - TrayIconBuilder (system tray)                            │
└──────────────────────┼───────────────────────────────────────┘
                       │ imports @wave/* packages
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                     packages/ (shared)                        │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐│
│  │ @wave/core   │  │ ext-bindings  │  │ ui-components      ││
│  │ (2,100 LOC)  │  │ (381 LOC)     │  │ (1,200+ LOC)       ││
│  │              │  │               │  │                     ││
│  │ • Adapters   │  │ • cdp.ts      │  │ • InputBar          ││
│  │ • AgentLoop  │  │ • crypto.ts   │  │ • MessageList       ││
│  │ • AXSerializer│ │ • ipc.ts      │  │ • MarkdownRenderer  ││
│  │ • ContextBld │  │ • storage.ts  │  │ • ConversationDrawer││
│  │ • CostTracker│  │               │  │ • SidePanel         ││
│  │ • ProvRouter │  ├───────────────┤  │ • SettingsView      ││
│  │ • ConvStorage│  │native-bindings│  │ • CostBadge         ││
│  │ • ToolParser │  │ (228 LOC)     │  │ • Generative UI     ││
│  │              │  │ • cdp.ts      │  └────────────────────┘│
│  │  5 test suites│ │ • ipc.ts      │                        │
│  │  54 tests     │ │ • storage.ts  │                        │
│  └──────────────┘  └───────────────┘                        │
└──────────────────────▲───────────────────────────────────────┘
                       │ imports @wave/* packages
                       │
┌──────────────────────┼───────────────────────────────────────┐
│                  apps/extension (Chrome MV3)                   │
│  ┌───────────────────────────────────────────────────┐       │
│  │ background.ts (450 LOC) — Service Worker          │       │
│  │   - Message router (ping, keys)                   │       │
│  │   - Stream router (cloud-stream, agent-stream)    │       │
│  │   - CDP orchestrator (attach, extract, action)    │       │
│  │   - ProviderRouter integration                    │       │
│  ├───────────────────────────────────────────────────┤       │
│  │ sidepanel.tsx (520 LOC) — React Side Panel        │       │
│  │   - ExtIPCProvider, ExtStorageProvider             │       │
│  │   - Conversation management                       │       │
│  │   - Dual-mode routing (chat vs agent)             │       │
│  └───────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow

### 2.1. Regular Chat

```
User types message → InputBar.onSend()
  → Select adapter via PROVIDER_CATALOG[provider]
  → ProviderRouter.stream() with failover
  → Adapter parses SSE from provider API
  → Chunks forwarded to UI → MarkdownRenderer
  → Message persisted to ConversationStorage
```

### 2.2. Agent Loop (Page-Aware)

```
User types "Click the login button"
  → isPageQuery() detects keywords
  → runAgentLoop() starts:
     Step 0:
       → OBSERVE: Extract AX tree via CDP
       → BUILD CONTEXT: system + page(url, title, tree) + history + query
       → THINK: Stream LLM response, accumulate full text
       → PARSE: parseToolCall(text) → {action: "click", params: {ref: "e5"}}
       → ACT: Execute click(e5) via CDP dispatchMouseEvent
       → Wait 500ms for page to settle
     Step 1:
       → OBSERVE: Re-extract AX tree (page has changed)
       → BUILD CONTEXT: system + new page + action history + query
       → THINK: LLM sees result, decides next action or done()
       → PARSE: {action: "done", params: {summary: "Clicked login"}}
       → DONE: Loop terminates
```

### 2.3. Platform Dispatch

```
Extension:                          Desktop:
  sidepanel.tsx                      App.tsx
    → chrome.runtime.connect()        → Direct adapter.stream()
    → Port-based streaming             → No ports needed
    → background.ts orchestrates       → App.tsx orchestrates
    → ExtStorageProvider               → NativeStorageProvider
    → chrome.debugger CDP              → WebSocket CDP
```

---

## 3. Module Index

### Core Domain (`packages/core/src/domain/`)

| Module | LOC | Purpose |
|--------|-----|---------|
| `adapters/openai.ts` | 114 | OpenAI SSE streaming adapter |
| `adapters/anthropic.ts` | 153 | Anthropic event stream adapter |
| `adapters/gemini.ts` | 142 | Gemini REST SSE adapter |
| `agent-loop.ts` | 188 | Multi-step observe-think-act state machine |
| `agent-tools.ts` | 110 | Tool definitions + agent system prompt |
| `ax-serializer.ts` | 197 | AX tree → Markdown+refs serialization |
| `context-builder.ts` | 133 | Priority-based token budget allocation |
| `conversation-storage.ts` | 249 | Conversation CRUD with search + export |
| `cost-tracker.ts` | 113 | Per-model pricing + session budget |
| `provider-router.ts` | 133 | Auto-failover chain with retry |
| `stream-provider.ts` | 30 | StreamAdapter interface |
| `tool-call-parser.ts` | 108 | JSON block + inline ACTION: parser |

### Test Suites (`packages/core/tests/`)

| Suite | Tests | Coverage |
|-------|-------|----------|
| `ax-serializer.test.ts` | 9 | Role filtering, depth, elements, properties |
| `context-builder.test.ts` | 6 | Ordering, budget, history, URL injection |
| `cost-tracker.test.ts` | 8 | Pricing, accumulation, budget, formatting |
| `tool-call-parser.test.ts` | 15 | JSON blocks, inline, edge cases, terminal |
| `conversation-storage.test.ts` | 16 | CRUD, search, pin, export/import |
| **Total** | **54** | |

---

## 4. Security Model

```
Extension:                              Desktop:
┌────────────────────────────┐   ┌────────────────────────────┐
│ chrome.storage.session     │   │ In-memory Map              │
│ (ephemeral, browser close) │   │ (ephemeral, app close)     │
│                            │   │                            │
│ setAccessLevel for         │   │ No special setup needed    │
│ Side Panel access          │   │                            │
└────────────────────────────┘   └────────────────────────────┘

API keys: NEVER persisted to disk on either platform.
CDP: Extension shows chrome.debugger banner. Desktop uses localhost:9222.
CSP: Desktop restricts connect-src to provider domains + ws://localhost:9222.
```

---

## 5. Build Pipeline

### Extension
```bash
pnpm --filter @wave/extension build
# Output: apps/extension/dist/ (load unpacked in Chrome)
# 64 modules, 717ms build
# CSS: 20.2KB | SW: 19.6KB | App: 227KB (70KB gzip)
```

### Desktop
```bash
cd apps/desktop && pnpm tauri dev    # Development
cd apps/desktop && pnpm tauri build  # Production
# Rust compile: ~48s first build, incremental thereafter
# Frontend served via Vite dev server on localhost:5173
```

---

## 6. Platform Parity Matrix

| Capability | Extension | Desktop |
|-----------|-----------|---------|
| Chat streaming | ✅ Port-based | ✅ Direct adapter |
| Page awareness | ✅ chrome.debugger | ⚠️ WebSocket CDP (needs external Chrome) |
| Agent loop | ✅ | ✅ |
| Conversation CRUD | ✅ chrome.storage | ✅ tauri-plugin-store |
| Settings | ✅ | ✅ |
| System tray | ❌ | ✅ |
| Global shortcut | ❌ | ✅ Cmd+Shift+Space |
| Embedded browser | N/A (runs in Chrome) | 🔲 Needs WebviewWindow |