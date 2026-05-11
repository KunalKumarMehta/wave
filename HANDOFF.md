# Wave — Session Handoff Document

> **Session Date:** 2026-05-10/11  
> **Commits:** `a54b39e` → current (Sprint 1–9)  
> **Status:** Agent loop functional — multi-step browser actions + auto-failover + rich markdown

---

## 1. What Was Built This Session

### Sprint 1 — Core Scaffold
- pnpm monorepo with 4 packages + 1 app
- Platform abstractions (IPC, Storage, CDP, UI, Inference)
- Zustand stores (conversation, settings)
- AES-256-GCM encryption for API keys
- MV3 extension scaffold (CRXJS + Vite)

### Sprint 2 — Streaming Pipeline
- Unified `StreamAdapter` interface
- 3 provider adapters: **OpenAI** (SSE), **Anthropic** (event stream), **Gemini** (alt=sse)
- Port-based streaming: Service Worker → Side Panel via `chrome.runtime.connect`
- Settings UI with provider grid + API key management

### Sprint 3 — Generative UI
- Custom Markdown renderer (zero dependencies, 181 LOC)
- Code blocks with syntax labels + copy button
- Component registry: `DataTable`, `GenericCard`, `FallbackComponent`
- Tool-call dispatch system for LLM outputs

### Sprint 4 — Page Agent (AX Tree)
- Chrome debugger CDP wrapper (`chrome.debugger.attach/sendCommand/detach`)
- AX tree serializer: full tree → Markdown+refs (~93% token reduction)
- Context builder: priority-based token budget allocation
- Agent system prompt with anti-hallucination rules

### Sprint 5 — Agent Actions
- CDP action dispatcher: `click`, `type`, `scroll`, `navigate`
- Box model resolution for coordinate-based clicking
- DOM.focus + Input.insertText for text entry

### Sprint 6 — Provider Router + Cost Tracking
- Multi-provider failover with retry + linear backoff on 429
- Per-model pricing matrix (OpenAI/Anthropic/Gemini, 12 models)
- CostBadge UI component in header
- Session budget enforcement

### Sprint 7 — Polish
- README.md with architecture + quick start
- 23 unit tests (AX serializer 9, context builder 6, cost tracker 8)
- Tab-targeting fix (`lastFocusedWindow` + HTTP URL filter)
- New Chat button (clears messages + resets cost)
- Message persistence via `chrome.storage.local`

### Sprint 8 — Agent Loop + Provider Router
- **Multi-step agent loop**: OBSERVE → THINK → ACT → repeat until `done()` or max 5 steps
- **Tool call parser**: JSON block + inline `ACTION:` fallback (109 LOC, 15 tests)
- **Agent loop engine**: state machine with page re-extraction between steps (170 LOC)
- **ProviderRouter wired**: auto-failover on 429/5xx, dynamic route building from stored keys
- **Anthropic usage fix**: `promptTokens` now captured from `message_start` event
- **Agent system prompt**: updated for structured JSON action blocks

### Sprint 9 — UX Polish + Markdown
- **Markdown tables**: full `| col | col |` parsing with column alignment
- **Ordered lists**: `1. item` → `<ol>` with accent-colored counters
- **Blockquotes**: `> text` → accent-bordered quote blocks
- **Horizontal rules**: `---` → gradient accent line separator
- **Agent action UI**: `⚡ Executing: click...` status during multi-step loops

---

## 2. Current File Structure

```
wave/                              # Root
├── package.json                   # pnpm workspace root
├── pnpm-workspace.yaml            # Workspace config
├── tsconfig.base.json             # Shared TS config
├── README.md                      # Project docs
├── HANDOFF.md                     # ← You are here
├── LEARNINGS.md                   # Technical learnings
├── AGENTS.md                      # Agent architecture
│
├── Knowledge Base/                # Pre-existing research (not code)
│   ├── wave 1-4/                  # Earlier research phases
│   └── wave 5/                    # Current phase research
│
├── apps/
│   └── extension/                 # Chrome Extension (MV3)
│       ├── manifest.json          # Permissions, service worker, side panel
│       ├── sidepanel.html         # Entry HTML
│       ├── src/
│       │   ├── background.ts      # Service worker (354 LOC) — router, CDP, streams
│       │   └── sidepanel.tsx      # Side Panel UI (350 LOC) — React app
│       ├── vite.config.ts         # CRXJS + React
│       └── dist/                  # Build output (load this in Chrome)
│
├── packages/
│   ├── core/                      # Platform-agnostic domain logic
│   │   ├── src/
│   │   │   ├── abstractions/      # Interfaces: cdp, ipc, storage, ui, inference
│   │   │   ├── domain/
│   │   │   │   ├── adapters/      # openai.ts, anthropic.ts, gemini.ts
│   │   │   │   ├── agent-tools.ts # Tool defs + system prompt
│   │   │   │   ├── agent-loop.ts  # Multi-step agent engine (170 LOC)
│   │   │   │   ├── tool-call-parser.ts # JSON/inline action parser (109 LOC)
│   │   │   │   ├── ax-serializer.ts # AX tree → Markdown+refs (197 LOC)
│   │   │   │   ├── context-builder.ts # Token budget allocation (133 LOC)
│   │   │   │   ├── cost-tracker.ts # Per-model pricing (112 LOC)
│   │   │   │   ├── provider-router.ts # Failover chain (133 LOC)
│   │   │   │   └── stream-provider.ts # StreamAdapter interface
│   │   │   ├── state/             # conversation.ts, settings.ts (Zustand)
│   │   │   └── types/             # message.ts, stream.ts
│   │   └── tests/                 # 38 vitest tests
│   │
│   ├── ext-bindings/              # Chrome Extension implementations
│   │   └── src/
│   │       ├── cdp.ts             # chrome.debugger wrapper
│   │       ├── crypto.ts          # AES-256-GCM
│   │       ├── ipc.ts             # chrome.runtime messaging
│   │       └── storage.ts         # chrome.storage.local/session
│   │
│   ├── ui-components/             # Shared React components
│   │   └── src/
│   │       ├── chat/              # InputBar, MessageList, MarkdownRenderer
│   │       ├── generative/        # DataTable, GenericCard, ComponentRegistry
│   │       ├── layout/            # SidePanel, SettingsView, CostBadge
│   │       └── context/           # PlatformContext (React context)
│   │
│   └── native-bindings/           # Tauri bindings (stub only)
```

---

## 3. How to Resume Development

```bash
# Enter the project
cd ~/Desktop/code/wave

# Install (if needed)
pnpm install

# Build the extension
pnpm --filter @wave/extension build

# Run tests
pnpm test  # or: cd packages/core && npx vitest run

# Load in Chrome
# 1. chrome://extensions → Developer mode
# 2. Load unpacked → select apps/extension/dist/
# 3. Click Wave icon → Side Panel opens
# 4. Settings (⚙) → Set API key → Chat
```

---

## 4. Key Dependencies & Versions

| Package | Version | Purpose |
|---------|---------|---------|
| React | 19.2.x | UI framework |
| Vite | 6.4.x | Build tool |
| @crxjs/vite-plugin | 2.0.0-beta.32 | Chrome extension HMR |
| Zustand | 5.0.x | State management |
| Zod | 3.24.x | Schema validation |
| Vitest | 3.2.x | Testing |
| TypeScript | 5.8.x | Type system |
| pnpm | 9.x | Package manager |

---

## 5. Active Bugs & Known Issues

### 🔴 Critical
- None currently.

### 🟡 Medium
- **AX Tree tab-targeting**: Fix applied (`lastFocusedWindow` + HTTP filter) but not yet verified by user in production.
- **Gemini hallucination on complex pages**: Even with URL injection, Gemini 2.5 Flash may hallucinate content not in the AX tree. Use Gemini Pro or Claude Sonnet for complex pages.

### 🟢 Low
- **No multi-conversation support**: All messages in single flat array in `chrome.storage.local`. `conversationStore` Zustand exists but unused.
- **Markdown renderer gaps**: No nested lists, no task lists (`- [ ]`), no syntax highlighting.
- **Agent loop max steps**: Hard cap at 5 — may need tuning for complex multi-step tasks.

---

## 6. What to Build Next (Priority Order)

### ~~A. Close the Agent Loop~~ ✅ Sprint 8
### ~~B. Wire Usage Metadata~~ ✅ Sprint 8
### ~~C. Wire ProviderRouter~~ ✅ Sprint 8
### ~~D. Markdown Tables/Blockquotes~~ ✅ Sprint 9

### E. Multi-Conversation Support (Sprint 10)
- Adopt `conversationStore` in sidepanel.tsx
- Conversation list drawer/sidebar
- IndexedDB via Dexie.js for structured storage
- Conversation search + auto-titling

### F. Tauri Migration Prep (Sprint 11+)
- The `native-bindings` package is a stub
- Would implement IPC via Tauri commands, storage via Tauri's fs/store
- CEF integration for full browser control (vs. extension CDP)

---

## 7. Important Patterns & Conventions

- **Adapter pattern**: All provider logic encapsulated in `StreamAdapter` implementations
- **Port-based streaming**: Service Worker ↔ Side Panel via `chrome.runtime.connect` (not `sendMessage`)
- **CSS naming**: BEM-style with `side-panel__` prefix, CSS custom properties for all tokens
- **File naming**: kebab-case for files, PascalCase for components
- **No external CSS frameworks**: All vanilla CSS with design tokens in `:root`
- **Zero-dependency markdown**: Custom parser, not marked.js or similar
- **Session storage for API keys**: Keys live in `chrome.storage.session` (ephemeral, wiped on browser close)
