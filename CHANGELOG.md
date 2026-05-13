# Changelog

All notable changes to Wave are documented here.

## [0.1.0] — 2026-05-11

### Added

#### Core Infrastructure
- pnpm monorepo with 4 packages (`core`, `ext-bindings`, `ui-components`, `native-bindings`)
- Platform abstraction interfaces: `IPC`, `Storage`, `BrowserController`, `UIProvider`, `InferenceEngine`
- TypeScript strict mode with shared `tsconfig.base.json`
- Vitest testing framework with 23 passing tests

#### Streaming Pipeline
- `StreamAdapter` interface with unified `stream()` method
- OpenAI adapter (SSE parser, `data: [DONE]` termination)
- Anthropic adapter (event-based parser, `x-anthropic-dangerous-direct-browser-access`)
- Gemini adapter (Generative Language REST API, `alt=sse`)
- Port-based streaming: Service Worker ↔ Side Panel via `chrome.runtime.connect`

#### Chrome Extension (MV3)
- Service worker with message router + stream handler
- Side Panel with full React 19 app
- Manifest v3 with permissions: `activeTab`, `tabs`, `debugger`, `sidePanel`, `storage`
- CRXJS + Vite build pipeline

#### UI Components
- `SidePanel` — root layout with header (logo, model badge, cost badge, new chat, settings)
- `SettingsView` — provider grid, model dropdown, API key input
- `InputBar` — auto-resizing textarea with Shift+Enter
- `MessageList` — scrollable chat with user/assistant bubbles
- `MarkdownRenderer` — code blocks with copy, headings, lists, inline formatting
- `CostBadge` — token count + USD cost display
- Generative UI: `DataTable`, `GenericCard`, `FallbackComponent`, `ComponentRegistry`

#### Browser Agent
- Chrome debugger CDP wrapper (`ExtBrowserController`)
- AX tree serializer: accessibility tree → Markdown+refs format
- Context builder with priority-based token budget allocation
- Agent tool definitions: `click`, `type`, `scroll`, `navigate`, `done`
- Agent system prompt with anti-hallucination rules
- Dual-mode routing: regular chat vs. page-aware queries

#### Security
- AES-256-GCM encryption module for API keys at rest
- Session-based key storage (ephemeral, wiped on browser close)
- `chrome.storage.session.setAccessLevel` for Side Panel access

#### Cost & Reliability
- Per-model pricing matrix (12 models across 3 providers)
- `CostTracker` with session budget enforcement
- `ProviderRouter` with automatic failover + retry on rate limits

#### Quality
- 23 unit tests (AX serializer, context builder, cost tracker)
- Message persistence via `chrome.storage.local`
- New Chat button with state reset
- Tab-targeting fix for accurate page context extraction
- README, HANDOFF, LEARNINGS, AGENTS documentation

## [0.2.0] — 2026-05-11

### Added

#### Agent Loop (Sprint 8)
- Multi-step agent execution: OBSERVE → THINK → ACT → repeat (max 5 steps)
- Tool call parser with JSON block + inline `ACTION:` fallback (109 LOC, 15 tests)
- Agent loop engine with page re-extraction between steps (170 LOC)
- Agent system prompt updated for structured JSON action blocks
- `executing_action` status indicator in Side Panel UI

#### Provider Router Integration (Sprint 8)
- `ProviderRouter` wired into service worker for cloud streams
- Dynamic route builder from stored API keys (primary + fallback chain)
- Auto-failover on HTTP 429/5xx with retry + linear backoff

### Fixed
- Anthropic adapter `promptTokens` always 0 — now captured from `message_start` event
- Link regex capture groups in MarkdownRenderer

### Improved

#### Markdown Renderer (Sprint 9)
- Table rendering with column alignment (left/center/right), scrollable overflow, striped hover rows
- Ordered list support (`1. item` → `<ol>` with accent counters)
- Blockquote rendering (`> text` → accent-bordered quote block)
- Horizontal rule rendering (`---` → gradient accent line)

## [0.3.0] — 2026-05-11

### Added

#### Multi-Conversation Support (Sprint 10)
- `createConversationStorage()` — CRUD layer with index + per-conversation keys in `chrome.storage.local`
- `ConversationDrawer` — slide-out panel with search, time-ago formatting, two-click delete confirmation
- Conversation switching with active ID tracking and debounced persistence
- Auto-titling from first user message (truncated to 60 chars)
- History hamburger button in Side Panel header
- 16 new unit tests for conversation storage (54 total)

## [0.4.0] — 2026-05-12

### Added

#### Enhanced Conversations (Sprint 11)
- LLM-generated conversation titles via background cloud-stream
- Conversation export (download all as JSON) and import (bulk restore)
- Conversation pinning — pin important chats to top of drawer
- IndexedDB migration prep in `createConversationStorage` structure

#### Native Bindings (Sprint 12)
- `NativeIPCProvider` — Tauri event/listen bridge
- `NativeStorageProvider` — `tauri-plugin-store` backed config + in-memory secure storage
- `NativeBrowserController` — CDP via WebSocket to `localhost:9222`

#### Tauri Desktop App (Sprint 13-14)
- Full `apps/desktop` scaffold with Vite + React + Tauri v2
- Tauri config with secure CSP allowing LLM API endpoints
- System tray icon with click-to-toggle visibility
- Global keyboard shortcut: `Cmd+Shift+Space` to show/hide
- Wave UI ported: SidePanel, ConversationDrawer, Settings, MarkdownRenderer
- Native agent loop using direct adapter calls (no Chrome ports)

## [0.5.0] — 2026-05-13

### Changed

#### Shared Hooks Refactor (Sprint 15)
- Extracted `useConversationManager` hook (239 LOC) — conversation lifecycle, settings, cost
- Extracted `chat-utils.ts` — `generateId()`, `isPageQuery()`, shared system prompts
- Refactored `sidepanel.tsx` from 569 → 356 LOC (-37%)
- Refactored `App.tsx` from 449 → 314 LOC (-30%)
- React added as peerDependency of `@wave/core`

### Documentation
- Project course audit with PRD alignment check
- PRD v0.4, SAD v0.3, HANDOFF v3, .context v2
- `SPRINT_PROMPTS.md` — detailed prompts for Sprint 16–20

## [0.6.0] — 2026-05-13

### Added

#### Agent Loop Hardening (Sprint 16)
- Error recovery per action: try/catch with error fed back to LLM
- `onActionConfirm` callback: pauses loop for user Allow/Deny before executing
- `onError` callback for action failure reporting
- Navigation wait: 2000ms post-navigate + `navigating` status
- `ActionConfirmation` component with Allow/Deny buttons
- `AgentStepIndicator` component for step visualization in chat
- MarkdownRenderer: AGENT_STEP comment parsing for embedded step indicators
- 8 new tests in `agent-loop.test.ts` (62 total)

#### Embedded Browser (Sprint 17)
- Split-pane layout: browser pane (70%) + chat sidebar (30%)
- `NavBar` component: URL input, Back/Forward/Refresh buttons
- Resizable divider with drag handler (min 320px, max 60%)
- Tauri Rust commands: `navigate_browser`, `get_browser_url`, `set_browser_bounds`
- `WebviewWindowBuilder` with parent binding to main window
- Window resized to 1280x800 for split-pane layout

#### CDP Auto-Attach (Sprint 18)
- `dom-extractor.ts`: 142 LOC JS injection script for webview DOM extraction
- `extractPageContextFromWebview()`: runs script via `eval_browser` IPC
- `executeActionInWebview()`: click/type/scroll/navigate via injected JS
- Cross-platform message bridge: `window.ipc`, `webkit.messageHandlers`, `chrome.webview`
- Fallback: WebSocket CDP still available for external Chrome
- `PageContext` type moved to `abstractions/cdp.ts`

#### Extension v1.0 Polish (Sprint 19)
- Branded icons: 16/32/48/128px PNG in manifest
- `OnboardingView`: 3-step flow (Welcome → Provider → API Key) with animated slides
- Keyboard shortcut: `Cmd+Shift+W` / `Ctrl+Shift+W` to open Side Panel
- `SettingsView` enhancements: key status indicators, model info, clear/test buttons
- `ErrorBoundary`: React error boundary with reload button
- Meta tags updated in `sidepanel.html`

#### Local SLM Router (Sprint 20)
- `LocalRouter` class: WebLLM integration with SmolLM2-360M-Instruct
- Intent classification: `chat` / `page_query` / `page_action` with confidence scores
- Keyword fallback when WebGPU unavailable or model not loaded
- `generateTitle()` for local auto-titling (saves cloud tokens)
- `ModelLoader` component: progress bar with skip button
- Desktop: uses local router for intent classification + auto-titling
- Extension: uses local router with background loading

### Known Issues
- 🔴 WebLLM bloats extension bundle to 6.2MB (2.2MB gzip) — needs code splitting
- Extension icons are identical 326KB files (not properly resized)
