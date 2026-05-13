# Wave — Session Handoff Document

> **Last Updated:** 2026-05-13  
> **Commits:** 11 (`a54b39e` → `215e060`)  
> **Status:** Sprint 15 complete — shared hooks refactor, both platforms clean  
> **LOC:** 7,526 source · 132 tracked files · 54 tests (100% passing)

---

## 1. Sprint History

| Sprint | Commit | What Was Built |
|--------|--------|---------------|
| 1-6 | `a54b39e` | Core scaffold, streaming pipeline, generative UI, page agent, agent actions, cost tracking |
| 7 | `beaec13` | README, 23 tests, tab-targeting fix, new chat, message persistence |
| 8-9 | `e3e1db8` | Agent loop engine, tool call parser, provider router wired, markdown polish |
| 10 | `576ede5` | Multi-conversation support (CRUD, drawer, search, auto-titling) |
| 11 | `4a6d7d4` | LLM titles, export/import, pinning, Tauri scaffold, native bindings |
| 12-14 | `c8b6f2a` | Tauri desktop app, native CDP/IPC/storage, system tray, global shortcuts |
| 15 | `215e060` | Shared hooks refactor — `useConversationManager` + `chat-utils` |

---

## 2. Current File Structure

```
wave/
├── package.json, pnpm-workspace.yaml, tsconfig.base.json
├── README.md, HANDOFF.md, LEARNINGS.md, AGENTS.md, CHANGELOG.md
├── KB_INDEX.md, .context.md
├── Product Requirements Document.md (v0.3)
├── Software Architecture Document.md (v0.3)
│
├── apps/
│   ├── extension/                 # Chrome Extension (MV3)
│   │   ├── manifest.json
│   │   ├── src/background.ts      # Service worker (450 LOC)
│   │   ├── src/sidepanel.tsx      # Side Panel UI (356 LOC) ← uses shared hook
│   │   └── dist/                  # Build output
│   │
│   └── desktop/                   # Tauri v2 Desktop App
│       ├── src/App.tsx            # Desktop UI (314 LOC) ← uses shared hook
│       ├── src-tauri/src/lib.rs   # Rust backend (69 LOC)
│       └── src-tauri/tauri.conf.json
│
├── packages/
│   ├── core/                      # Platform-agnostic domain logic (2,100+ LOC)
│   │   ├── src/abstractions/      # Interfaces: cdp, ipc, storage, ui, inference
│   │   ├── src/domain/
│   │   │   ├── adapters/          # openai.ts, anthropic.ts, gemini.ts
│   │   │   ├── agent-loop.ts      # Multi-step observe-think-act (188 LOC)
│   │   │   ├── agent-tools.ts     # Tool defs + agent system prompt
│   │   │   ├── tool-call-parser.ts # JSON/inline action parser (108 LOC)
│   │   │   ├── ax-serializer.ts   # AX tree → Markdown+refs (197 LOC)
│   │   │   ├── context-builder.ts # Token budget allocation (133 LOC)
│   │   │   ├── conversation-storage.ts # Conversation CRUD (250 LOC)
│   │   │   ├── cost-tracker.ts    # Per-model pricing (113 LOC)
│   │   │   ├── provider-router.ts # Failover chain (133 LOC)
│   │   │   └── stream-provider.ts # StreamAdapter interface
│   │   ├── src/hooks/             # ← NEW in Sprint 15
│   │   │   ├── useConversationManager.ts  # Shared conversation lifecycle (239 LOC)
│   │   │   └── chat-utils.ts      # generateId, isPageQuery, prompts (28 LOC)
│   │   ├── src/state/             # Zustand stores
│   │   ├── src/types/             # message.ts, stream.ts
│   │   └── tests/                 # 54 vitest tests (5 suites)
│   │
│   ├── ext-bindings/              # Chrome Extension implementations (381 LOC)
│   ├── native-bindings/           # Tauri implementations (228 LOC)
│   └── ui-components/             # Shared React components (1,200+ LOC)
│       ├── chat/                  # InputBar, MessageList, MarkdownRenderer
│       ├── generative/            # DataTable, GenericCard, ComponentRegistry
│       └── layout/                # SidePanel, SettingsView, CostBadge, ConversationDrawer
```

---

## 3. How to Run

```bash
cd ~/Desktop/code/wave
pnpm install

# Extension
pnpm --filter @wave/extension build     # Build → load dist/ in chrome://extensions
pnpm --filter @wave/extension dev       # Dev mode with watch

# Desktop
cd apps/desktop && pnpm tauri dev       # Tauri dev mode

# Tests
cd packages/core && npx vitest run      # 54 tests
```

---

## 4. Active Bugs & Known Issues

### 🟡 Medium
- **Desktop CDP depends on external Chrome**: Must launch Chrome with `--remote-debugging-port=9222`. No embedded browser yet.
- **Extension AX tree tab-targeting**: Fix applied (`lastFocusedWindow` + HTTP filter) but edge cases possible.
- **Gemini 2.5 Flash hallucination**: May hallucinate page content not in AX tree. Use Gemini Pro or Claude for complex pages.

### 🟢 Low
- **Agent loop max 5 steps**: Hard cap may be too low for complex multi-step tasks.
- **No action confirmation UI**: Agent executes actions without user approval.
- **Markdown gaps**: No nested lists, no task lists, no syntax highlighting in code blocks.
- **Cost tracking UI wiring**: Adapters don't consistently send usage metadata in `done` chunks.

---

## 5. What to Build Next (Sprint 16–20)

| Sprint | Priority | Focus | Key Deliverable |
|--------|----------|-------|----------------|
| **16** | High | Agent loop hardening | Error recovery, action confirmation UI, step visualization |
| **17** | High | Tauri WebviewWindow | Embedded browser pane in split layout |
| **18** | High | CDP auto-attach | Webview ↔ agent without `--remote-debugging-port` |
| **19** | Medium | Extension v1.0 polish | Chrome Web Store prep, icon, onboarding |
| **20** | Medium | Local SLM router | WebGPU inference for intent classification |

See `SPRINT_PROMPTS.md` for detailed agent prompts for each sprint.

---

## 6. Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| React | 19.x | UI framework |
| Vite | 6.4 (ext) / 8.0 (desktop) | Build tool |
| @crxjs/vite-plugin | 2.0.0-beta.32 | Chrome extension HMR |
| Tauri | 2.11.1 | Native desktop shell |
| Zustand | 5.0.x | State management |
| Vitest | 3.2.x | Testing |
| TypeScript | 5.8.x | Types |
| pnpm | 10.x | Package manager |

---

## 7. Conventions

- **Shared logic** → `packages/core/src/hooks/` (React hooks) or `packages/core/src/domain/` (plain TS)
- **Platform-specific** → `ext-bindings/` (Chrome) or `native-bindings/` (Tauri)
- **CSS** → Vanilla CSS, BEM naming, design tokens in `:root`
- **Streaming** → Extension: `chrome.runtime.connect` ports; Desktop: direct `adapter.stream()`
- **State** → Never store in service worker variables (use `chrome.storage`)
- **API keys** → `chrome.storage.session` (extension) or in-memory Map (desktop). NEVER persisted.
- **Imports** → Use `.js` extensions in import paths (ESM)
