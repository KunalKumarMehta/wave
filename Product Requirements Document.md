# PRD: Wave — AI-Native Browser

> **Version:** 0.6 (Updated 2026-05-13)  
> **Status:** Sprint 25 complete — feature-complete MVP, dual-platform

---

## 1. Vision

Build an AI-native browser where artificial intelligence is the core interaction layer. The browser understands pages, takes actions, and generates rich UI — moving beyond static DOM rendering to an intelligent, agent-powered experience.

### Phased Approach
1. **Phase 1 ✅ (Sprint 1–7):** Chrome Extension MVP
2. **Phase 2 ✅ (Sprint 8–25):** Agent loop, desktop app, embedded browser, tabs, vision, CI/CD
3. **Phase 3 (Sprint 26–30):** Polish, accessibility, v1.0 release

---

## 2. Feature Matrix

| Feature | Status | Sprint |
|---------|--------|--------|
| Multi-provider streaming (3 providers, 12 models) | ✅ | 2 |
| Page awareness via AX tree | ✅ | 4 |
| Agent actions (click, type, scroll, navigate) | ✅ | 5 |
| Multi-step agent loop (observe→act→re-observe, 5 steps) | ✅ | 8 |
| Provider failover (auto-retry 429/5xx) | ✅ | 8 |
| Multi-conversation (CRUD, drawer, search, pin, export) | ✅ | 10-11 |
| Tauri desktop + system tray + shortcuts | ✅ | 12-14 |
| Shared hook architecture | ✅ | 15 |
| Agent loop hardening (error recovery, confirmation UI) | ✅ | 16 |
| Embedded browser (WebviewWindow split-pane) | ✅ | 17 |
| CDP auto-attach (webview DOM extraction) | ✅ | 18 |
| Extension v1.0 (icons, onboarding, shortcuts, error boundary) | ✅ | 19 |
| Local LLM router (WebGPU intent classification) | ✅ | 20 |
| Bundle optimization (code-split WebLLM, ~90KB app-critical) | ✅ | 21 |
| Desktop integration tests | ✅ | 22 |
| Screenshot + vision model fallback | ✅ | 23 |
| Multi-tab orchestration (open, switch, close, list) | ✅ | 24 |
| CI/CD pipeline (GitHub Actions, version bumping) | ✅ | 25 |
| Proper icons + CSS polish + accessibility | 🔲 | 26 |
| Adapter hardening + vision E2E test | 🔲 | 27 |
| Conversation intelligence (search, edit, fork) | 🔲 | 28 |
| Keyboard-first UX + WCAG compliance | 🔲 | 29 |
| v1.0 release prep | 🔲 | 30 |

---

## 3. Technical Constraints

| Constraint | Requirement | Current |
|-----------|-------------|---------|
| Extension bundle | < 300KB gzip (app-critical) | ✅ ~90KB |
| Desktop bundle | < 500KB gzip (app-critical) | ✅ ~85KB |
| Extension | Chrome 116+ (Side Panel API), MV3 | ✅ |
| Desktop | macOS 12+, Windows 10+ (Tauri v2) | ✅ |
| Security | API keys ephemeral only | ✅ |
| Privacy | Zero telemetry, all data local | ✅ |

---

## 4. Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Time to first token | < 500ms | ~800ms (Gemini) |
| AX tree extraction | < 200ms | ~150ms |
| Extension app-critical | < 100KB gzip | ~90KB ✅ |
| Tests | > 60 | 62 (6 suites) ✅ |
| Providers | 3+ | 3 ✅ |
| Platforms | 2 | 2 ✅ |
| Source LOC | — | 10,759 |
| Files | — | 168 tracked |
| Commits | — | 22 |