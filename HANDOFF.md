# Wave — Session Handoff Document

> **Last Updated:** 2026-05-13  
> **Commits:** 17 (`a54b39e` → `497f6e4`)  
> **Status:** Sprint 20 complete — full feature MVP across both platforms  
> **LOC:** 9,383 source · 62 tests (100% passing)

---

## 1. Sprint History

| Sprint | Commit(s) | What Was Built |
|--------|----------|---------------|
| 1-6 | `a54b39e` | Core scaffold, streaming, generative UI, page agent, actions, cost |
| 7 | `beaec13` | README, 23 tests, tab-targeting fix, new chat, persistence |
| 8-9 | `e3e1db8` | Agent loop engine, tool call parser, router wired, markdown polish |
| 10 | `576ede5` | Multi-conversation (CRUD, drawer, search, auto-titling) |
| 11 | `4a6d7d4` | LLM titles, export/import, pinning, Tauri scaffold, native bindings |
| 12-14 | `c8b6f2a` | Tauri app, native CDP/IPC/storage, system tray, global shortcuts |
| 15 | `215e060` | Shared hooks refactor — `useConversationManager` + `chat-utils` |
| 16 | `7591ff4` | Agent loop hardening — error recovery, confirmation UI, step viz |
| 17 | `2d55428`+`03fe4d0` | Embedded browser — WebviewWindow split-pane, NavBar, resize |
| 18 | `d4f85f9` | CDP auto-attach — DOM extractor, webview actions, fallback CDP |
| 19 | `7d97ede` | Extension v1.0 — icons, onboarding, shortcuts, error boundary |
| 20 | `497f6e4` | Local SLM router — WebGPU intent classification, local titling |

---

## 2. Current File Structure

```
wave/
├── package.json, pnpm-workspace.yaml, tsconfig.base.json
├── README.md, HANDOFF.md, LEARNINGS.md, AGENTS.md
├── CHANGELOG.md, SPRINT_PROMPTS.md, .context.md
├── Product Requirements Document.md (v0.5)
├── Software Architecture Document.md (v0.4)
│
├── apps/
│   ├── extension/                 # Chrome Extension (MV3)
│   │   ├── manifest.json         # With icons + keyboard shortcuts
│   │   ├── icons/                # 16/32/48/128px PNG
│   │   ├── src/background.ts     # Service worker (490 LOC)
│   │   └── src/sidepanel.tsx     # Side Panel UI (400 LOC)
│   │
│   └── desktop/                   # Tauri v2 Desktop App
│       ├── src/App.tsx           # Split-pane app (470 LOC)
│       ├── src/App.css           # Split-pane + browser styles
│       ├── src-tauri/src/lib.rs  # Rust backend (120 LOC)
│       └── src-tauri/tauri.conf.json
│
├── packages/
│   ├── core/                      # Platform-agnostic (2,800+ LOC)
│   │   ├── src/abstractions/      # cdp, ipc, storage, ui, inference
│   │   ├── src/domain/
│   │   │   ├── adapters/          # openai, anthropic, gemini
│   │   │   ├── agent-loop.ts      # Multi-step engine (220 LOC)
│   │   │   ├── agent-tools.ts     # Tool defs + system prompt
│   │   │   ├── tool-call-parser.ts# Action parser (108 LOC)
│   │   │   ├── ax-serializer.ts   # AX tree → Markdown (197 LOC)
│   │   │   ├── context-builder.ts # Token budget (133 LOC)
│   │   │   ├── conversation-storage.ts # CRUD (250 LOC)
│   │   │   ├── cost-tracker.ts    # Pricing (113 LOC)
│   │   │   ├── provider-router.ts # Failover (133 LOC)
│   │   │   ├── local-router.ts    # WebLLM intent classification (93 LOC)
│   │   │   └── stream-provider.ts
│   │   ├── src/hooks/             # useConversationManager, chat-utils
│   │   ├── src/state/             # Zustand stores
│   │   ├── src/types/             # message, stream
│   │   └── tests/                 # 62 tests (6 suites)
│   │
│   ├── ext-bindings/              # Chrome Extension (381 LOC)
│   ├── native-bindings/           # Tauri (540 LOC)
│   │   ├── src/cdp.ts            # NativeBrowserController (198 LOC)
│   │   ├── src/dom-extractor.ts  # Webview DOM injection (142 LOC)
│   │   └── src/ipc.ts, storage.ts
│   │
│   └── ui-components/             # Shared React (2,000+ LOC)
│       ├── chat/                  # InputBar, MessageList, MarkdownRenderer
│       │                          # ActionConfirmation, AgentStepIndicator
│       ├── generative/            # DataTable, GenericCard, Registry
│       └── layout/                # SidePanel, Settings, CostBadge
│                                  # ConversationDrawer, NavBar
│                                  # OnboardingView, ErrorBoundary, ModelLoader
```

---

## 3. How to Run

```bash
cd ~/Desktop/code/wave && pnpm install

# Extension
pnpm --filter @wave/extension build     # Build → load dist/ in chrome://extensions

# Desktop
cd apps/desktop && pnpm tauri dev       # Tauri dev (split-pane browser + chat)

# Tests
cd packages/core && npx vitest run      # 62 tests
```

---

## 4. Active Bugs & Known Issues

### 🔴 Critical
- **Bundle size: 6.2MB** — WebLLM (`@mlc-ai/web-llm`) not code-split. Must use dynamic `import()`.

### 🟡 Medium
- **Extension icons same size**: All 4 icon files are identical 326KB (not properly resized).
- **Duplicate CSS import**: `App.tsx` imports `./App.css` twice (line 2 + 24).
- **Indentation bug**: `App.tsx` L274-297 title generation has mismatched indent.
- **`offscreen` permission**: Added to manifest but never used.
- **Embedded browser untested end-to-end**: `WebviewWindowBuilder` + DOM extraction pipeline needs real browser testing.

### 🟢 Low
- **Gemini hallucination**: Model limitation on complex pages.
- **Agent loop max 5 steps**: May be too low for complex tasks.
- **No syntax highlighting in code blocks**: Plain monospace only.

---

## 5. What to Build Next (Sprint 21–25)

| Sprint | Priority | Focus | Key Deliverable |
|--------|----------|-------|----------------|
| **21** | Critical | Performance — code-split WebLLM + fix bundle bloat | Extension back under 250KB |
| **22** | High | Desktop integration testing | End-to-end browser + agent test |
| **23** | High | Screenshot + Vision model | Fallback for canvas/complex pages |
| **24** | Medium | Tab management + cross-tab workflows | Multi-tab orchestration |
| **25** | Medium | CI/CD pipeline | Automated Extension + Desktop builds |

See `SPRINT_PROMPTS.md` for detailed prompts.

---

## 6. Conventions

- **Shared logic** → `packages/core/src/hooks/` or `packages/core/src/domain/`
- **Platform-specific** → `ext-bindings/` or `native-bindings/`
- **CSS** → Vanilla CSS, BEM naming, design tokens in `:root`
- **Streaming** → Extension: chrome.runtime.connect; Desktop: direct adapter.stream()
- **API keys** → Ephemeral only (session/memory). NEVER on disk.
- **Imports** → `.js` extensions (ESM)
- **Intent routing** → LocalRouter (WebLLM) with keyword fallback
- **Agent actions** → Confirmation UI before execution (desktop)
- **Browser pane** → Tauri WebviewWindow with `eval_browser` IPC
