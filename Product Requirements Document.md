# PRD: Wave — AI-Native Browser

> **Version:** 0.2 (Updated 2026-05-11)  
> **Status:** MVP Phase (Chrome Extension) — Sprints 1–7 complete

---

## 1. Vision

Build an AI-native browser where artificial intelligence is the core interaction layer. The browser understands pages, takes actions, and generates rich UI — moving beyond static DOM rendering to an intelligent, agent-powered experience.

### Phased Approach
1. **Phase 1 (Current):** Chrome Extension MVP — Side Panel AI assistant with page awareness
2. **Phase 2:** Multi-step agent loop — click, type, navigate autonomously
3. **Phase 3:** Tauri + CEF native shell — full browser with embedded AI

---

## 2. Core Objectives

| Objective | Target | Status |
|-----------|--------|--------|
| Multi-provider streaming | OpenAI, Anthropic, Gemini | ✅ Done |
| Page awareness via AX tree | Extract + serialize page structure | ✅ Done |
| Agent actions via CDP | Click, type, scroll, navigate | ✅ Built (not looped) |
| Generative UI components | DataTable, GenericCard, Markdown | ✅ Done |
| Cost tracking + failover | Per-model pricing, auto-retry | ✅ Done |
| Multi-step agent loop | Observe → Act → Re-observe cycle | 🔲 Sprint 8 |
| Conversation persistence | Multi-conversation + search | 🔲 Sprint 9 |
| Local LLM inference | WebGPU-based SLM for routing | 🔲 Phase 3 |
| Native browser shell | Tauri + CEF with embedded rendering | 🔲 Phase 3 |

---

## 3. Product Features

### 3.1. AI Chat Assistant ✅
- Real-time streaming responses from 3 cloud providers
- Markdown rendering: code blocks (with copy), headings, lists, bold/italic/links
- Conversation persistence across Side Panel reopens
- New Chat button to reset context
- Token count + cost tracking in header

### 3.2. Page Awareness ✅
- Automatic detection of page-aware queries ("summarize this page", "what's on this page")
- Chrome DevTools Protocol extraction of accessibility tree
- AX tree → Markdown+refs serialization (~93% token reduction)
- Priority-based context builder with token budget (8192 tokens)
- Page URL + title injected to prevent hallucination

### 3.3. Agent Actions ✅ (One-Shot)
- `click(ref)` — Click elements by accessibility ref
- `type(ref, text)` — Type into input fields
- `scroll(direction)` — Scroll the page
- `navigate(url)` — Navigate to URLs
- `done(summary)` — Signal task completion

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

### 3.6. Multi-Step Agent Loop 🔲 (Sprint 8)
- Parse LLM tool calls from response
- Execute action via CDP
- Re-extract AX tree after page mutation
- Feed result back to LLM
- Repeat until `done()` is called
- Human-in-the-loop confirmation for destructive actions

### 3.7. Multi-Conversation 🔲 (Sprint 9)
- Conversation list in sidebar
- IndexedDB storage via Dexie.js
- Full-text search across conversations
- Export/import conversations

### 3.8. Local LLM Router 🔲 (Phase 3)
- WebGPU-based SLM for intent classification
- Instant routing decision (page query vs. general chat)
- Offline capability for basic tasks

---

## 4. Technical Constraints

| Constraint | Requirement |
|-----------|-------------|
| **Platform** | Chrome 116+ (Side Panel API), MV3 service worker |
| **Security** | API keys in session storage only (ephemeral). CDP access shows visible banner. |
| **Performance** | Side Panel bundle < 250KB gzipped. Service worker < 20KB. |
| **Privacy** | No telemetry. All data stays in browser storage. API keys never leave the device except to the chosen provider. |
| **Permissions** | activeTab, tabs, debugger, sidePanel, storage (minimal viable set) |

---

## 5. Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Time to first token (streaming) | < 500ms | ~800ms (Gemini) |
| AX tree extraction time | < 200ms | ~150ms |
| Side Panel CSS bundle | < 15KB | 12.7KB |
| Test coverage (core) | > 80% | 23 tests (key modules) |
| Provider support | 3+ | 3 (OpenAI, Anthropic, Gemini) |