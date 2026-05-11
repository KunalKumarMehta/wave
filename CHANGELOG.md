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
