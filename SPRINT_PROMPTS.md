# Wave — Sprint Prompts (Batch 2: Sprint 21–25)

> Copy-paste the relevant sprint prompt into a new session to continue work.  
> Each prompt is self-contained — the agent should read HANDOFF.md first, then execute.

---

## How to Use

1. Start a new AI coding session in the `wave/` workspace
2. Paste the sprint prompt below
3. The agent will read context docs and execute the sprint

---

## Sprint 21 — Performance: Code-Split WebLLM + Fix Bundle Bloat

```
## Task: Sprint 21 — Fix Bundle Size (CRITICAL)

Read HANDOFF.md first. Check current bundle sizes:
  pnpm --filter @wave/extension build
  cd apps/desktop && npx vite build

### Problem
The `@mlc-ai/web-llm` dependency (~6MB) is statically imported in:
- `packages/core/src/domain/local-router.ts` (line 1: `import * as webllm from '@mlc-ai/web-llm'`)
Both extension (6.2MB) and desktop (6.3MB) bundles are bloated.
Target: Extension < 300KB gzipped, Desktop < 500KB gzipped (excluding lazy-loaded model).

### Deliverables

#### 1. Dynamic Import WebLLM
In `packages/core/src/domain/local-router.ts`:
- Replace `import * as webllm from '@mlc-ai/web-llm'` with dynamic `import()`
- Load WebLLM only when `init()` is called (not at module level)
- Pattern:
  ```ts
  async init(onProgress?: (p: number) => void) {
    const webllm = await import('@mlc-ai/web-llm');
    this.engine = new webllm.MLCEngine();
    // ...
  }
  ```

#### 2. Code-Split Extension Bundle
In `apps/extension/vite.config.ts`:
- Add `rollupOptions.output.manualChunks` to split:
  - `vendor-webllm`: `@mlc-ai/web-llm` (lazy loaded)
  - `vendor-react`: `react`, `react-dom`
  - `core`: `@wave/core`
- Or simply ensure the dynamic import creates a separate chunk automatically

#### 3. Code-Split Desktop Bundle
In `apps/desktop/vite.config.ts`:
- Same chunking strategy as extension

#### 4. Fix Other Bundle Issues
- Remove `import './App.css'` duplicate (App.tsx line 24 — already imported on line 2)
- Remove unused `offscreen` permission from `apps/extension/manifest.json`
- Fix indentation in `apps/desktop/src/App.tsx` L274-297 (title generation block)

#### 5. Verify Final Sizes
After changes:
- `pnpm --filter @wave/extension build` — main chunk should be < 300KB gzipped
- `cd apps/desktop && npx vite build` — main chunk should be < 500KB gzipped
- WebLLM chunk should be separate and loaded only on demand

### Success Criteria
- Extension main JS < 300KB gzipped (not 2.2MB!)
- Desktop main JS < 500KB gzipped (not 2.2MB!)
- WebLLM loads lazily — no impact on initial page load
- All 62 tests still pass
- Both builds clean (no warnings except chunk size for lazy WebLLM chunk)
- Commit: `perf(sprint-21): code-split WebLLM — extension back to <300KB`
```

---

## Sprint 22 — Desktop Integration Testing

```
## Task: Sprint 22 — Desktop Browser + Agent Integration Testing

Read HANDOFF.md and AGENTS.md first.

### Context
The desktop app has a split-pane layout with an embedded Tauri WebviewWindow.
The DOM extractor (`dom-extractor.ts`) injects JS via `eval_browser` and reads
results via `browser-ipc` events. This pipeline has NEVER been tested end-to-end.

### Deliverables

#### 1. Integration Test Framework
Set up Tauri's test driver:
- Add `@tauri-apps/driver` or use Tauri's built-in test mode
- Create `apps/desktop/tests/` directory
- Configure test runner in `apps/desktop/package.json`

#### 2. Test: DOM Extraction
Create `apps/desktop/tests/dom-extraction.test.ts`:
- Load a known HTML page in the browser webview
- Run `extractPageContextFromWebview('browser')`
- Verify returned elements match expected DOM structure
- Test with: buttons, links, inputs, headings

#### 3. Test: Agent Actions via Webview
Create `apps/desktop/tests/agent-actions.test.ts`:
- Navigate browser to a test page with a form
- Execute `click()` on a button via `executeActionInWebview`
- Execute `type()` on an input field
- Verify DOM state changed after each action

#### 4. Test: NavBar Navigation
- Type URL in NavBar → verify browser webview navigates
- Click Back/Forward → verify navigation history works
- Verify URL display updates after navigation

#### 5. Test: Agent Loop End-to-End
Create `apps/desktop/tests/agent-loop-e2e.test.ts`:
- Load a simple page with a login form
- Ask agent: "Fill in the email field with test@example.com"
- Verify: agent extracts DOM → identifies input → types text → confirms done

#### 6. Static Test Page
Create `apps/desktop/test-fixtures/test-page.html`:
- Simple form: email input, password input, submit button
- Navigation links (Home, About, Contact)
- A heading and some text content
- Used as the target for integration tests

### Success Criteria
- At least 5 integration tests passing
- DOM extraction correctly identifies elements on test page
- Agent actions modify the page state
- Tests runnable via `cd apps/desktop && pnpm test`
- Commit: `test(sprint-22): desktop integration tests — DOM extraction, agent actions, e2e loop`
```

---

## Sprint 23 — Screenshot + Vision Model Fallback

```
## Task: Sprint 23 — Screenshot-Based Page Understanding

Read HANDOFF.md, AGENTS.md, and Knowledge Base/wave 5/ docs if needed.

### Context
The AX tree extraction works well for standard pages but fails on:
- Canvas-based apps (Google Maps, Figma, games)
- Complex SPAs with shadow DOM
- Pages with heavy dynamic rendering
For these, a screenshot + vision model provides better understanding.

### Deliverables

#### 1. Screenshot Capture
In `packages/native-bindings/src/cdp.ts`:
- Add `captureScreenshot(): Promise<string>` method
- For embedded webview: Use Tauri's `webview.eval('...')` to capture canvas
  OR use the `Page.captureScreenshot` CDP command for external Chrome
- Return base64-encoded PNG

In `packages/ext-bindings/src/cdp.ts`:
- Add `captureScreenshot(): Promise<string>`
- Use `chrome.debugger` + `Page.captureScreenshot` CDP command
- Detach after capture

#### 2. Vision-Aware Context Builder
In `packages/core/src/domain/context-builder.ts`:
- Add `.screenshot(base64Image: string)` method
- Constructs a multimodal message with image content
- Only for providers that support vision: OpenAI (gpt-4o), Anthropic (claude-3), Gemini (all)
- Reduces text context budget when screenshot is included

#### 3. Vision-Aware Adapters
Update the 3 adapters to handle multimodal messages:
- OpenAI: `{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }`
- Anthropic: `{ type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }`
- Gemini: `{ inlineData: { mimeType: "image/png", data: "..." } }`

#### 4. Fallback Logic in Agent Loop
In `packages/core/src/domain/agent-loop.ts`:
- After AX tree extraction, check if result has < 5 interactive elements
- If so, capture screenshot and use vision-aware context instead
- Status: "📸 Taking screenshot for visual analysis..."

#### 5. User Toggle
In `SettingsView.tsx`:
- Add toggle: "Use vision model for complex pages"
- Persist to storage
- Default: enabled

### Important Notes
- Vision API calls are more expensive — only use as fallback
- Screenshot size: resize to max 1024x768 before sending
- Keep AX tree as primary — only fall back to screenshot when tree is sparse
- Not all models support vision — check provider capabilities before sending

### Success Criteria
- Screenshot captured via both CDP and webview extraction
- Vision messages correctly formatted for all 3 providers
- Agent falls back to screenshot on sparse AX trees (< 5 elements)
- Toggle in settings to enable/disable
- `pnpm --filter @wave/extension build` — clean
- `cd apps/desktop && npx vite build` — clean
- Commit: `feat(sprint-23): screenshot + vision fallback — multimodal page understanding`
```

---

## Sprint 24 — Tab Management + Cross-Tab Workflows

```
## Task: Sprint 24 — Multi-Tab Orchestration

Read HANDOFF.md and AGENTS.md first.

### Context
Currently, the agent can only interact with ONE tab/page at a time.
For complex workflows like "compare prices on Amazon and eBay", the agent
needs to manage multiple tabs and switch between them.

### Deliverables

#### 1. Tab Manager
Create `packages/core/src/domain/tab-manager.ts`:
- Track open tabs with their IDs, URLs, and titles
- Methods: `openTab(url)`, `closeTab(id)`, `switchTab(id)`, `listTabs()`
- Maintain a `currentTabId` state

#### 2. Extension Tab Manager
In `packages/ext-bindings/src/tabs.ts`:
- Implement using `chrome.tabs` API
- `openTab(url)`: `chrome.tabs.create({ url })`
- `switchTab(id)`: `chrome.tabs.update(id, { active: true })`
- `listTabs()`: `chrome.tabs.query({})`
- Listen for `chrome.tabs.onRemoved` to clean up

#### 3. Desktop Tab Manager
In `packages/native-bindings/src/tabs.ts`:
- For embedded browser: manage via Tauri WebviewWindow
- `openTab(url)`: create new webview or navigate existing
- For external Chrome: use CDP `Target.createTarget`
- `listTabs()`: combine embedded + CDP targets

#### 4. Agent Tab Tools
In `packages/core/src/domain/agent-tools.ts`:
- Add tool definitions:
  - `open_tab(url)` — Open a new tab
  - `switch_tab(id)` — Switch to a specific tab
  - `close_tab(id)` — Close a tab
  - `list_tabs()` — Get all open tabs
- Update `tool-call-parser.ts` to handle these new actions

#### 5. Agent Loop Multi-Tab Support
In `packages/core/src/domain/agent-loop.ts`:
- Track `currentTabId` in loop state
- After `switch_tab`, extract page context from the new tab
- After `open_tab`, wait for load then switch to new tab
- Show tab switches in step visualization

#### 6. Tab Bar UI
Create `packages/ui-components/src/layout/TabBar.tsx`:
- Show open tabs as clickable pills below the NavBar (desktop only)
- Active tab highlighted
- Close button on each tab
- "+" button to open new tab

### Important Notes
- Extension already has tab access via `chrome.tabs` permission
- Desktop needs to handle both embedded webview AND external Chrome tabs
- Agent should see ALL tabs in its context (e.g., "Tab 1: Amazon.com, Tab 2: eBay.com")
- Max tabs: 10 (prevent runaway tab creation)

### Success Criteria
- Agent can "Open Amazon and eBay, then compare the price of iPhone 15"
- Tab bar shows open tabs in desktop app
- Extension lists available tabs correctly
- Tool parser handles open_tab, switch_tab, close_tab, list_tabs
- Commit: `feat(sprint-24): multi-tab orchestration — open, switch, close tabs from agent`
```

---

## Sprint 25 — CI/CD Pipeline

```
## Task: Sprint 25 — Automated Build Pipeline

Read HANDOFF.md first.

### Context
Currently builds are manual. We need:
1. CI: Lint + test + build on every push
2. CD: Produce distributable artifacts (Extension .zip, Desktop .dmg/.exe)

### Deliverables

#### 1. GitHub Actions: CI
Create `.github/workflows/ci.yml`:
- Trigger: push to main, PRs
- Jobs:
  - `test`: Run `cd packages/core && npx vitest run`
  - `build-extension`: Run `pnpm --filter @wave/extension build`
  - `build-desktop-frontend`: Run `cd apps/desktop && npx vite build`
  - `typecheck`: Run `pnpm -r typecheck` (all packages)
- Node 22, pnpm 10
- Cache pnpm store

#### 2. GitHub Actions: Desktop Release
Create `.github/workflows/release-desktop.yml`:
- Trigger: tag push (`v*`)
- Matrix: macOS, Windows, Linux
- Steps:
  - Install Rust + pnpm
  - `cd apps/desktop && pnpm tauri build`
  - Upload artifacts: .dmg (mac), .msi/.exe (win), .AppImage/.deb (linux)
- Use `tauri-apps/tauri-action@v0` for cross-platform builds

#### 3. GitHub Actions: Extension Release
Create `.github/workflows/release-extension.yml`:
- Trigger: tag push (`v*`)
- Steps:
  - Build extension
  - Zip `apps/extension/dist/` as `wave-extension-v{version}.zip`
  - Upload as release artifact
  - (Optional) Auto-publish to Chrome Web Store via API

#### 4. Quality Gates
In CI workflow:
- Bundle size check: fail if extension > 500KB gzipped (after Sprint 21 fix)
- Test count: fail if < 60 tests
- TypeScript: strict mode, no errors

#### 5. Local Pre-commit Hook
Create `.husky/pre-commit` (or simple script):
- Run `pnpm -r typecheck`
- Run `cd packages/core && npx vitest run`
- Block commit on failure

#### 6. Version Bumping
Create `scripts/bump-version.sh`:
- Update version in: package.json (root), apps/extension/manifest.json,
  apps/desktop/src-tauri/tauri.conf.json, apps/desktop/package.json
- Create git tag
- Usage: `./scripts/bump-version.sh 0.2.0`

### Success Criteria
- CI runs on push: tests, typecheck, build all pass
- Desktop release builds for macOS (at minimum)
- Extension release produces a .zip artifact
- `npm run ci` works locally as a pre-push check
- Commit: `ci(sprint-25): GitHub Actions — CI pipeline + release workflows`
```

---

## Meta: Session Start Prompt

Use this generic prompt to start ANY session working on Wave:

```
## Continue Wave Development

Read these files in order before doing anything:
1. HANDOFF.md — current project state, file structure, bugs, sprint history
2. .context.md — conventions, critical reminders
3. LEARNINGS.md — technical gotchas to avoid

Then verify the project compiles and tests pass:
  git log --oneline -5
  cd packages/core && npx vitest run
  pnpm --filter @wave/extension build

After confirming everything is green, proceed with: [PASTE SPECIFIC SPRINT TASK]
```
