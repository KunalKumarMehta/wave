# PRD: Wave — AI-Native Browser

> **Version:** 0.3 (Updated 2026-05-12)  
> **Status:** Sprint 14 complete — Extension MVP + Tauri Desktop scaffold

---

## 1. Vision

Build an AI-native browser where artificial intelligence is the core interaction layer. The browser understands pages, takes actions, and generates rich UI — moving beyond static DOM rendering to an intelligent, agent-powered experience.

### Phased Approach
1. **Phase 1 ✅:** Chrome Extension MVP — Side Panel AI assistant with page awareness + agent loop
2. **Phase 2 ✅:** Multi-conversation, provider failover, Tauri desktop scaffold
3. **Phase 3 (Current):** Embedded browser view, local LLM, Chrome Web Store release

---

## 2. Core Objectives

| Objective | Target | Status |
|-----------|--------|--------|
| Multi-provider streaming | OpenAI, Anthropic, Gemini | ✅ Done (Sprint 2) |
| Page awareness via AX tree | Extract + serialize page structure | ✅ Done (Sprint 4) |
| Agent actions via CDP | Click, type, scroll, navigate | ✅ Done (Sprint 5) |
| Multi-step agent loop | Observe → Act → Re-observe cycle | ✅ Done (Sprint 8) |
| Provider failover | Auto-retry on 429/5xx | ✅ Wired (Sprint 8) |
| Generative UI components | DataTable, GenericCard, Markdown | ✅ Done (Sprint 3) |
| Cost tracking | Per-model pricing, budget enforcement | ✅ Done (Sprint 6) |
| Multi-conversation | Full CRUD, drawer, search, pin | ✅ Done (Sprint 10-11) |
| Tauri desktop scaffold | Native app with system tray + shortcuts | ✅ Done (Sprint 12-14) |
| Embedded browser view | Webview inside Tauri app | 🔲 Sprint 17 |
| Local LLM inference | WebGPU SLM for intent routing | 🔲 Sprint 20 |

---

## 3. Product Features

### 3.1. AI Chat Assistant ✅
- Real-time streaming responses from 3 cloud providers
- Markdown rendering: code blocks (with copy), headings, lists, tables, blockquotes, horizontal rules
- Multi-conversation support with auto-titling via LLM
- Conversation drawer with search, pinning, export/import
- New Chat button, cost badge, model indicator

### 3.2. Page Awareness ✅
- Automatic detection of page-aware queries (keyword matching)
- Chrome DevTools Protocol extraction of accessibility tree
- AX tree → Markdown+refs serialization (~93% token reduction)
- Priority-based context builder with token budget (8192 tokens)
- Page URL + title injected to prevent hallucination

### 3.3. Agent Loop ✅ (Multi-Step)
- **Observe → Think → Act → Re-observe** state machine (max 5 steps)
- Tool call parser: JSON blocks + inline `ACTION:` fallback
- Action execution via CDP with page re-extraction between steps
- Available actions: `click(ref)`, `type(ref, text)`, `scroll(direction)`, `navigate(url)`, `done(summary)`
- Status indicators: 🔍 Reading, 🧠 Analyzing, ⚡ Executing

### 3.4. Generative UI Components ✅
- `DataTable` — Structured data with sortable columns
- `GenericCard` — Info cards with title, content, footer
- `FallbackComponent` — Raw JSON display for unknown tool types
- `ComponentRegistry` — Tool-call name → component dispatch

### 3.5. Settings & Configuration ✅
- Provider grid (OpenAI, Anthropic, Gemini) with visual selection
- Model dropdown per provider (12 models)
- API key entry with session-based secure storage
- Persistent provider/model selection

### 3.6. Multi-Conversation ✅
- Conversation list in slide-out drawer
- chrome.storage.local persistence (Extension) / Tauri Store (Desktop)
- Full-text search across conversation titles
- Pinning, export/import, two-click delete
- LLM-generated titles from first user message

### 3.7. Desktop Application ✅ (Scaffold)
- Tauri v2 native app with React frontend
- System tray icon with click-to-toggle visibility
- Global keyboard shortcut: `Cmd+Shift+Space`
- Native storage via `tauri-plugin-store`
- CDP via WebSocket to Chrome `--remote-debugging-port=9222`

### 3.8. Embedded Browser View 🔲 (Sprint 17)
- Tauri WebviewWindow for managed browser pane
- Split-pane layout: browser view + chat sidebar
- Auto-attach CDP to managed webview
- No requirement for external Chrome instance

### 3.9. Local LLM Router 🔲 (Sprint 20)
- WebGPU inference via WebLLM
- Intent classification (page query vs. general chat)
- Offline auto-titling (replaces cloud LLM call)

---

## 4. Technical Constraints

| Constraint | Requirement |
|-----------|-------------|
| **Extension** | Chrome 116+ (Side Panel API), MV3 service worker |
| **Desktop** | macOS 12+, Windows 10+, Linux (Tauri v2 targets) |
| **Security** | API keys in session/ephemeral storage only. CDP shows visible banner. |
| **Performance** | Extension bundle < 250KB gzip. Desktop < 5MB installed. |
| **Privacy** | No telemetry. All data local. Keys never persisted to disk. |

---

## 5. Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Time to first token | < 500ms | ~800ms (Gemini) |
| AX tree extraction | < 200ms | ~150ms |
| Extension CSS bundle | < 20KB | 20.2KB |
| Test coverage (core) | > 80% | 54 tests (5 suites) |
| Provider support | 3+ | 3 (OpenAI, Anthropic, Gemini) |
| Agent loop steps | Up to 5 | Configurable, default 5 |
| Platforms | 2 | 2 (Extension + Desktop) |