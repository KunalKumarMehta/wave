# PRD: Wave — AI-Native Browser

> **Version:** 0.5 (Updated 2026-05-13)  
> **Status:** Sprint 20 complete — full feature MVP, dual-platform

---

## 1. Vision

Build an AI-native browser where artificial intelligence is the core interaction layer. The browser understands pages, takes actions, and generates rich UI — moving beyond static DOM rendering to an intelligent, agent-powered experience.

### Phased Approach
1. **Phase 1 ✅ (Sprint 1–7):** Chrome Extension MVP — streaming chat, page awareness, cost tracking
2. **Phase 2 ✅ (Sprint 8–20):** Agent loop, multi-conversation, Tauri desktop, embedded browser, local LLM
3. **Phase 3 (Sprint 21+):** Performance, vision model, multi-tab, CI/CD, public release

---

## 2. Core Objectives

| Objective | Status |
|-----------|--------|
| Multi-provider streaming (OpenAI, Anthropic, Gemini) | ✅ Sprint 2 |
| Page awareness via AX tree | ✅ Sprint 4 |
| Agent actions via CDP (click, type, scroll, navigate) | ✅ Sprint 5 |
| Multi-step agent loop (observe→act→re-observe) | ✅ Sprint 8 |
| Provider failover (auto-retry 429/5xx) | ✅ Sprint 8 |
| Multi-conversation (CRUD, drawer, search, pin, export) | ✅ Sprint 10-11 |
| Tauri desktop scaffold + system tray + shortcuts | ✅ Sprint 12-14 |
| Shared hook architecture | ✅ Sprint 15 |
| Agent loop hardening (error recovery, confirmation UI) | ✅ Sprint 16 |
| Embedded browser (WebviewWindow split-pane) | ✅ Sprint 17 |
| CDP auto-attach (webview DOM extraction) | ✅ Sprint 18 |
| Extension v1.0 (icons, onboarding, shortcuts, error boundary) | ✅ Sprint 19 |
| Local LLM router (WebGPU intent classification) | ✅ Sprint 20 |
| Bundle optimization (code-split WebLLM) | 🔲 Sprint 21 |
| Desktop integration testing | 🔲 Sprint 22 |
| Screenshot + vision model fallback | 🔲 Sprint 23 |
| Multi-tab orchestration | 🔲 Sprint 24 |
| CI/CD pipeline | 🔲 Sprint 25 |

---

## 3. Product Features

### Implemented ✅

- **Chat**: 3 cloud providers, streaming, markdown (tables/code/lists/blockquotes)
- **Page Awareness**: AX tree + DOM extraction, token-budgeted context
- **Agent Loop**: Multi-step state machine, error recovery, action confirmation UI
- **Conversations**: CRUD, drawer, search, pin, export/import, LLM auto-titling
- **Desktop**: Split-pane (browser + chat), NavBar, resizable, WebviewWindow
- **Extension**: Icons, onboarding, keyboard shortcuts, error boundary
- **Local SLM**: WebGPU intent classification, local auto-titling
- **Cost Tracking**: Per-model pricing, session budget
- **Provider Failover**: Auto-retry on rate limits, chain routing

### Planned 🔲

- **Performance**: Code-split WebLLM (6MB → lazy loaded)
- **Vision Model**: Screenshot fallback for canvas/complex pages
- **Multi-Tab**: Open, switch, close tabs from agent
- **CI/CD**: GitHub Actions for test, build, release

---

## 4. Technical Constraints

| Constraint | Requirement |
|-----------|-------------|
| **Extension** | Chrome 116+ (Side Panel API), MV3 |
| **Desktop** | macOS 12+, Windows 10+ (Tauri v2) |
| **Security** | API keys ephemeral only. No disk persistence. |
| **Performance** | Extension < 300KB gzip (after Sprint 21). Desktop < 500KB. |
| **Privacy** | Zero telemetry. All data local. |

---

## 5. Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Time to first token | < 500ms | ~800ms (Gemini) |
| AX tree extraction | < 200ms | ~150ms |
| Extension bundle | < 300KB gzip | 🔴 2.2MB (needs Sprint 21) |
| Tests | > 60 | 62 (6 suites) |
| Providers | 3+ | 3 |
| Platforms | 2 | 2 (Extension + Desktop) |
| Source LOC | — | 9,383 |