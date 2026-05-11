# Wave — Knowledge Base Index & Walkthrough

> **Purpose:** Save tokens. Read this FIRST before opening any KB file.  
> Each entry has a relevance tag so you know what to skip.

---

## How to Use This Index

The Knowledge Base contains **23 research documents** (~7,000 lines total) from Waves 1–5.  
They are deep technical analyses, NOT code. The codebase has already consumed the relevant insights.

**Relevance tags:**
- 🟢 **ACTIVE** — Directly relevant to the current codebase. Read if working on that area.
- 🟡 **FUTURE** — Relevant when migrating to Tauri/native or adding local LLM.
- 🔴 **ARCHIVED** — Historical research. Already consumed. Skip unless deep-diving.

---

## Wave 5 — Current Phase (Chrome Extension MVP)

These directly informed the code that was built.

| File | Relevance | When to Read |
|------|-----------|-------------|
| `AI Chrome Extension MV3 Architecture.md` (361 lines) | 🟢 ACTIVE | Working on service worker, permissions, or MV3 lifecycle |
| `Unified LLM Streaming Abstraction Layer.md` (380 lines) | 🟢 ACTIVE | Modifying streaming adapters or adding new providers |
| `Agent Context Management & Token Budgeting.md` (407 lines) | 🟢 ACTIVE | Working on context builder, token limits, or AX tree serialization |
| `Portable Chrome Extension to Tauri Abstraction.md` (480 lines) | 🟡 FUTURE | Planning the Tauri migration (abstraction layer design) |
| `Multi-Tab Browser Agent Architecture.md` (196 lines) | 🟡 FUTURE | Building multi-tab agent orchestration |

### What's Already Extracted from Wave 5:
- MV3 service worker patterns → `background.ts`
- Session storage access level fix → `background.ts` line 22
- Stream adapter interface → `stream-provider.ts`
- SSE parsing per provider → `adapters/*.ts`
- Token budget priority system → `context-builder.ts`
- AX tree filtering rules → `ax-serializer.ts`
- Abstraction layer design → `packages/core/src/abstractions/`

---

## Wave 1–4 — Foundation Research

### 🟢 ACTIVE — Still relevant to current work

| File | Lines | What It Covers | When to Read |
|------|-------|---------------|-------------|
| `CDP Agent Action Patterns.md` | 384 | Chrome DevTools Protocol for clicks, typing, scrolling, navigation, waiting | Implementing the multi-step agent loop (Sprint 8) |
| `Hardened Accessibility Tree for Agents.md` | 366 | AX tree security, filtering, depth limits, ARIA role mapping | Improving AX tree accuracy or adding security filtering |
| `AI Streaming Pipeline Resilience Patterns.md` | 287 | Error recovery, retry logic, failover, mid-stream failure handling | Wiring `ProviderRouter` into service worker |

### 🟡 FUTURE — Relevant for Tauri/native migration

| File | Lines | What It Covers | When to Read |
|------|-------|---------------|-------------|
| `CEF vs. Custom Chromium Embedding.md` | 251 | CEF architecture vs building custom Chromium bindings | Choosing browser engine for Tauri shell |
| `Tauri + CEF Dev Workflow Optimization.md` | 302 | Hot reload, build optimization, debugging Tauri+CEF | Setting up the native development environment |
| `GPU Texture Sharing Across Platforms.md` | 393 | Zero-copy GPU sharing between Chromium and Rust | Optimizing rendering performance in native shell |
| `Distributing LLM Weights.md` | 310 | Packaging local models, delta updates, platform delivery | Shipping local models with the Tauri app |
| `GPU Memory for Browser LLM.md` | 267 | VRAM management, OOM handling, concurrent GPU tasks | Running local LLMs alongside browser rendering |
| `Agent Architecture: WebMCP & StoragePartition.md` | 255 | WebMCP protocol, isolated agent sessions | Adding proper session isolation for agents |

### 🟡 FUTURE — Relevant for Generative UI v2

| File | Lines | What It Covers | When to Read |
|------|-------|---------------|-------------|
| `A2UI Protocol Deep Dive.md` | 346 | Google's Agent-to-UI protocol specification | Migrating from custom tool calls to A2UI standard |
| `Streaming JSON Parser Comparison for LLM.md` | 203 | partial-json-parser, simdjson, custom NDJSON parsers | Optimizing streaming JSON parsing performance |
| `AI Browser State Management Architecture.md` | 334 | Zustand vs TanStack Store, dual-model state routing | Refactoring state management for multi-conversation |
| `Testing Generative UI Applications.md` | 235 | Snapshot testing, visual regression, streaming mocks | Writing comprehensive UI tests |

### 🔴 ARCHIVED — Already consumed or superseded

| File | Lines | What It Covers | Why Archived |
|------|-------|---------------|-------------|
| `SmolLM2 Router Prompt Engineering.md` | 358 | Local SLM for intent classification | Not using local models in extension MVP |
| `Vision Model for Browser Agent.md` | 226 | Vision-language models for page understanding | No vision API integrated yet |

---

## Root-Level Research Docs

These are broader strategic documents at the project root.

| File | Lines | Relevance | What It Covers |
|------|-------|-----------|---------------|
| `Decoupling Chromium Rendering Engine for AI Browser.md` | 224 | 🟡 FUTURE | OpenAI OWL architecture, headless Chromium, native shell design |
| `Local LLM Browser Inference Comparison.md` | 230 | 🟡 FUTURE | WebGPU vs native inference, model selection, performance benchmarks |
| `Generative UI Streaming Pipeline Design.md` | 201 | 🟢 ACTIVE | NDJSON streaming, component registry patterns, layout shift prevention |
| `Secure Autonomous Browser Agent Architecture.md` | 251 | 🟢 ACTIVE | Prompt injection, sandbox escapes, agent security model |

---

## Quick Decision Guide

**"I need to..."** → **Read this:**

| Task | File to Read |
|------|-------------|
| Fix streaming bugs | `Wave 5 / Unified LLM Streaming Abstraction Layer.md` |
| Improve page awareness | `Wave 5 / Agent Context Management & Token Budgeting.md` |
| Add multi-step agent actions | `Wave 1-4 / CDP Agent Action Patterns.md` |
| Fix AX tree accuracy | `Wave 1-4 / Hardened Accessibility Tree for Agents.md` |
| Add provider failover | `Wave 1-4 / AI Streaming Pipeline Resilience Patterns.md` |
| Plan Tauri migration | `Wave 5 / Portable Chrome Extension to Tauri Abstraction.md` |
| Add A2UI protocol | `Wave 1-4 / A2UI Protocol Deep Dive.md` |
| Add local LLM | `Root / Local LLM Browser Inference Comparison.md` |
| Improve security | `Root / Secure Autonomous Browser Agent Architecture.md` |
| Everything else | **Don't read KB — read HANDOFF.md and the code** |
