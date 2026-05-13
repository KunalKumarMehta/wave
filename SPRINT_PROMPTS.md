# Wave — Sprint Prompts for Next Sessions

> Copy-paste the relevant sprint prompt into a new session to continue work.  
> Each prompt is self-contained — the agent should read HANDOFF.md first, then execute.

---

## How to Use

1. Start a new AI coding session in the `wave/` workspace
2. Paste the sprint prompt below
3. The agent will read context docs and execute the sprint

---

## Sprint 16 — Agent Loop Hardening

```
## Task: Sprint 16 — Agent Loop Hardening

Read HANDOFF.md, LEARNINGS.md, and AGENTS.md first. Then execute these changes:

### Context
The agent loop (`packages/core/src/domain/agent-loop.ts`, 188 LOC) works but has gaps:
- No error recovery if a single action fails mid-loop
- No user confirmation before executing actions
- Step history shown as plain `---` separators
- No timeout for `navigate()` (should wait for page load)

### Deliverables

#### 1. Error Recovery in Agent Loop
In `agent-loop.ts`, wrap the `onAction()` call in try/catch:
- If action fails, add error context to the loop history
- Let the LLM decide whether to retry or abort
- Don't crash the whole loop for one failed action
- Add an `onError` callback to `AgentLoopConfig`

#### 2. Action Confirmation UI
In `packages/ui-components/src/chat/ActionConfirmation.tsx`:
- Create a component that shows "Wave wants to: click 'Submit button'"
- Two buttons: ✅ Allow / ❌ Deny
- Add `onActionConfirm` callback to `AgentLoopConfig`
- If callback provided, pause before executing and wait for user response
- If callback not provided, auto-execute (backward compatible)

#### 3. Step Visualization
Replace the `---` separator between agent steps with a styled component:
- Show action type + target (e.g., "Clicked: Submit button [ref=e5]")
- Show step number (Step 1/5, Step 2/5...)
- Use a compact, visually distinct format (not a full chat bubble)
- Create `AgentStepIndicator.tsx` in `packages/ui-components/src/chat/`
- Style with `AgentStepIndicator.css`

#### 4. Navigation Wait
In `agent-loop.ts`, after `navigate()` action:
- Increase the sleep from 500ms to 2000ms
- Add a status update: "⏳ Waiting for page to load..."
- In the CDP handler (both `background.ts` and `App.tsx`):
  After `Page.navigate`, call `Page.loadEventFired` with a 5s timeout

#### 5. Tests
Add tests in `packages/core/tests/agent-loop.test.ts`:
- Mock adapter, onAction, getPageContext
- Test: loop stops on done()
- Test: loop respects maxSteps
- Test: error in action doesn't crash loop
- Test: isTerminalAction for done/navigate
- Aim for 8+ tests

### Success Criteria
- `pnpm --filter @wave/extension build` — clean
- `cd apps/desktop && npx vite build` — clean
- `cd packages/core && npx vitest run` — all passing (54 existing + new)
- Commit with message: `feat(sprint-16): agent loop hardening — error recovery, confirmation UI, step viz`
```

---

## Sprint 17 — Tauri Embedded Browser (WebviewWindow)

```
## Task: Sprint 17 — Embedded Browser View in Tauri Desktop App

Read HANDOFF.md, LEARNINGS.md, and the Tauri v2 skill (`.agents/skills/tauri-v2/SKILL.md`) first.

### Context
The Tauri desktop app (`apps/desktop`) is currently a chat-only sidebar (420x700px).
It connects to external Chrome via WebSocket CDP on port 9222.
The goal is to add an embedded browser view inside the Tauri window itself.

### Architecture
Use Tauri's WebviewWindow API to create a split-pane layout:
- LEFT: Browser view (managed Tauri webview, ~70% width)
- RIGHT: Chat sidebar (existing Wave UI, ~30% width)

### Deliverables

#### 1. Window Layout
In `apps/desktop/src-tauri/src/lib.rs`:
- Change main window to fullscreen-capable, larger default (1280x800)
- Create a second webview/webview-window for the browser pane
- Use Tauri v2 `WebviewWindowBuilder` to create the browser pane
- The browser pane loads a user-configurable URL (default: about:blank)

#### 2. Navigation Bar Component
Create `packages/ui-components/src/layout/NavBar.tsx`:
- URL input field with Enter-to-navigate
- Back / Forward / Refresh buttons
- Current URL display (synced from webview)
- Emit navigation events via IPC or callback

#### 3. Split Pane Layout
In `apps/desktop/src/App.tsx`:
- Restructure layout: `<div class="split-pane"><BrowserPane /><ChatSidebar /></div>`
- Browser pane takes 70% width, chat sidebar 30%
- Resizable divider between them
- Chat sidebar uses the existing SidePanel component

#### 4. Tauri Configuration
In `apps/desktop/src-tauri/tauri.conf.json`:
- Update CSP to allow loading external URLs in the browser webview
- Update window dimensions for split-pane layout
- Add necessary permissions in `capabilities/default.json`

#### 5. IPC Bridge
Create a Tauri command to get the current URL of the browser webview:
- `#[tauri::command] fn get_browser_url()`
- `#[tauri::command] fn navigate_browser(url: String)`
- Wire these into the frontend via `@tauri-apps/api/core` invoke()

### Important Notes
- Read the Tauri v2 skill FIRST — it has the exact API patterns
- WebviewWindow in Tauri v2 uses `WebviewWindowBuilder::new()`
- CSP for the browser webview must be permissive (it loads arbitrary sites)
- The chat sidebar CSP stays restrictive (only API endpoints)
- Do NOT use iframe — use Tauri's native webview management

### Success Criteria
- `cd apps/desktop && pnpm tauri dev` — shows split-pane with browser + chat
- Typing a URL in NavBar navigates the browser pane
- Chat sidebar still works (streaming, conversations, settings)
- Commit with message: `feat(sprint-17): embedded browser view — split-pane layout with WebviewWindow`
```

---

## Sprint 18 — CDP Auto-Attach to Managed Webview

```
## Task: Sprint 18 — CDP Auto-Attach to Managed Webview

Read HANDOFF.md and AGENTS.md first.

### Context
After Sprint 17, the desktop app has a split-pane with an embedded browser webview.
Currently, page awareness (AX tree extraction) requires Chrome running with `--remote-debugging-port=9222`.
The goal is to auto-attach CDP to the managed Tauri webview instead.

### Approach
Tauri's webview is backed by WKWebView (macOS) or WebView2 (Windows).
Neither natively supports CDP. Two options:

**Option A (Recommended): Use Tauri's webview eval + DOM access**
- Use `webview.eval()` to run JavaScript in the browser pane
- Extract a simplified DOM structure via `document.querySelectorAll()`
- Build an accessibility-like tree from DOM roles, aria labels, and element types
- This bypasses CDP entirely — no debug port needed

**Option B: Launch Chromium subprocess with CDP**
- Bundle a headless Chromium and connect via WebSocket
- Heavy dependency, large binary size
- Only if Option A proves insufficient

### Deliverables

#### 1. DOM Extraction Script
Create `packages/native-bindings/src/dom-extractor.ts`:
- Generate a JavaScript snippet that extracts interactive elements from the page
- Capture: tag, role, aria-label, text content, bounding box, input values
- Return as JSON string via `webview.eval()`
- Map to the same format as `serializeAXTree()` output

#### 2. Native Page Context
Update `packages/native-bindings/src/cdp.ts`:
- Add `extractPageContextFromWebview(webview)` method
- Uses `webview.eval()` to run the DOM extraction script
- Returns `PageContext` compatible with `agent-loop.ts`
- Falls back to WebSocket CDP if webview extraction fails

#### 3. Wire into Agent Loop
Update `apps/desktop/src/App.tsx`:
- `getPageContext()` uses the webview extraction instead of WebSocket CDP
- No more requirement for `--remote-debugging-port=9222`
- Agent loop works seamlessly with the embedded browser

#### 4. Action Execution via Webview
Update action handler:
- `click()`: Use `webview.eval()` to find element and `.click()` it
- `type()`: Use `webview.eval()` to focus and set value
- `scroll()`: Use `webview.eval()` with `window.scrollBy()`
- `navigate()`: Use Tauri command to navigate the webview

### Success Criteria
- Agent can "summarize this page" on the embedded browser WITHOUT `--remote-debugging-port`
- Agent actions (click, type) work on the embedded browser
- Falls back to WebSocket CDP for external Chrome
- Commit with message: `feat(sprint-18): webview DOM extraction — no CDP required for embedded browser`
```

---

## Sprint 19 — Extension v1.0 Polish

```
## Task: Sprint 19 — Chrome Extension v1.0 Polish

Read HANDOFF.md and .context.md first.

### Context
The Chrome Extension works but needs polish for a v1.0 release:
- Default Vite favicon, no branded icons
- No onboarding flow for first-time users
- No keyboard shortcuts
- Settings doesn't show which keys are set
- No error boundary

### Deliverables

#### 1. Extension Icons
- Generate icons using the image generation tool: Wave logo (◉ symbol) in accent purple (#6c63ff) on dark background
- Save as: 16x16, 32x32, 48x48, 128x128 PNG
- Add to `apps/extension/` and reference in `manifest.json`

#### 2. Onboarding
Create `packages/ui-components/src/layout/OnboardingView.tsx`:
- 3-step onboarding: Welcome → Choose Provider → Enter API Key
- Shows on first launch (check `chrome.storage.local` for `onboarded` flag)
- Animated slide transitions between steps
- Skip button available

#### 3. Keyboard Shortcuts
In `manifest.json`:
- Add `commands` section with `_execute_side_panel` shortcut
- Default: `Ctrl+Shift+W` (Windows) / `Cmd+Shift+W` (Mac)
- Add shortcut hint in the UI

#### 4. Settings Enhancements
In `SettingsView.tsx`:
- Show "✓ Key set" indicator next to providers that have API keys stored
- Add "Clear key" button per provider
- Add "Test connection" button that sends a minimal prompt to verify the key works
- Show model info: context window size, cost per 1K tokens

#### 5. Error Boundary
Create `packages/ui-components/src/layout/ErrorBoundary.tsx`:
- React error boundary wrapping the entire app
- Shows friendly error message with "Reload" button
- Logs error details to console

#### 6. Meta Tags
In `apps/extension/sidepanel.html`:
- Update title to "Wave — AI Browser Assistant"
- Add meta description
- Add favicon reference

### Success Criteria
- Extension has branded icons (visible in chrome://extensions)
- First-time users see onboarding flow
- Keyboard shortcut opens Side Panel
- Settings shows key status per provider
- Error boundary catches and displays crashes gracefully
- `pnpm --filter @wave/extension build` — clean
- Commit with message: `feat(sprint-19): extension v1.0 polish — icons, onboarding, shortcuts, error boundary`
```

---

## Sprint 20 — Local SLM Router (WebGPU)

```
## Task: Sprint 20 — Local SLM Intent Router

Read HANDOFF.md, KB_INDEX.md, and optionally:
- Knowledge Base/wave 1-4/SmolLM2 Router Prompt Engineering.md
- Knowledge Base/Local LLM Browser Inference Comparison.md

### Context
Currently, `isPageQuery()` uses keyword matching to detect page-aware queries.
This is brittle — "summarize" triggers agent mode even for "summarize recursion".
Replace with a local SLM that classifies intent with higher accuracy.

### Approach
Use WebLLM (https://webllm.mlc.ai/) to run a small model entirely in the browser/Tauri.
Target: SmolLM2-360M or Phi-3-mini (quantized to 4-bit, ~200MB).

### Deliverables

#### 1. WebLLM Integration
Create `packages/core/src/domain/local-router.ts`:
- Initialize WebLLM engine with chosen small model
- Classify intent: "chat" | "page_query" | "page_action"
- Use structured prompt: given user message, output JSON `{intent: "...", confidence: 0.95}`
- Fallback to keyword matching if WebLLM not loaded yet

#### 2. Model Loading UI
Create `packages/ui-components/src/layout/ModelLoader.tsx`:
- Progress bar for model download/initialization
- Shows "Loading local AI model..." on first use
- Persists model to IndexedDB cache after first download
- "Skip" button to use cloud-only mode

#### 3. Wire into Both Platforms
- Extension: Load in sidepanel.tsx, replace `isPageQuery()`
- Desktop: Load in App.tsx, replace `isPageQuery()`
- If model not loaded, fall back to keyword matching (graceful degradation)

#### 4. Auto-Titling
Use the local model for conversation auto-titling instead of cloud LLM:
- Saves API tokens on every new conversation
- Update `handleSend` in both platforms

### Important Notes
- WebLLM requires WebGPU — check `navigator.gpu` availability
- First load downloads ~200MB model — must show progress
- After first load, model cached in IndexedDB (instant subsequent loads)
- Do NOT block the UI during model loading — run in background

### Success Criteria
- Intent classification works: "what's on this page" → page_query, "explain recursion" → chat
- Model loads with progress indication
- Falls back to keywords if WebGPU unavailable
- Auto-titling uses local model
- Commit with message: `feat(sprint-20): local SLM router — WebGPU intent classification`
```

---

## Meta: Session Start Prompt

Use this generic prompt to start ANY session working on Wave:

```
## Continue Wave Development

Read these files in order before doing anything:
1. HANDOFF.md — current project state, file structure, bugs
2. .context.md — conventions, critical reminders
3. LEARNINGS.md — technical gotchas to avoid
4. KB_INDEX.md — only if you need to read research docs

Then check:
- `git log --oneline -5` to see recent commits
- `cd packages/core && npx vitest run` to verify tests pass
- `pnpm --filter @wave/extension build` to verify extension builds

After confirming everything is green, proceed with: [PASTE SPECIFIC SPRINT TASK]
```
