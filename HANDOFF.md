# Wave — Session Handoff Document

> **Last Updated:** 2026-05-13  
> **Commits:** 22 · **Tracked Files:** 168 · **Source LOC:** 10,759  
> **Tests:** 62 passing (6 suites) · **Status:** Sprint 25 complete — feature-complete MVP

---

## 1. Sprint History

| Sprint | Commit(s) | What Was Built |
|--------|----------|---------------|
| 1-6 | `a54b39e` | Core scaffold, streaming, generative UI, page agent, actions, cost |
| 7 | `beaec13` | README, 23 tests, tab-targeting fix, new chat, persistence |
| 8-9 | `e3e1db8` | Agent loop, tool call parser, provider router, markdown polish |
| 10 | `576ede5` | Multi-conversation (CRUD, drawer, search, auto-titling) |
| 11 | `4a6d7d4` | LLM titles, export/import, pinning, Tauri scaffold |
| 12-14 | `c8b6f2a` | Tauri desktop app, native CDP/IPC/storage, tray, shortcuts |
| 15 | `215e060` | Shared hooks — `useConversationManager` + `chat-utils` |
| 16 | `7591ff4` | Agent hardening — error recovery, confirmation UI, step viz |
| 17 | `2d55428`+`03fe4d0` | Embedded browser — WebviewWindow split-pane, NavBar |
| 18 | `d4f85f9` | CDP auto-attach — DOM extractor, webview actions |
| 19 | `7d97ede` | Extension v1.0 — icons, onboarding, shortcuts, error boundary |
| 20 | `497f6e4` | Local SLM router — WebGPU intent classification |
| 21 | `e902eb0` | Perf — code-split WebLLM (app-critical: ~90KB gzip) |
| 22-23 | `e677233` | Integration tests + screenshot/vision model fallback |
| 24-25 | `ad3ca85` | Multi-tab orchestration + CI/CD pipeline |

---

## 2. Current Architecture

```
wave/
├── .github/workflows/           # CI/CD (ci.yml, release-desktop.yml, release-extension.yml)
├── .husky/                      # Pre-commit hook
├── scripts/bump-version.sh      # Version bumping across all packages
│
├── apps/
│   ├── extension/               # Chrome Extension (MV3)
│   │   ├── manifest.json        # Icons, shortcuts (Cmd+Shift+W), permissions
│   │   ├── icons/               # 16/32/48/128px PNG
│   │   ├── src/background.ts    # Service worker (530 LOC) — tabs, CDP, streaming
│   │   └── src/sidepanel.tsx    # Side Panel (450 LOC) — onboarding, error boundary
│   │
│   └── desktop/                 # Tauri v2 Desktop
│       ├── src/App.tsx          # Split-pane + tabs (550 LOC)
│       ├── src-tauri/src/lib.rs # Rust: tray, shortcuts, browser commands (120 LOC)
│       ├── tests/               # Integration tests (5 files)
│       └── test-fixtures/       # test-page.html
│
├── packages/
│   ├── core/                    # Platform-agnostic (3,200+ LOC)
│   │   ├── src/abstractions/    # cdp, ipc, storage, ui, inference
│   │   ├── src/domain/
│   │   │   ├── adapters/        # openai, anthropic, gemini (multimodal-aware)
│   │   │   ├── agent-loop.ts    # Multi-step engine + vision fallback (256 LOC)
│   │   │   ├── agent-tools.ts   # Tool defs (open/switch/close/list_tabs)
│   │   │   ├── tool-call-parser.ts
│   │   │   ├── ax-serializer.ts # AX tree → Markdown+refs
│   │   │   ├── context-builder.ts # Token budget + screenshot support
│   │   │   ├── conversation-storage.ts
│   │   │   ├── cost-tracker.ts
│   │   │   ├── provider-router.ts
│   │   │   ├── local-router.ts  # WebLLM (lazy import)
│   │   │   ├── tab-manager.ts   # Multi-tab orchestration (58 LOC)
│   │   │   └── stream-provider.ts
│   │   ├── src/hooks/           # useConversationManager, chat-utils
│   │   └── tests/               # 62 tests (6 suites)
│   │
│   ├── ext-bindings/            # Chrome Extension (450+ LOC)
│   │   └── src/tabs.ts          # ExtTabController via chrome.tabs
│   │
│   ├── native-bindings/         # Tauri (620+ LOC)
│   │   ├── src/cdp.ts           # WebSocket CDP + webview extraction
│   │   ├── src/dom-extractor.ts # JS injection for webview DOM
│   │   └── src/tabs.ts          # NativeTabController
│   │
│   └── ui-components/           # Shared React (2,500+ LOC)
│       ├── chat/                # InputBar, MessageList, Markdown, ActionConfirmation, AgentStep
│       ├── generative/          # DataTable, GenericCard, Registry
│       └── layout/              # SidePanel, Settings, CostBadge, ConversationDrawer
│                                # NavBar, TabBar, Onboarding, ErrorBoundary, ModelLoader
```

---

## 3. Build Sizes (Post-Sprint 21 Code-Split)

| Target | Main Chunks | Lazy (WebLLM) | Total |
|--------|-------------|---------------|-------|
| Extension | 84KB gzip (sidepanel+core+react) | 2.1MB (on-demand) | 2.2MB installed |
| Desktop | 85KB gzip (index+core+react) | 2.2MB (on-demand) | 2.3MB installed |

---

## 4. How to Run

```bash
cd ~/Desktop/code/wave && pnpm install

# Extension
pnpm --filter @wave/extension build     # Build → load dist/ in chrome://extensions

# Desktop
cd apps/desktop && pnpm tauri dev       # Split-pane browser + chat

# Tests
cd packages/core && npx vitest run      # 62 core tests
cd apps/desktop && npx vitest run       # Integration tests

# CI (all checks)
pnpm verify                             # typecheck + test + build

# Release
./scripts/bump-version.sh 1.0.0         # Bump all versions + create tag
git push origin main --tags             # Trigger release workflows
```

---

## 5. Active Bugs & Known Issues

### 🟡 Medium
- **Extension icons** same 326KB file at all sizes — need proper resize
- **Desktop integration tests** depend on JSDOM mocks — not true webview tests
- **CI bundle size check** uses wrong glob (`lib-*.js` vs `index-*.js`)
- **Vision fallback untested** — multimodal adapter formatting not verified end-to-end

### 🟢 Low
- **Gemini hallucination** on complex pages (model limitation)
- **No syntax highlighting** in code blocks
- **Tab manager max 10** tabs not enforced
- **Husky pre-commit** may need `npx husky` init on fresh clone

---

## 6. Conventions

- **Shared logic** → `packages/core/src/hooks/` or `packages/core/src/domain/`
- **Platform-specific** → `ext-bindings/` or `native-bindings/`
- **CSS** → Vanilla CSS, BEM naming, design tokens in `:root`
- **API keys** → Ephemeral only (session/memory). NEVER on disk.
- **Imports** → `.js` extensions (ESM). Dynamic `import()` for heavy deps.
- **Agent** → Confirmation UI before actions. Vision fallback for sparse AX trees.
- **Tabs** → `TabManager` wraps platform `TabController`. Max 10 enforced (planned).
- **CI** → GitHub Actions on push/PR. Release on tag push.
