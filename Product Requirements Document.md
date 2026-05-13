# PRD: Wave — AI-Native Browser

> **Version:** 0.4 (Updated 2026-05-13)  
> **Status:** Sprint 15 complete — shared hooks refactor, dual-platform

---

## 1. Vision

Build an AI-native browser where artificial intelligence is the core interaction layer. The browser understands pages, takes actions, and generates rich UI — moving beyond static DOM rendering to an intelligent, agent-powered experience.

### Phased Approach
1. **Phase 1 ✅ (Sprint 1–7):** Chrome Extension MVP — streaming chat, page awareness, cost tracking
2. **Phase 2 ✅ (Sprint 8–15):** Agent loop, multi-conversation, Tauri desktop, shared hooks
3. **Phase 3 (Sprint 16–20):** Embedded browser, agent hardening, local LLM, v1.0 polish

---

## 2. Core Objectives

| Objective | Target | Status |
|-----------|--------|--------|
| Multi-provider streaming | OpenAI, Anthropic, Gemini | ✅ Sprint 2 |
| Page awareness via AX tree | Extract + serialize page structure | ✅ Sprint 4 |
| Agent actions via CDP | Click, type, scroll, navigate | ✅ Sprint 5 |
| Multi-step agent loop | Observe → Act → Re-observe (5 steps) | ✅ Sprint 8 |
| Provider failover | Auto-retry on 429/5xx | ✅ Sprint 8 |
| Multi-conversation | CRUD, drawer, search, pin, export | ✅ Sprint 10-11 |
| Tauri desktop scaffold | Native app + system tray + shortcuts | ✅ Sprint 12-14 |
| Shared hook architecture | useConversationManager across platforms | ✅ Sprint 15 |
| Agent loop hardening | Error recovery, confirmation UI | 🔲 Sprint 16 |
| Embedded browser view | WebviewWindow in Tauri | 🔲 Sprint 17 |
| CDP auto-attach | Webview extraction without debug port | 🔲 Sprint 18 |
| Extension v1.0 | Icons, onboarding, shortcuts | 🔲 Sprint 19 |
| Local LLM router | WebGPU intent classification | 🔲 Sprint 20 |

---

## 3. Product Features

### 3.1. AI Chat Assistant ✅
- Real-time streaming from 3 cloud providers (OpenAI, Anthropic, Gemini)
- Markdown: code blocks (copy), headings, lists, tables, blockquotes, HR
- Multi-conversation with CRUD, drawer, search, pinning, export/import
- LLM-generated conversation titles
- Cost badge (tokens + USD) in header

### 3.2. Page Awareness ✅
- Keyword-based page query detection
- CDP AX tree extraction with ~93% token reduction
- Priority-based context builder (8192 token budget)
- URL + title injection to prevent hallucination

### 3.3. Agent Loop ✅ (Multi-Step)
- Observe → Think → Act → Re-observe (max 5 steps)
- Tool call parser: JSON blocks + inline ACTION: fallback
- Actions: click, type, scroll, navigate, done
- Status indicators: 🔍 Reading, 🧠 Analyzing, ⚡ Executing

### 3.4. Dual Platform ✅
- **Chrome Extension**: Side Panel with port-based streaming
- **Tauri Desktop**: Native app with system tray + Cmd+Shift+Space shortcut
- **Shared hooks**: `useConversationManager` + `chat-utils` in `@wave/core`

### 3.5. Settings & Cost ✅
- Provider grid with 12 models
- Ephemeral API key storage (session/memory only)
- Per-model cost tracking with budget enforcement
- Provider auto-failover on rate limits

### 3.6. Agent Hardening 🔲 (Sprint 16)
- Error recovery per action step
- Action confirmation UI (Allow/Deny)
- Step visualization with action summaries
- Navigation wait with page load detection

### 3.7. Embedded Browser 🔲 (Sprint 17-18)
- Split-pane layout: browser (70%) + chat sidebar (30%)
- Tauri WebviewWindow for managed browser
- DOM extraction via webview.eval() (no CDP required)
- Navigation bar with URL input

### 3.8. Extension v1.0 🔲 (Sprint 19)
- Branded icons (16/32/48/128px)
- 3-step onboarding flow
- Keyboard shortcuts (Cmd+Shift+W)
- API key status indicators
- Error boundary

### 3.9. Local LLM Router 🔲 (Sprint 20)
- WebGPU inference (SmolLM2-360M or Phi-3-mini)
- Intent classification: chat / page_query / page_action
- Offline auto-titling
- Graceful fallback to keyword matching

---

## 4. Technical Constraints

| Constraint | Requirement |
|-----------|-------------|
| **Extension** | Chrome 116+ (Side Panel API), MV3 |
| **Desktop** | macOS 12+, Windows 10+ (Tauri v2) |
| **Security** | API keys ephemeral only. No disk persistence. |
| **Performance** | Extension < 250KB gzip. Desktop < 5MB installed. |
| **Privacy** | Zero telemetry. All data local. |

---

## 5. Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Time to first token | < 500ms | ~800ms (Gemini) |
| AX tree extraction | < 200ms | ~150ms |
| Extension CSS bundle | < 20KB | 20.2KB |
| Tests | > 60 | 54 (5 suites) |
| Providers | 3+ | 3 |
| Platforms | 2 | 2 (Extension + Desktop) |
| Source LOC | — | 7,526 |